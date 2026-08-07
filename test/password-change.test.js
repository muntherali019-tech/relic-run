import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../server/auth.js";

// The signup password policy can only ever protect NEW accounts. This suite
// covers the other half: telling an existing owner their password is weak or
// breached, and giving them a way to change it.
//
// It runs its own server on its own port and temp store. That is deliberate and
// load-bearing, not tidiness: the auth endpoints are rate-limited to 10 per
// 15 minutes per IP+path, server.test.js budgets its logins exactly and its last
// test spends the remainder proving the limiter fires. Adding logins there would
// break that test rather than this one.
//
// The weak-password account is seeded into the store BEFORE the server boots.
// Writing db.json afterwards would not work — the store reads the file once and
// serves from memory — and it cannot be created through the API, because signup
// now refuses exactly this password. That is the point: it models an account
// that predates the policy.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 28000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;

const WEAK = "iloveyou";           // on the local blocklist
const STRONG = "longenough1";      // passes every local rule
const REPLACEMENT = "brambly-otter-quilt";
const CRON_SECRET = "test-cron-secret";
let proc, workDir, legacyToken, strongToken;

const api = async (method, route, { token, body, query = "", headers = {} } = {}) => {
  const res = await fetch(BASE + route + query, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
};

const seedUser = (id, email, password, name) => {
  const { salt, hash } = hashPassword(password);
  return [id, { id, email, salt, hash, role: "parent", name, createdAt: Date.now(), referralCode: id.toUpperCase() }];
};

before(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), "whisker-pwchange-"));
  mkdirSync(path.join(workDir, "server", "data"), { recursive: true });
  writeFileSync(
    path.join(workDir, "server", "data", "db.json"),
    JSON.stringify({
      users: Object.fromEntries([
        seedUser("legacy", "legacy@example.com", WEAK, "Legacy Parent"),
        seedUser("strong", "strong@example.com", STRONG, "Strong Parent"),
        // Never signs in during this suite — the actual dormant case, and the
        // only kind the sweep exists for.
        seedUser("dormant", "dormant@example.com", WEAK, "Dormant Parent"),
      ]),
      children: {}, classes: {}, goals: {},
    }),
  );

  proc = spawn(process.execPath, [path.join(ROOT, "server", "index.js")], {
    cwd: workDir,
    env: { ...process.env, PORT: String(PORT), CRON_SECRET, ANTHROPIC_API_KEY: "", STRIPE_SECRET_KEY: "" },
    stdio: "ignore",
  });
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("server did not start");
});

