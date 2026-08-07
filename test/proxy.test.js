import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// TRUST_PROXY decides what the rate limiter counts as "one client", so getting it
// wrong breaks in one of two opposite ways — and only one of them is visible in
// normal use:
//
//   unset behind a proxy -> every visitor arrives as the proxy's IP, so they all
//     share one bucket and the 11th login site-wide locks everyone out;
//   trusted with no proxy -> any caller can set X-Forwarded-For and get a fresh
//     bucket per request, so the limiter may as well not exist.
//
// This suite boots one server each way and pins both behaviours. It runs its own
// servers on their own ports and temp stores so its request budget is independent
// of the other suites' (the limiter is keyed per IP + path).

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TRUSTING_PORT = 24000 + Math.floor(Math.random() * 1000);
const DIRECT_PORT = 25000 + Math.floor(Math.random() * 1000);
const AUTH_LIMIT = 10; // keep in sync with authLimit in server/index.js
let servers = [];

async function boot(port, extraEnv) {
  const workDir = mkdtempSync(path.join(tmpdir(), "whisker-proxy-"));
  const proc = spawn(process.execPath, [path.join(ROOT, "server", "index.js")], {
    cwd: workDir,
    env: { ...process.env, PORT: String(port), ANTHROPIC_API_KEY: "", ELEVENLABS_API_KEY: "", STRIPE_SECRET_KEY: "", WEEKLY_EMAILS_INPROCESS: "", ...extraEnv },
    stdio: "ignore",
  });
  servers.push({ proc, workDir });
  for (let i = 0; i < 40; i++) {
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
const login = async (port, forwardedFor) => {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": forwardedFor },
    body: JSON.stringify({ email: "nobody@example.com", password: "wrongpassword" }),
  });
  return res.status;
};

before(async () => {
  await boot(TRUSTING_PORT, { TRUST_PROXY: "1" });
  await boot(DIRECT_PORT, { TRUST_PROXY: "" });
});

after(() => {
  for (const { proc, workDir } of servers) {
    proc?.kill();
    rmSync(workDir, { recursive: true, force: true });
  }
});

test("with TRUST_PROXY set, each forwarded client gets its own budget", async () => {
  // Spend one client's entire allowance.
  for (let i = 0; i < AUTH_LIMIT; i++) {
    assert.equal(await login(TRUSTING_PORT, "203.0.113.10"), 401, `attempt ${i + 1} should still be allowed`);
  }
  assert.equal(await login(TRUSTING_PORT, "203.0.113.10"), 429, "the 11th attempt from one client is refused");

  // A different client must be unaffected — this is the failure that would take
  // the whole site down: one busy visitor locking out everyone behind the proxy.
  assert.equal(await login(TRUSTING_PORT, "203.0.113.99"), 401, "a second client shares no budget with the first");
});

test("without TRUST_PROXY, a spoofed X-Forwarded-For cannot buy a fresh budget", async () => {
  // Every request claims a different origin. Since the header is not trusted,
  // they must all count against the same real socket address.
  let statuses = [];
  for (let i = 0; i <= AUTH_LIMIT; i++) statuses.push(await login(DIRECT_PORT, `198.51.100.${i}`));

  assert.deepEqual(statuses.slice(0, AUTH_LIMIT), Array(AUTH_LIMIT).fill(401));
  assert.equal(statuses[AUTH_LIMIT], 429, "rotating the header must not reset the limiter");
});
