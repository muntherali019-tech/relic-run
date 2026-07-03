import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Boots the real server in a temp working directory (the JSON store writes to
// <cwd>/server/data) and exercises the API over HTTP. No secrets are needed —
// the server runs in demo mode. Auth endpoints are rate-limited to 10 requests
// per 15 minutes per IP+path, so the counts here are budgeted deliberately:
// signup is called 5 times, login 11 times (the 11th proves the limiter).

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 18000 + Math.floor(Math.random() * 2000);
const BASE = `http://127.0.0.1:${PORT}`;
let proc, workDir;

const api = async (method, route, { token, body } = {}) => {
  const res = await fetch(BASE + route, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, body: json };
};

before(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), "whisker-test-"));
  proc = spawn(process.execPath, [path.join(ROOT, "server", "index.js")], {
    cwd: workDir,
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
  });
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("server did not start");
});

after(() => {
  proc?.kill();
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

let parentA, parentB, teacher, childId, goalId, classCode, classId;

test("health endpoint reports demo mode", async () => {
  const r = await api("GET", "/api/health");
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
});

test("signup rejects short passwords and bad roles", async () => {
  const short = await api("POST", "/api/auth/signup", { body: { email: "short@example.com", password: "tiny" } });
  assert.equal(short.status, 400);
  const badRole = await api("POST", "/api/auth/signup", { body: { email: "role@example.com", password: "longenough1", role: "admin" } });
  assert.equal(badRole.status, 400);
});

test("parents and teachers can sign up and receive tokens", async () => {
  const a = await api("POST", "/api/auth/signup", { body: { email: "parenta@example.com", password: "longenough1", role: "parent", name: "Parent A" } });
  assert.equal(a.status, 200);
  assert.ok(a.body.token);
  parentA = a.body.token;

  const b = await api("POST", "/api/auth/signup", { body: { email: "parentb@example.com", password: "longenough1", role: "parent", name: "Parent B" } });
  assert.equal(b.status, 200);
  parentB = b.body.token;

  const t = await api("POST", "/api/auth/signup", { body: { email: "teacher@example.com", password: "longenough1", role: "teacher", name: "Teacher" } });
  assert.equal(t.status, 200);
  teacher = t.body.token;
});

test("login verifies the password", async () => {
  const bad = await api("POST", "/api/auth/login", { body: { email: "parenta@example.com", password: "wrongpassword" } });
  assert.equal(bad.status, 401);
  const good = await api("POST", "/api/auth/login", { body: { email: "parenta@example.com", password: "longenough1" } });
  assert.equal(good.status, 200);
  assert.ok(good.body.token);
});

test("auth-gated routes reject missing tokens", async () => {
  const r = await api("GET", "/api/children");
  assert.equal(r.status, 401);
});

test("a parent can create a child and sync its state", async () => {
  const created = await api("POST", "/api/children", { token: parentA, body: { name: "Kit", ks: "ks2" } });
  assert.equal(created.status, 200);
  childId = created.body.child.id;

  const put = await api("PUT", `/api/children/${childId}/state`, {
    token: parentA,
    body: { state: { subs: { junior: false, adult: false }, stars: 9, history: [], stats: {} } },
  });
  assert.equal(put.status, 200);

  const got = await api("GET", `/api/children/${childId}/state`, { token: parentA });
  assert.equal(got.status, 200);
  assert.equal(got.body.state.stars, 9);
});

test("another parent cannot read or write someone else's child", async () => {
  const read = await api("GET", `/api/children/${childId}/state`, { token: parentB });
  assert.equal(read.status, 403);
  const write = await api("PUT", `/api/children/${childId}/state`, { token: parentB, body: { state: {} } });
  assert.equal(write.status, 403);
});

test("goals are track-scoped to their author", async () => {
  const g = await api("POST", `/api/children/${childId}/goals`, { token: parentA, body: { title: "Practise fractions" } });
  assert.equal(g.status, 200);
  goalId = g.body.goal.id;

  const stranger = await api("POST", `/api/children/${childId}/goals`, { token: parentB, body: { title: "Should fail" } });
  assert.equal(stranger.status, 403);

  const del = await api("DELETE", `/api/goals/${goalId}`, { token: parentB });
  assert.equal(del.status, 403, "only the goal's author may delete it");
});

test("teachers manage classes; parents join by code", async () => {
  const noClass = await api("POST", "/api/classes", { token: parentA, body: { name: "Nope" } });
  assert.equal(noClass.status, 403, "parents cannot create classes");

  const cls = await api("POST", "/api/classes", { token: teacher, body: { name: "Year 4" } });
  assert.equal(cls.status, 200);
  classCode = cls.body.class.code;
  classId = cls.body.class.id;

  const pupil = await api("POST", `/api/classes/${classId}/pupils`, { token: teacher, body: { name: "Pip", ks: "ks2" } });
  assert.equal(pupil.status, 200);

  const join = await api("POST", `/api/children/${childId}/join-class`, { token: parentA, body: { code: classCode } });
  assert.equal(join.status, 200);

  const board = await api("GET", `/api/leaderboard?childId=${childId}`, { token: parentA });
  assert.equal(board.status, 200);
  assert.equal(board.body.scope, "class");
  assert.ok(board.body.board.length >= 2, "class board includes classmates");
});

test("deleting a child cascades goals and class links", async () => {
  const del = await api("DELETE", `/api/children/${childId}`, { token: parentA });
  assert.equal(del.status, 200);

  const kids = await api("GET", "/api/children", { token: parentA });
  assert.ok(!kids.body.children.some((c) => c.id === childId), "child is gone");

  const goals = await api("GET", `/api/children/${childId}/goals`, { token: parentA });
  assert.equal(goals.status, 403, "goal access is gone with the child");
});

test("deleting the account removes it and everything it owns", async () => {
  const del = await api("DELETE", "/api/me", { token: parentB });
  assert.equal(del.status, 200);
  const me = await api("GET", "/api/me", { token: parentB });
  assert.equal(me.status, 401, "the deleted account's token no longer works");
});

test("the AI proxy fails safely without a key", async () => {
  const r = await api("POST", "/api/claude", { body: { content: "hello" } });
  assert.equal(r.status, 500);
  assert.match(r.body.error, /ANTHROPIC_API_KEY/);
});

test("login is rate-limited after repeated attempts", async () => {
  // 2 logins used earlier; the limiter allows 10 per 15 min, so the 11th 429s.
  let limited = null;
  for (let i = 0; i < 9; i++) {
    const r = await api("POST", "/api/auth/login", { body: { email: "parenta@example.com", password: "wrongpassword" } });
    if (r.status === 429) { limited = { attempt: i + 3, ...r }; break; }
    assert.equal(r.status, 401);
  }
  assert.ok(limited, "rate limiter never triggered");
  assert.equal(limited.attempt, 11, "the 11th login attempt should be limited");
});
