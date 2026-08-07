import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The rate limiter counts per process, so two instances behind a load balancer
// would allow twice the intended rate — the limit silently scales with the
// instance count. server/store.js keeps the counters in Postgres when
// DATABASE_URL is set so every instance shares one window.
//
// This suite boots TWO servers, which is the only way to actually observe that:
// a single process cannot tell a shared counter from its own. It needs a real
// database, so it is skipped unless TEST_DATABASE_URL is set (CI provides one;
// see .github/workflows/main-ci.yml).
//
// Each test uses a fresh random client IP with TRUST_PROXY=1, so its bucket key
// is unique and neither repeated runs nor the other tests can interfere.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB = process.env.TEST_DATABASE_URL || "";
const AUTH_LIMIT = 10; // keep in sync with authLimit in server/index.js
const skip = DB ? false : "TEST_DATABASE_URL is not set (no Postgres available)";

const PORTS = { sharedA: 26000, sharedB: 26001, soloA: 26002, soloB: 26003 };
let servers = [];

const randomIp = () =>
  `10.${Math.floor(Math.random() * 254)}.${Math.floor(Math.random() * 254)}.${Math.floor(Math.random() * 254)}`;

async function boot(port, extraEnv) {
  const workDir = mkdtempSync(path.join(tmpdir(), "whisker-rl-"));
  const proc = spawn(process.execPath, [path.join(ROOT, "server", "index.js")], {
    cwd: workDir,
    env: {
      ...process.env,
      PORT: String(port),
      TRUST_PROXY: "1",
      ANTHROPIC_API_KEY: "",
      ELEVENLABS_API_KEY: "",
      STRIPE_SECRET_KEY: "",
      WEEKLY_EMAILS_INPROCESS: "",
      DATABASE_URL: "",
      ...extraEnv,
    },
    stdio: "ignore",
  });
  servers.push({ proc, workDir });
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server on ${port} did not start`);
}

// A failed login is the cheapest way to spend limiter budget: no account needed,
// and an unknown email is a plain 401 until the limiter takes over with a 429.
const login = async (port, ip) => {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ email: "nobody@example.com", password: "wrongpassword" }),
  });
  return res.status;
};

before(async () => {
  if (!DB) return;
  await Promise.all([
    boot(PORTS.sharedA, { DATABASE_URL: DB }),
    boot(PORTS.sharedB, { DATABASE_URL: DB }),
    boot(PORTS.soloA, {}),
    boot(PORTS.soloB, {}),
  ]);
});

after(() => {
  for (const { proc, workDir } of servers) {
    proc?.kill();
    rmSync(workDir, { recursive: true, force: true });
  }
});

test("two instances sharing a database share one rate-limit window", { skip }, async () => {
  const ip = randomIp();

  // Spend the entire budget against instance A.
  for (let i = 0; i < AUTH_LIMIT; i++) {
    assert.equal(await login(PORTS.sharedA, ip), 401, `attempt ${i + 1} on instance A should be allowed`);
  }

  // Instance B has served this client zero times, so its own in-memory counter
  // would happily allow another 10. Reading the shared counter, it must refuse.
  assert.equal(await login(PORTS.sharedB, ip), 429, "instance B must see instance A's spend");
});

test("without a shared database each instance keeps its own window", { skip }, async () => {
  // The control for the test above: same traffic, no DATABASE_URL. If this also
  // returned 429 the first test would prove nothing about sharing.
  const ip = randomIp();

  for (let i = 0; i < AUTH_LIMIT; i++) {
    assert.equal(await login(PORTS.soloA, ip), 401, `attempt ${i + 1} on instance A should be allowed`);
  }
  assert.equal(await login(PORTS.soloA, ip), 429, "instance A exhausts its own budget");
  assert.equal(await login(PORTS.soloB, ip), 401, "instance B has a separate budget when nothing is shared");
});

test("the shared window still refuses once exhausted, from either instance", { skip }, async () => {
  const ip = randomIp();

  for (let i = 0; i < AUTH_LIMIT; i++) await login(PORTS.sharedA, ip);
  // Alternating instances must not hand out extra budget in either direction.
  assert.equal(await login(PORTS.sharedB, ip), 429);
  assert.equal(await login(PORTS.sharedA, ip), 429);
  assert.equal(await login(PORTS.sharedB, ip), 429);
});

test("instances booting simultaneously against an empty database all reach Postgres", { skip }, async () => {
  // CREATE TABLE IF NOT EXISTS is not atomic, so concurrent first boots used to
  // race: one instance won, the rest failed the DDL and fell back to the FILE
  // store — still serving traffic, but on their own private copy of the data.
  // Deploys and scale-ups start instances together, so this was the normal path.
  //
  // Asserting "they share a rate-limit window" is the sharpest available probe:
  // an instance that quietly fell back would count in its own memory and allow
  // the request instead of refusing it.
  //
  // Detection is probabilistic — the losing instance has to lose a narrow window —
  // so this catches a regression across runs rather than on any single one. The
  // advisory lock in store.js is the deterministic fix; this is the tripwire.
  const pg = await import("pg");
  const Pool = pg.Pool || pg.default?.Pool;

  // A throwaway database, so this genuinely exercises the empty-schema path
  // without disturbing the servers the other tests are using.
  const dbName = `race_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const admin = new Pool({ connectionString: DB });
  await admin.query(`CREATE DATABASE ${dbName}`);
  const raceUrl = DB.replace(/\/[^/?]*(\?|$)/, `/${dbName}$1`);

  const before = servers.length;
  try {
    const ports = [26010, 26011, 26012, 26013, 26014];
    await Promise.all(ports.map((p) => boot(p, { DATABASE_URL: raceUrl })));

    const ip = randomIp();
    for (let i = 0; i < AUTH_LIMIT; i++) {
      assert.equal(await login(ports[0], ip), 401, `attempt ${i + 1} should be allowed`);
    }
    for (const p of ports.slice(1)) {
      assert.equal(await login(p, ip), 429, `instance on ${p} did not join the shared window`);
    }
  } finally {
    for (const s of servers.slice(before)) {
      s.proc?.kill();
      rmSync(s.workDir, { recursive: true, force: true });
    }
    servers = servers.slice(0, before);
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => {});
    await admin.end().catch(() => {});
  }
});