after(() => {
  proc?.kill();
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

test("a weak password is reported at login but never blocks it", async () => {
  const r = await api("POST", "/api/auth/login", { body: { email: "legacy@example.com", password: WEAK } });

  // The sign-in MUST succeed. Locking someone out of the account is the only
  // route to the screen that fixes it would be worse than the weak password.
  assert.equal(r.status, 200, "a weak password must not lock the owner out");
  assert.ok(r.body.token, "still issues a working token");
  assert.match(r.body.passwordWarning, /too easy to guess/);
  legacyToken = r.body.token;
});

test("a good password logs in with no warning at all", async () => {
  const r = await api("POST", "/api/auth/login", { body: { email: "strong@example.com", password: STRONG } });
  assert.equal(r.status, 200);
  assert.equal(r.body.passwordWarning, null, "must not cry wolf on a fine password");
  strongToken = r.body.token;
});

test("changing a password needs the current one", async () => {
  // A stolen token alone must not be enough to take the account over.
  const r = await api("PUT", "/api/me/password", {
    token: legacyToken,
    body: { currentPassword: "notmypassword", newPassword: REPLACEMENT },
  });
  assert.equal(r.status, 401);
});

test("the new password goes through the same policy as signup", async () => {
  const weak = await api("PUT", "/api/me/password", {
    token: legacyToken, body: { currentPassword: WEAK, newPassword: "password1" },
  });
  assert.equal(weak.status, 400);
  assert.match(weak.body.error, /too easy to guess/);

  const short = await api("PUT", "/api/me/password", {
    token: legacyToken, body: { currentPassword: WEAK, newPassword: "sevench" },
  });
  assert.equal(short.status, 400);
  assert.match(short.body.error, /at least 8/);

  const same = await api("PUT", "/api/me/password", {
    token: legacyToken, body: { currentPassword: WEAK, newPassword: WEAK },
  });
  assert.equal(same.status, 400, "re-setting the same password is not a change");
});

test("a successful change rotates the token and ends every older session", async () => {
  // A second session for the same account, opened before the change — this
  // stands in for the attacker who had the leaked password.
  const other = await api("POST", "/api/auth/login", { body: { email: "legacy@example.com", password: WEAK } });
  assert.equal(other.status, 200);
  const otherToken = other.body.token;
  assert.equal((await api("GET", "/api/me", { token: otherToken })).status, 200, "second session works before the change");

  const changed = await api("PUT", "/api/me/password", {
    token: legacyToken, body: { currentPassword: WEAK, newPassword: REPLACEMENT },
  });
  assert.equal(changed.status, 200);
  assert.ok(changed.body.token, "hands back a fresh token");

  // If the old password leaked, changing it has to end the sessions opened with
  // it — otherwise the change is cosmetic for as long as those tokens live.
  assert.equal((await api("GET", "/api/me", { token: otherToken })).status, 401, "the other session must be signed out");
  assert.equal((await api("GET", "/api/me", { token: legacyToken })).status, 401, "the caller's own old token dies too");
  assert.equal((await api("GET", "/api/me", { token: changed.body.token })).status, 200, "the returned token works");

  // Another account's sessions are untouched.
  assert.equal((await api("GET", "/api/me", { token: strongToken })).status, 200, "unrelated sessions survive");
});

test("the replacement password is the one that logs in from now on", async () => {
  const old = await api("POST", "/api/auth/login", { body: { email: "legacy@example.com", password: WEAK } });
  assert.equal(old.status, 401);

  const fresh = await api("POST", "/api/auth/login", { body: { email: "legacy@example.com", password: REPLACEMENT } });
  assert.equal(fresh.status, 200);
  assert.equal(fresh.body.passwordWarning, null, "and the warning is gone");
});

/* ---------- dormant-account sweep ---------- */

// A stored scrypt hash cannot be tested against a breach corpus — that is what
// hashing is for. So the sweep does the only achievable thing: it reports which
// accounts have never had their password examined, and (when enabled) asks
// their owner to sign in so the login-time check can run. These tests pin the
// coverage arithmetic and the no-send-by-default posture.

test("the sweep reports coverage and sends nothing by default", async () => {
  const r = await api("POST", "/api/cron/password-sweep", { headers: { "x-cron-secret": CRON_SECRET } });
  assert.equal(r.status, 200);
  assert.equal(r.body.accounts, 3);

  // legacy and strong have signed in; dormant never has, so its password has
  // never been examined and — being a stored scrypt hash — never can be except
  // by its owner typing it at us.
  assert.equal(r.body.neverChecked, 1, "the dormant account is the uncovered one");
  assert.equal(r.body.checked, 2);
  assert.equal(r.body.stale, 1, "never-checked counts as stale");
  assert.equal(r.body.due, 1, "it is due a prompt");

  // The nudge is opt-in. Without PASSWORD_SWEEP=1 this reports and stops.
  assert.equal(r.body.emailed, 0);
  assert.equal(r.body.sent, false);
});

test("signing in moves an account out of the dormant set", async () => {
  // This is the whole mechanism: the sweep cannot test the password, it can only
  // get the owner to a login, where the real check runs.
  const before = await api("POST", "/api/cron/password-sweep", { query: "?dry=1", headers: { "x-cron-secret": CRON_SECRET } });
  assert.equal(before.body.neverChecked, 1);

  const login = await api("POST", "/api/auth/login", { body: { email: "dormant@example.com", password: WEAK } });
  assert.equal(login.status, 200);
  assert.match(login.body.passwordWarning, /too easy to guess/, "and the check finally runs");

  const after = await api("POST", "/api/cron/password-sweep", { query: "?dry=1", headers: { "x-cron-secret": CRON_SECRET } });
  assert.equal(after.body.neverChecked, 0, "no longer unknown");
  assert.equal(after.body.stale, 0);
  assert.equal(after.body.due, 0);
});

test("a brand-new signup is not dormant — its password was checked on the way in", async () => {
  const r = await api("POST", "/api/auth/signup", { body: { email: "fresh@example.com", password: "brambly-otter-quilt-2" } });
  assert.equal(r.status, 200);

  const sweep = await api("POST", "/api/cron/password-sweep", { query: "?dry=1", headers: { "x-cron-secret": CRON_SECRET } });
  assert.equal(sweep.body.accounts, 4);
  assert.equal(sweep.body.neverChecked, 0);
  assert.equal(sweep.body.staleAfterDays, 180);
});

test("the sweep endpoint is gated on the cron secret", async () => {
  // It reads every account's password-check state, so an open endpoint would
  // hand an attacker a map of which accounts have never been examined.
  assert.equal((await api("POST", "/api/cron/password-sweep")).status, 401);
  assert.equal((await api("POST", "/api/cron/password-sweep", { headers: { "x-cron-secret": "wrong" } })).status, 401);
  assert.equal((await api("POST", "/api/cron/password-sweep", { headers: { "x-cron-secret": CRON_SECRET } })).status, 200);
});
