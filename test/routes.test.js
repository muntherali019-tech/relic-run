import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// server.test.js covers auth, child access control and cascade deletes. This
// suite covers the rest of the API that had no coverage at all: goals, classes,
// the family leaderboard, referrals, prefs, and the operational endpoints
// (TTS, cron, admin, Stripe portal/webhook).
//
// It runs its own server on its own port and temp store so its request budget
// is independent of server.test.js's — the auth endpoints are rate-limited per
// IP+path, and sharing a server would make the two files interfere.
//
// ADMIN_SECRET and CRON_SECRET are set so the gating on those routes is
// exercised in both directions. No AI, email or Stripe keys are set, so those
// integrations take their "not configured" path and nothing leaves the process.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 20000 + Math.floor(Math.random() * 2000);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_SECRET = "test-admin-secret";
const CRON_SECRET = "test-cron-secret";
let proc, workDir;

const api = async (method, route, { token, body, headers = {} } = {}) => {
  const res = await fetch(BASE + route, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
};

before(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), "whisker-routes-"));
  proc = spawn(process.execPath, [path.join(ROOT, "server", "index.js")], {
    cwd: workDir,
    env: {
      ...process.env,
      PORT: String(PORT),
      ADMIN_SECRET,
      CRON_SECRET,
      ANTHROPIC_API_KEY: "",
      ELEVENLABS_API_KEY: "",
      STRIPE_SECRET_KEY: "",
      WEEKLY_EMAILS_INPROCESS: "",
    },
    stdio: "ignore",
  });
  let up = false;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) { up = true; break; } } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!up) throw new Error("server did not start");

  // Shared fixtures, set up here so the whole file sees one consistent world.
  parent = await signup("goals-parent@example.com");
  otherParent = await signup("goals-other@example.com");
  teacher = await signup("goals-teacher@example.com", "teacher");
  const child = await api("POST", "/api/children", {
    token: parent.token,
    body: { name: "Bean", ks: "ks2" },
  });
  childId = child.body.child.id;
});

after(() => {
  proc?.kill();
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

const signup = async (email, role = "parent", extra = {}) => {
  const r = await api("POST", "/api/auth/signup", {
    body: { email, password: "longenough1", role, name: email.split("@")[0], ...extra },
  });
  assert.equal(r.status, 200, `signup failed for ${email}: ${JSON.stringify(r.body)}`);
  return r.body;
};

let parent, otherParent, teacher, childId;

/* ---------- goals ---------- */

test("a goal can be created, listed, updated, marked and deleted by its author", async () => {
  const created = await api("POST", `/api/children/${childId}/goals`, {
    token: parent.token,
    body: { title: "Learn times tables", detail: "up to 12", subject: "maths" },
  });
  assert.equal(created.status, 200);
  const goal = created.body.goal;
  assert.equal(goal.title, "Learn times tables");
  assert.equal(goal.status, "open");
  assert.deepEqual(goal.marks, []);

  const listed = await api("GET", `/api/children/${childId}/goals`, { token: parent.token });
  assert.equal(listed.status, 200);
  assert.ok(listed.body.goals.some((g) => g.id === goal.id));

  const patched = await api("PATCH", `/api/goals/${goal.id}`, {
    token: parent.token,
    body: { status: "done" },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.goal.status, "done");

  const marked = await api("POST", `/api/goals/${goal.id}/mark`, {
    token: parent.token,
    body: { comment: "Nice work", correct: true },
  });
  assert.equal(marked.status, 200);
  assert.equal(marked.body.goal.marks.length, 1);
  assert.equal(marked.body.goal.marks[0].comment, "Nice work");

  const deleted = await api("DELETE", `/api/goals/${goal.id}`, { token: parent.token });
  assert.equal(deleted.status, 200);

  const after = await api("GET", `/api/children/${childId}/goals`, { token: parent.token });
  assert.ok(!after.body.goals.some((g) => g.id === goal.id));
});

test("a goal requires a title", async () => {
  const r = await api("POST", `/api/children/${childId}/goals`, {
    token: parent.token,
    body: { detail: "no title here" },
  });
  assert.equal(r.status, 400);
});

test("goal edits are refused for a stranger and for a missing goal", async () => {
  const created = await api("POST", `/api/children/${childId}/goals`, {
    token: parent.token,
    body: { title: "Private goal" },
  });
  const id = created.body.goal.id;

  assert.equal((await api("PATCH", `/api/goals/${id}`, { token: otherParent.token, body: { status: "done" } })).status, 403);
  assert.equal((await api("POST", `/api/goals/${id}/mark`, { token: otherParent.token, body: {} })).status, 403);
  assert.equal((await api("DELETE", `/api/goals/${id}`, { token: otherParent.token })).status, 403);

  assert.equal((await api("PATCH", "/api/goals/no-such-goal", { token: parent.token, body: {} })).status, 404);
  assert.equal((await api("DELETE", "/api/goals/no-such-goal", { token: parent.token })).status, 404);
});

test("listing goals for someone else's child is refused", async () => {
  const r = await api("GET", `/api/children/${childId}/goals`, { token: otherParent.token });
  assert.equal(r.status, 403);
});

/* ---------- classes ---------- */

test("a teacher sees their own classes; the route is closed to parents", async () => {
  const created = await api("POST", "/api/classes", { token: teacher.token, body: { name: "Class 3B" } });
  assert.equal(created.status, 200);

  const mine = await api("GET", "/api/classes", { token: teacher.token });
  assert.equal(mine.status, 200);
  const cls = mine.body.classes.find((c) => c.id === created.body.class.id);
  assert.ok(cls, "the teacher's own class is listed");
  assert.ok(Array.isArray(cls.pupils));

  // Parents don't get an empty list — the route is teacher-only.
  assert.equal((await api("GET", "/api/classes", { token: parent.token })).status, 403);
  assert.equal((await api("GET", "/api/classes")).status, 401);
});

test("only the owning teacher may add pupils", async () => {
  const cls = (await api("POST", "/api/classes", { token: teacher.token, body: { name: "Class 4A" } })).body.class;
  const other = await signup("other-teacher@example.com", "teacher");

  assert.equal((await api("POST", `/api/classes/${cls.id}/pupils`, { token: other.token, body: { name: "Nope", ks: "ks2" } })).status, 403);
  assert.equal((await api("POST", `/api/classes/${cls.id}/pupils`, { token: parent.token, body: { name: "Nope", ks: "ks2" } })).status, 403);

  const ok = await api("POST", `/api/classes/${cls.id}/pupils`, { token: teacher.token, body: { name: "Ada", ks: "ks2" } });
  assert.equal(ok.status, 200);
});

test("joining a class requires a real code", async () => {
  const bad = await api("POST", `/api/children/${childId}/join-class`, {
    token: parent.token,
    body: { code: "NOTACODE" },
  });
  assert.ok(bad.status >= 400, "an unknown class code must not silently succeed");
});

/* ---------- leaderboard ---------- */

test("a child with no class gets a family-scoped leaderboard", async () => {
  const solo = await signup("solo-parent@example.com");
  const kid = (await api("POST", "/api/children", { token: solo.token, body: { name: "Solo", ks: "ks1" } })).body.child;

  const board = await api("GET", `/api/leaderboard?childId=${kid.id}`, { token: solo.token });
  assert.equal(board.status, 200);
  assert.equal(board.body.scope, "family");
  assert.ok(board.body.board.some((row) => row.you === true), "the child is marked as `you`");
});

test("the leaderboard refuses a child you cannot access", async () => {
  const r = await api("GET", `/api/leaderboard?childId=${childId}`, { token: otherParent.token });
  assert.equal(r.status, 404);
});

/* ---------- referrals ---------- */

test("a referred signup credits both sides exactly once", async () => {
  const referrer = await signup("referrer@example.com");
  const code = referrer.user.referralCode;
  assert.ok(code, "every account gets a referral code");

  const friend = await signup("friend@example.com", "parent", { ref: code });

  // Nothing is granted until the referred account qualifies.
  const early = await api("POST", "/api/referral/claim", { token: friend.token, body: {} });
  assert.equal(early.body.bonus, 0, "no bonus before qualifying");

  const qualified = await api("POST", "/api/referral/qualify", { token: friend.token, body: {} });
  assert.equal(qualified.status, 200);
  assert.equal(qualified.body.credited, true);

  // Qualifying twice must not pay out twice — this is the anti-farming rule.
  const again = await api("POST", "/api/referral/qualify", { token: friend.token, body: {} });
  assert.equal(again.body.credited, false);

  const friendBonus = await api("POST", "/api/referral/claim", { token: friend.token, body: {} });
  assert.equal(friendBonus.body.bonus, 50);

  const referrerBonus = await api("POST", "/api/referral/claim", { token: referrer.token, body: {} });
  assert.equal(referrerBonus.body.bonus, 50, "the referrer is paid too");

  // Claiming drains the balance.
  assert.equal((await api("POST", "/api/referral/claim", { token: friend.token, body: {} })).body.bonus, 0);
});

test("an account with no referrer never qualifies", async () => {
  const r = await api("POST", "/api/referral/qualify", { token: parent.token, body: {} });
  assert.equal(r.body.credited, false);
});

test("an unknown referral code is ignored rather than failing signup", async () => {
  const r = await signup("noref@example.com", "parent", { ref: "MADEUPCODE" });
  assert.ok(r.token);
  assert.equal((await api("POST", "/api/referral/qualify", { token: r.token, body: {} })).body.credited, false);
});

/* ---------- prefs ---------- */

test("weekly-email preference round-trips and ignores junk", async () => {
  const on = await api("PUT", "/api/me/prefs", { token: parent.token, body: { weeklyEmail: true } });
  assert.equal(on.status, 200);
  assert.equal(on.body.user.weeklyEmail, true);

  const off = await api("PUT", "/api/me/prefs", { token: parent.token, body: { weeklyEmail: false } });
  assert.equal(off.body.user.weeklyEmail, false);

  // A non-boolean must not clobber the stored value.
  const junk = await api("PUT", "/api/me/prefs", { token: parent.token, body: { weeklyEmail: "yes please" } });
  assert.equal(junk.body.user.weeklyEmail, false);
});

test("prefs require a token", async () => {
  assert.equal((await api("PUT", "/api/me/prefs", { body: { weeklyEmail: true } })).status, 401);
});

/* ---------- operational endpoints ---------- */

test("TTS reports a missing key rather than calling out", async () => {
  const r = await api("POST", "/api/tts", { body: { text: "hello" } });
  assert.equal(r.status, 500);
  assert.match(r.body.error, /ELEVENLABS_API_KEY/);
});

test("the password sweep is gated on the cron secret", async () => {
  // Same gate as the weekly report. Worth its own case: the sweep reads every
  // account's password-check state, so an open endpoint would hand an attacker
  // a map of which accounts have never been examined.
  assert.equal((await api("POST", "/api/cron/password-sweep", { body: {} })).status, 401);
  assert.equal(
    (await api("POST", "/api/cron/password-sweep", { body: {}, headers: { "x-cron-secret": "wrong" } })).status,
    401
  );

  const ok = await api("POST", "/api/cron/password-sweep", {
    body: {},
    headers: { "x-cron-secret": CRON_SECRET },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ok, true);
  assert.equal(typeof ok.body.accounts, "number");
  assert.equal(ok.body.sent, false, "PASSWORD_SWEEP is unset in tests, so nothing is emailed");
});

test("the weekly-report cron is gated on its secret", async () => {
  assert.equal((await api("POST", "/api/cron/weekly-reports", { body: {} })).status, 401);
  assert.equal(
    (await api("POST", "/api/cron/weekly-reports", { body: {}, headers: { "x-cron-secret": "wrong" } })).status,
    401
  );

  const ok = await api("POST", "/api/cron/weekly-reports", {
    body: {},
    headers: { "x-cron-secret": CRON_SECRET },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ok, true);
  assert.equal(typeof ok.body.sent, "number");
});

test("the admin report is gated on its secret and needs a real parent", async () => {
  assert.equal((await api("GET", "/api/admin/report?email=x@y.z")).status, 401);
  assert.equal(
    (await api("GET", "/api/admin/report?email=x@y.z", { headers: { "x-admin-secret": "wrong" } })).status,
    401
  );
  assert.equal(
    (await api("GET", "/api/admin/report?email=nobody@example.com", { headers: { "x-admin-secret": ADMIN_SECRET } })).status,
    404
  );

  const ok = await api("GET", `/api/admin/report?email=${parent.user.email}`, {
    headers: { "x-admin-secret": ADMIN_SECRET },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.to, parent.user.email);
  assert.ok(ok.body.subject);
  assert.ok(ok.body.html.includes("<"), "the digest renders HTML");
});

test("the Stripe portal reports that Stripe is not configured", async () => {
  const r = await api("POST", "/api/stripe/portal", { token: parent.token, body: {} });
  assert.equal(r.status, 503);
});

test("the Stripe webhook rejects an unsigned payload even with no secret configured", async () => {
  // This server runs without STRIPE_WEBHOOK_SECRET, which used to make signature
  // verification return true and process the event anyway. A forged
  // checkout.session.completed naming your own uid was enough to grant yourself
  // a paid plan, so verification must fail closed.
  const forged = {
    type: "checkout.session.completed",
    data: { object: { client_reference_id: parent.user.id, metadata: { uid: parent.user.id, plan: "family" } } },
  };
  const res = await fetch(`${BASE}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(forged),
  });
  assert.equal(res.status, 400, "an unsigned webhook must never be accepted");

  // ...and the forged upgrade must not have landed.
  const me = await api("GET", "/api/me", { token: parent.token });
  assert.equal(me.body.user.subs.junior, false, "no plan may be granted by an unsigned webhook");
  assert.equal(me.body.user.subs.adult, false);
});

test("the Stripe webhook rejects a malformed signature header", async () => {
  for (const sig of ["", "garbage", "t=123", "v1=abc"]) {
    const res = await fetch(`${BASE}/api/stripe/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": sig },
      body: JSON.stringify({ type: "checkout.session.completed", data: { object: {} } }),
    });
    assert.equal(res.status, 400, `should reject signature ${JSON.stringify(sig)}`);
  }
});

test("the plan catalog is public and hides internal env-var names", async () => {
  const r = await api("GET", "/api/plans");
  assert.equal(r.status, 200);
  assert.ok(r.body.plans.length > 0);
  assert.ok(r.body.plans.every((p) => !("priceEnv" in p)));
});
