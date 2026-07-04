import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { load, save, newId, newCode, overview, weakest, initStore } from "./store.js";
import { hashPassword, verifyPassword, signToken, verifyToken } from "./auth.js";
import { sendEmail } from "./email.js";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

dotenv.config();

const app = express();
// Behind a reverse proxy (Render, Heroku, nginx…) set TRUST_PROXY=1 so req.ip is
// the real client address. Without it every visitor shares the proxy's IP, so one
// busy user's rate limit throttles the whole site. Leave unset when clients
// connect directly — trusting X-Forwarded-For there lets callers spoof their IP.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
// Lock CORS to your site in production by setting CORS_ORIGIN (comma-separated for several).
const corsOrigins = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors(corsOrigins.length ? { origin: corsOrigins } : {}));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

// Tiny fixed-window rate limiter (in-memory, per IP + route) — protects the paid AI/TTS
// proxies and the auth endpoints without adding a dependency. For multi-instance deploys
// move this to a shared store (Redis) or a gateway limit.
const rateBuckets = new Map();
setInterval(() => { const now = Date.now(); for (const [k, b] of rateBuckets) if (b.reset <= now) rateBuckets.delete(k); }, 60000).unref();
const rateLimit = (max, windowMs) => (req, res, next) => {
  const key = `${req.ip}|${req.path}`;
  const now = Date.now();
  let b = rateBuckets.get(key);
  if (!b || b.reset <= now) { b = { count: 0, reset: now + windowMs }; rateBuckets.set(key, b); }
  if (++b.count > max) {
    res.setHeader("Retry-After", Math.ceil((b.reset - now) / 1000));
    return res.status(429).json({ error: "Too many requests — please wait a moment and try again." });
  }
  next();
};
const aiLimit = rateLimit(30, 5 * 60000);    // 30 AI/TTS calls per 5 min per IP
const authLimit = rateLimit(10, 15 * 60000); // 10 auth attempts per 15 min per IP
// Stripe webhook must read the RAW body for signature verification, so it is registered
// before express.json(). Verifies the signature, then grants/revokes access in the store.
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, res) => handleStripeEvent(req.body, req.headers["stripe-signature"], res));
app.use(express.json({ limit: "20mb" }));

const KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 8787;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVEN_VOICE = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // change to a child-friendly voice
const ELEVEN_MODEL = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";
const DEFAULT_STATE = () => ({ subs: { junior: false, adult: false }, stars: 0, history: [], stats: {} });

app.get("/api/health", (_req, res) => res.json({ ok: true, hasKey: Boolean(KEY) }));

/* ---------- AI proxy (keeps the API key server-side) ---------- */
// Per-feature model routing. The client sends a `feature` hint (questions,
// mark, solve, chat, translate, …); MODEL_<FEATURE> env vars override the
// default per feature — e.g. MODEL_TRANSLATE=claude-haiku-4-5 routes UI
// translation to the cheaper model without touching tutoring quality.
const MODEL_DEFAULT = process.env.MODEL_DEFAULT || "claude-sonnet-4-6";
const modelFor = (feature) => process.env[`MODEL_${String(feature || "").toUpperCase().replace(/[^A-Z0-9]/g, "")}`] || MODEL_DEFAULT;
// Only models we intend to pay for; a hijacked client can't switch to a pricier
// one. Env-routed models are trusted automatically.
const ALLOWED_MODELS = [...new Set([
  ...(process.env.ALLOWED_MODELS || "claude-sonnet-4-6,claude-haiku-4-5").split(",").map((s) => s.trim()),
  MODEL_DEFAULT,
  ...Object.entries(process.env).filter(([k]) => k.startsWith("MODEL_")).map(([, v]) => String(v).trim()),
])].filter(Boolean);
const MAX_TOKENS_CAP = 4000;

app.post("/api/claude", aiLimit, async (req, res) => {
  if (!KEY) return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY. Copy .env.example to .env and add your key." });
  try {
    let { system, content, max_tokens = 1500, model, feature } = req.body || {};
    if (!model) model = modelFor(feature);
    if (!ALLOWED_MODELS.includes(model)) model = ALLOWED_MODELS[0];
    max_tokens = Math.min(Math.max(1, Number(max_tokens) || 1500), MAX_TOKENS_CAP);
    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens, system, messages: [{ role: "user", content }] }),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) { res.status(502).json({ error: "Upstream request failed", detail: String(err) }); }
});

/* ---------- premium voice proxy (ElevenLabs) — keeps the TTS key server-side ---------- */
app.post("/api/tts", aiLimit, async (req, res) => {
  if (!ELEVEN_KEY) return res.status(500).json({ error: "Missing ELEVENLABS_API_KEY. Add it to .env to enable the premium voice." });
  try {
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: "No text provided." });
    const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}`, {
      method: "POST",
      headers: { "xi-api-key": ELEVEN_KEY, "Content-Type": "application/json", "Accept": "audio/mpeg" },
      body: JSON.stringify({
        text: String(text).slice(0, 800),
        model_id: ELEVEN_MODEL,
        // eleven_multilingual_v2 auto-detects language from the text. For flash_v2_5 / v3
        // you may pass language_code (ISO 639-1) here to force the language.
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
      }),
    });
    if (!upstream.ok) { const t = await upstream.text(); return res.status(upstream.status).json({ error: "TTS request failed", detail: t.slice(0, 300) }); }
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (e) { res.status(502).json({ error: "TTS upstream failed", detail: String(e) }); }
});

/* ---------- helpers ---------- */
function userFromReq(db, req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  const payload = m && verifyToken(m[1]);
  return payload && db.users[payload.uid] ? db.users[payload.uid] : null;
}
const pub = (u) => ({ id: u.id, email: u.email, role: u.role, name: u.name, weeklyEmail: !!u.weeklyEmail, subs: u.subs || { junior: false, adult: false }, referralCode: u.referralCode || null, pendingBonus: u.pendingBonus || 0 });
function canAccessChild(db, user, childId) {
  const child = db.children[childId];
  if (!child) return false;
  if (user.role === "parent") return child.parentUserId === user.id;
  return Object.values(db.classes).some((c) => c.teacherUserId === user.id && c.childIds.includes(childId));
}
function childrenForUser(db, user) {
  if (user.role === "parent") return Object.values(db.children).filter((c) => c.parentUserId === user.id);
  const ids = new Set();
  Object.values(db.classes).forEach((c) => { if (c.teacherUserId === user.id) c.childIds.forEach((id) => ids.add(id)); });
  return [...ids].map((id) => db.children[id]).filter(Boolean);
}
const childCard = (c) => ({ id: c.id, name: c.name, ks: c.ks, overview: overview(c.state || DEFAULT_STATE()) });
// gate a handler behind a valid token
const auth = (handler) => (req, res) => {
  const db = load();
  const user = userFromReq(db, req);
  if (!user) return res.status(401).json({ error: "Please sign in." });
  return handler(req, res, db, user);
};

/* ---------- auth ---------- */
app.post("/api/auth/signup", authLimit, (req, res) => {
  const { email, password, role = "parent", name = "" } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });
  if (String(password).length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  if (!["parent", "teacher"].includes(role)) return res.status(400).json({ error: "Invalid role." });
  const db = load();
  const exists = Object.values(db.users).some((u) => u.email.toLowerCase() === String(email).toLowerCase());
  if (exists) return res.status(409).json({ error: "An account with that email already exists." });
  const { salt, hash } = hashPassword(password);
  const user = { id: newId(), email: String(email).trim(), salt, hash, role, name: String(name).trim(), createdAt: Date.now(), referralCode: newCode() };
  // Referral: record who invited them. Bonus is granted only after this new account
  // completes its first round (see /api/referral/qualify) — prevents fake-signup farming.
  const refCode = String(req.body?.ref || "").trim().toUpperCase();
  if (refCode) {
    const referrer = Object.values(db.users).find((u) => (u.referralCode || "").toUpperCase() === refCode && u.id !== user.id);
    if (referrer) user.referredBy = referrer.id;
  }
  db.users[user.id] = user;
  save(db);
  res.json({ token: signToken({ uid: user.id }), user: pub(user) });
});

app.post("/api/auth/login", authLimit, (req, res) => {
  const { email, password } = req.body || {};
  const db = load();
  const user = Object.values(db.users).find((u) => u.email.toLowerCase() === String(email || "").toLowerCase());
  if (!user || !verifyPassword(password, user.salt, user.hash)) return res.status(401).json({ error: "Wrong email or password." });
  res.json({ token: signToken({ uid: user.id }), user: pub(user) });
});

app.get("/api/me", auth((_req, res, _db, user) => res.json({ user: pub(user) })));

// Update account preferences (currently: weekly email opt-in).
app.put("/api/me/prefs", auth((req, res, db, user) => {
  if (typeof req.body?.weeklyEmail === "boolean") user.weeklyEmail = req.body.weeklyEmail;
  save(db);
  res.json({ user: pub(user) });
}));

/* ---------- children + sync ---------- */
app.get("/api/children", auth((_req, res, db, user) => res.json({ children: childrenForUser(db, user).map(childCard) })));

app.post("/api/children", auth((req, res, db, user) => {
  if (user.role !== "parent") return res.status(403).json({ error: "Teachers add pupils inside a class." });
  const { name, ks = "ks1" } = req.body || {};
  if (!name) return res.status(400).json({ error: "Child name is required." });
  const child = { id: newId(), name: String(name).trim(), ks, parentUserId: user.id, createdAt: Date.now(), state: DEFAULT_STATE() };
  db.children[child.id] = child;
  save(db);
  res.json({ child: childCard(child) });
}));

app.get("/api/children/:id/state", auth((req, res, db, user) => {
  if (!canAccessChild(db, user, req.params.id)) return res.status(403).json({ error: "No access to this child." });
  res.json({ state: db.children[req.params.id].state || DEFAULT_STATE() });
}));

app.put("/api/children/:id/state", auth((req, res, db, user) => {
  if (!canAccessChild(db, user, req.params.id)) return res.status(403).json({ error: "No access to this child." });
  db.children[req.params.id].state = req.body?.state || DEFAULT_STATE();
  save(db);
  res.json({ ok: true });
}));

// Parent links their child to a teacher's class using the class code.
app.post("/api/children/:id/join-class", auth((req, res, db, user) => {
  const child = db.children[req.params.id];
  if (!child || child.parentUserId !== user.id) return res.status(403).json({ error: "Only the parent can link this child." });
  const cls = Object.values(db.classes).find((c) => c.code === String(req.body?.code || "").toUpperCase().trim());
  if (!cls) return res.status(404).json({ error: "No class with that code." });
  if (!cls.childIds.includes(child.id)) cls.childIds.push(child.id);
  save(db);
  res.json({ ok: true, className: cls.name });
}));

/* ---------- goals & tasks (parent track vs teacher track) ---------- */
app.get("/api/children/:id/goals", auth((req, res, db, user) => {
  if (!canAccessChild(db, user, req.params.id)) return res.status(403).json({ error: "No access to this child." });
  const goals = Object.values(db.goals).filter((g) => g.childId === req.params.id).sort((a, b) => b.createdAt - a.createdAt);
  res.json({ goals });
}));

app.post("/api/children/:id/goals", auth((req, res, db, user) => {
  if (!canAccessChild(db, user, req.params.id)) return res.status(403).json({ error: "No access to this child." });
  const { title, detail = "", subject = "", aiGenerated = false } = req.body || {};
  if (!title) return res.status(400).json({ error: "A title is required." });
  const goal = {
    id: newId(), childId: req.params.id, setBy: user.role, setByUserId: user.id, setByName: user.name || user.role,
    title: String(title).trim(), detail: String(detail).trim(), subject, status: "open", aiGenerated: !!aiGenerated,
    createdAt: Date.now(), marks: [],
  };
  db.goals[goal.id] = goal;
  save(db);
  res.json({ goal });
}));

function editGoal(req, res, db, user, mutate) {
  const goal = db.goals[req.params.id];
  if (!goal) return res.status(404).json({ error: "Goal not found." });
  if (user.role !== goal.setBy || !canAccessChild(db, user, goal.childId))
    return res.status(403).json({ error: "You can only change goals on your own track." });
  mutate(goal);
  save(db);
  res.json({ goal });
}
app.patch("/api/goals/:id", auth((req, res, db, user) => editGoal(req, res, db, user, (g) => { if (req.body?.status) g.status = req.body.status; })));
app.post("/api/goals/:id/mark", auth((req, res, db, user) => editGoal(req, res, db, user, (g) => {
  g.marks.push({ by: user.role, comment: String(req.body?.comment || ""), correct: req.body?.correct ?? null, ts: Date.now() });
  if (req.body?.status) g.status = req.body.status;
})));
app.delete("/api/goals/:id", auth((req, res, db, user) => {
  const goal = db.goals[req.params.id];
  if (!goal) return res.status(404).json({ error: "Goal not found." });
  if (user.role !== goal.setBy || !canAccessChild(db, user, goal.childId)) return res.status(403).json({ error: "Not your track." });
  delete db.goals[req.params.id];
  save(db);
  res.json({ ok: true });
}));

/* ---------- classes (teacher) ---------- */
app.get("/api/classes", auth((_req, res, db, user) => {
  if (user.role !== "teacher") return res.status(403).json({ error: "Teacher accounts only." });
  const classes = Object.values(db.classes).filter((c) => c.teacherUserId === user.id)
    .map((c) => ({ id: c.id, name: c.name, code: c.code, pupils: c.childIds.map((id) => db.children[id]).filter(Boolean).map(childCard) }));
  res.json({ classes });
}));

app.post("/api/classes", auth((req, res, db, user) => {
  if (user.role !== "teacher") return res.status(403).json({ error: "Teacher accounts only." });
  if (!req.body?.name) return res.status(400).json({ error: "Class name is required." });
  const cls = { id: newId(), name: String(req.body.name).trim(), code: newCode(), teacherUserId: user.id, childIds: [], createdAt: Date.now() };
  db.classes[cls.id] = cls;
  save(db);
  res.json({ class: { id: cls.id, name: cls.name, code: cls.code, pupils: [] } });
}));

app.post("/api/classes/:id/pupils", auth((req, res, db, user) => {
  const cls = db.classes[req.params.id];
  if (!cls || cls.teacherUserId !== user.id) return res.status(403).json({ error: "Not your class." });
  const { name, ks = "ks2" } = req.body || {};
  if (!name) return res.status(400).json({ error: "Pupil name is required." });
  const child = { id: newId(), name: String(name).trim(), ks, parentUserId: null, teacherOwned: true, createdAt: Date.now(), state: DEFAULT_STATE() };
  db.children[child.id] = child;
  cls.childIds.push(child.id);
  save(db);
  res.json({ child: childCard(child) });
}));

/* ---------- social: weekly leaderboard + referral ---------- */
// Weekly XP for a learner = correct answers in the last 7 days (a fresh weekly contest).
function weekStarsOf(child) {
  const since = Date.now() - 7 * 86400000;
  let s = 0; for (const r of (child?.state?.history || [])) { if ((r.ts || 0) >= since) s += (r.correct || 0); }
  return s;
}
app.get("/api/leaderboard", auth((req, res, db, user) => {
  const childId = req.query.childId;
  const child = childId && db.children[childId];
  if (!child || !canAccessChild(db, user, childId)) return res.status(404).json({ error: "Not found." });
  const cls = Object.values(db.classes).find((c) => c.childIds.includes(childId));
  let members;
  if (cls) members = cls.childIds.map((id) => db.children[id]).filter(Boolean);
  else if (child.parentUserId) members = Object.values(db.children).filter((c) => c.parentUserId === child.parentUserId);
  else members = [child];
  const board = members
    .map((c) => ({ name: c.name, stars: weekStarsOf(c), you: c.id === childId }))
    .sort((a, b) => b.stars - a.stars).slice(0, 30);
  res.json({ board, scope: cls ? "class" : "family" });
}));
// Claim referral bonus stars (added to the learner's stars by the app).
app.post("/api/referral/claim", auth((req, res, db, user) => {
  const bonus = user.pendingBonus || 0;
  if (bonus) { user.pendingBonus = 0; save(db); }
  res.json({ bonus });
}));
// Qualifying activity: called once after a referred account completes its first round.
// Grants +50 to both the new friend and the referrer — one time only (anti-abuse).
app.post("/api/referral/qualify", auth((req, res, db, user) => {
  if (user.referredBy && !user.referralCredited) {
    user.referralCredited = true;
    user.pendingBonus = (user.pendingBonus || 0) + 50;
    const referrer = db.users[user.referredBy];
    if (referrer) referrer.pendingBonus = (referrer.pendingBonus || 0) + 50;
    save(db);
    return res.json({ credited: true });
  }
  res.json({ credited: false });
}));

// Parent deletes one child and all of that child's data.
app.delete("/api/children/:id", auth((req, res, db, user) => {
  const child = db.children[req.params.id];
  if (!child || child.parentUserId !== user.id) return res.status(403).json({ error: "Only the parent can delete this child." });
  Object.values(db.goals).filter((g) => g.childId === child.id).forEach((g) => delete db.goals[g.id]);
  Object.values(db.classes).forEach((c) => { c.childIds = c.childIds.filter((id) => id !== child.id); });
  delete db.children[child.id];
  save(db);
  res.json({ ok: true });
}));

// Delete the signed-in account and everything it owns.
app.delete("/api/me", auth((_req, res, db, user) => {
  // goals this user set on any child
  Object.values(db.goals).filter((g) => g.setByUserId === user.id).forEach((g) => delete db.goals[g.id]);
  if (user.role === "parent") {
    Object.values(db.children).filter((c) => c.parentUserId === user.id).forEach((child) => {
      Object.values(db.goals).filter((g) => g.childId === child.id).forEach((g) => delete db.goals[g.id]);
      Object.values(db.classes).forEach((c) => { c.childIds = c.childIds.filter((id) => id !== child.id); });
      delete db.children[child.id];
    });
  } else {
    Object.values(db.classes).filter((c) => c.teacherUserId === user.id).forEach((cls) => {
      cls.childIds.forEach((id) => {
        const child = db.children[id];
        if (child && child.teacherOwned) {
          Object.values(db.goals).filter((g) => g.childId === id).forEach((g) => delete db.goals[g.id]);
          delete db.children[id];
        }
      });
      delete db.classes[cls.id];
    });
  }
  delete db.users[user.id];
  save(db);
  res.json({ ok: true });
}));

/* ---------- weekly parent emails ---------- */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function childReportLine(child) {
  const state = child.state || DEFAULT_STATE();
  const ov = overview(state);
  const weak = weakest(state);
  const weakText = weak.length ? weak.map((w) => `${w.subject}: ${w.topic} (${w.accuracy}%)`).join("; ") : "great all-round progress!";
  const courses = (state.courses || []).slice(0, 3);
  const courseText = courses.length ? `\n  Courses: ${courses.map((c) => `${c.course}${c.module ? " " + c.module : " exam"} ${c.score}%${c.type === "exam" ? (c.passed ? " PASS" : " retry") : ""}`).join("; ")}` : "";
  return `${child.name} (${String(child.ks).toUpperCase()})\n  ⭐ ${ov.stars} stars · ${ov.answered} answered (${ov.accuracy}% accuracy) · ${ov.rounds} rounds\n  To practise: ${weakText}${courseText}`;
}

function childReportCard(child) {
  const state = child.state || DEFAULT_STATE();
  const ov = overview(state);
  const weak = weakest(state);
  const weakText = weak.length ? weak.map((w) => `${esc(w.subject)}: ${esc(w.topic)} (${w.accuracy}%)`).join("; ") : "great all-round progress!";
  const courses = (state.courses || []).slice(0, 3);
  const courseHtml = courses.length
    ? `<div style="font-size:14px;color:#5a463c;margin-top:4px;"><b>Courses:</b> ${courses.map((c) => `${esc(c.course)}${c.module ? " " + esc(c.module) : " exam"} ${c.score}%${c.type === "exam" ? (c.passed ? " PASS" : " retry") : ""}`).join("; ")}</div>`
    : "";
  return `<tr><td style="padding:0 0 12px;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#fffdf8;border:1px solid #f0e3d2;border-radius:14px;"><tr><td style="padding:14px 16px;font-family:Arial,Helvetica,sans-serif;">
    <div style="font-weight:700;font-size:16px;color:#43342a;">${esc(child.name)} <span style="color:#9b8a7a;font-weight:600;font-size:13px;">(${esc(String(child.ks).toUpperCase())})</span></div>
    <div style="font-size:14px;color:#5a463c;margin-top:6px;">⭐ ${ov.stars} stars &nbsp;·&nbsp; ${ov.answered} answered (${ov.accuracy}%) &nbsp;·&nbsp; ${ov.rounds} rounds</div>
    <div style="font-size:14px;color:#5a463c;margin-top:4px;"><b>To practise:</b> ${weakText}</div>${courseHtml}
  </td></tr></table></td></tr>`;
}

function digestHtml(user, kids) {
  return `<!doctype html><html><body style="margin:0;background:#fff7ec;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table width="100%" style="max-width:560px;" cellpadding="0" cellspacing="0">
      <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;color:#43342a;padding:0 0 4px;">🎓 Education Academy</td></tr>
      <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#5a463c;padding:0 0 16px;">Hi ${esc(user.name || "there")}, here's this week's progress:</td></tr>
      ${kids.map(childReportCard).join("")}
      <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#5a463c;padding:8px 0 0;">Keep cheering them on! 🐾<br/>— Mochi</td></tr>
      <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9b8a7a;padding:16px 0 0;">You're receiving this because weekly summaries are on. Turn them off in the Parent &amp; Teacher portal.</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function buildParentDigest(db, user) {
  const kids = Object.values(db.children).filter((c) => c.parentUserId === user.id);
  const text = `Hi ${user.name || "there"},\n\nHere's this week's Education Academy summary:\n\n${kids.map(childReportLine).join("\n\n")}\n\nKeep cheering them on! 🐾\n— Mochi`;
  return { to: user.email, subject: "Your child's weekly Education Academy progress", text, html: digestHtml(user, kids), kids };
}

async function runWeeklyReports({ force = false } = {}) {
  const db = load();
  const now = Date.now(), WEEK = 7 * 24 * 3600 * 1000;
  let sent = 0;
  for (const user of Object.values(db.users)) {
    if (user.role !== "parent" || !user.weeklyEmail) continue;
    if (!force && user.lastWeeklyAt && now - user.lastWeeklyAt < WEEK) continue;
    const d = buildParentDigest(db, user);
    if (!d.kids.length) continue;
    try { await sendEmail({ to: d.to, subject: d.subject, text: d.text, html: d.html }); user.lastWeeklyAt = now; sent++; }
    catch (e) { console.error("weekly email failed for", user.email, String(e)); }
  }
  save(db);
  return sent;
}

app.post("/api/cron/weekly-reports", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers["x-cron-secret"] !== secret) return res.status(401).json({ error: "Bad cron secret." });
  try { res.json({ ok: true, sent: await runWeeklyReports({ force: req.query.force === "1" }) }); }
  catch (e) { res.status(500).json({ error: String(e) }); }
});

if (process.env.WEEKLY_EMAILS_INPROCESS === "1") {
  setInterval(() => { runWeeklyReports().then((n) => n && console.log("weekly emails sent:", n)).catch(() => {}); }, 24 * 3600 * 1000);
}

/* ---------- admin: preview / trigger a parent's report on demand ---------- */
function requireAdmin(req, res) {
  const s = process.env.ADMIN_SECRET;
  if (!s) { res.status(503).json({ error: "Set ADMIN_SECRET to use admin endpoints." }); return false; }
  if (req.headers["x-admin-secret"] !== s) { res.status(401).json({ error: "Bad admin secret." }); return false; }
  return true;
}
const findParent = (db, email) => Object.values(db.users).find((u) => u.role === "parent" && u.email.toLowerCase() === String(email || "").toLowerCase());

// Preview: GET /api/admin/report?email=...&format=html|json  (header: x-admin-secret)
app.get("/api/admin/report", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const db = load();
  const user = findParent(db, req.query.email);
  if (!user) return res.status(404).json({ error: "No parent with that email." });
  const d = buildParentDigest(db, user);
  if (req.query.format === "html") { res.setHeader("Content-Type", "text/html"); return res.send(d.html); }
  res.json({ to: d.to, subject: d.subject, children: d.kids.length, text: d.text, html: d.html });
});

// Trigger now: POST /api/admin/report?email=...  (sends immediately, ignores weekly cadence)
app.post("/api/admin/report", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const db = load();
  const user = findParent(db, req.query.email || req.body?.email);
  if (!user) return res.status(404).json({ error: "No parent with that email." });
  const d = buildParentDigest(db, user);
  if (!d.kids.length) return res.status(400).json({ error: "That parent has no children." });
  try { await sendEmail({ to: d.to, subject: d.subject, text: d.text, html: d.html }); user.lastWeeklyAt = Date.now(); save(db); res.json({ ok: true, sent: 1, to: d.to }); }
  catch (e) { res.status(500).json({ error: String(e) }); }
});

/* ---------- Stripe (web build payments) ---------- */
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const STRIPE_PRICES = { junior: process.env.STRIPE_PRICE_JUNIOR || "", adult: process.env.STRIPE_PRICE_ADULT || "" };
const SITE_URL = process.env.PUBLIC_WEB_URL || "http://localhost:5173";

async function stripeForm(path, params) {
  const r = await fetch("https://api.stripe.com/v1/" + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + STRIPE_SECRET, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "Stripe error");
  return j;
}

// Create a Checkout Session and return its hosted URL. Google/Stripe charge in the
// customer's local currency (set per-currency prices in Stripe to control this).
app.post("/api/stripe/checkout", async (req, res) => {
  if (!STRIPE_SECRET) return res.status(503).json({ error: "Stripe isn't configured on the server yet." });
  const plan = req.body?.plan; const price = STRIPE_PRICES[plan];
  if (!price) return res.status(400).json({ error: "Unknown plan or missing Stripe price ID." });
  const db = load(); const user = userFromReq(db, req); // optional: links the subscription to the account
  try {
    const session = await stripeForm("checkout/sessions", {
      mode: "subscription",
      "line_items[0][price]": price,
      "line_items[0][quantity]": "1",
      success_url: SITE_URL + "/?checkout=success",
      cancel_url: SITE_URL + "/?checkout=cancel",
      allow_promotion_codes: "true",
      "metadata[plan]": plan,
      "subscription_data[metadata][plan]": plan,
      ...(user ? { client_reference_id: user.id, customer_email: user.email, "metadata[uid]": user.id, "subscription_data[metadata][uid]": user.id } : {}),
    });
    res.json({ url: session.url });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

// Stripe billing portal so web subscribers can manage/cancel. Needs the customer id
// you saved on the user from the checkout webhook.
app.post("/api/stripe/portal", async (req, res) => {
  if (!STRIPE_SECRET) return res.status(503).json({ error: "Stripe isn't configured on the server yet." });
  const db = load(); const user = userFromReq(db, req);
  const customer = user?.stripeCustomerId;
  if (!customer) return res.status(400).json({ error: "No subscription on file for this account yet." });
  try { const session = await stripeForm("billing_portal/sessions", { customer, return_url: SITE_URL }); res.json({ url: session.url }); }
  catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

/* ---------- Stripe webhook handling (verifies signature, then grants/revokes) ---------- */
function verifyStripeSig(rawBuf, sigHeader) {
  if (!STRIPE_WEBHOOK_SECRET) return true;                 // not enforced until you set the secret (dev/local)
  if (!sigHeader) return false;
  const parts = Object.fromEntries(String(sigHeader).split(",").map((kv) => kv.split("=")));
  if (!parts.t || !parts.v1) return false;
  const signed = `${parts.t}.${rawBuf.toString("utf8")}`;
  const expected = crypto.createHmac("sha256", STRIPE_WEBHOOK_SECRET).update(signed).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1)); } catch { return false; }
}
const userById = (db, uid) => (uid && db.users[uid]) ? db.users[uid] : null;
const userByCustomer = (db, customer) => Object.values(db.users).find((u) => u.stripeCustomerId === customer) || null;
function setUserPlan(user, plan, on) { user.subs = user.subs || { junior: false, adult: false }; if (plan === "junior" || plan === "adult") user.subs[plan] = !!on; }
function planFromSubscription(sub) {
  const priceId = sub?.items?.data?.[0]?.price?.id;
  if (priceId && priceId === STRIPE_PRICES.adult) return "adult";
  if (priceId && priceId === STRIPE_PRICES.junior) return "junior";
  return undefined;
}
function handleStripeEvent(rawBuf, sig, res) {
  if (!verifyStripeSig(rawBuf, sig)) return res.status(400).json({ error: "Invalid signature." });
  let event; try { event = JSON.parse(rawBuf.toString("utf8")); } catch { return res.status(400).json({ error: "Bad payload." }); }
  const db = load(); const obj = event?.data?.object || {};
  try {
    if (event.type === "checkout.session.completed") {
      const user = userById(db, obj.client_reference_id || obj.metadata?.uid);
      if (user) { if (obj.customer) user.stripeCustomerId = obj.customer; if (obj.subscription) user.stripeSubId = obj.subscription; setUserPlan(user, obj.metadata?.plan, true); save(db); }
    } else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const user = userById(db, obj.metadata?.uid) || userByCustomer(db, obj.customer);
      const active = ["active", "trialing", "past_due"].includes(obj.status);
      if (user) { setUserPlan(user, obj.metadata?.plan || planFromSubscription(obj), active); save(db); }
    } else if (event.type === "customer.subscription.deleted") {
      const user = userById(db, obj.metadata?.uid) || userByCustomer(db, obj.customer);
      if (user) { setUserPlan(user, obj.metadata?.plan || planFromSubscription(obj), false); save(db); }
    }
  } catch (e) { /* never fail the webhook on a store hiccup; Stripe will retry */ }
  res.json({ received: true });
}

/* ---------- Public legal & marketing pages (clean URLs, before the SPA fallback) ---------- */
const MKT = path.join(ROOT, "marketing");
const sendMkt = (file) => (req, res, next) => { const p = path.join(MKT, file); fs.existsSync(p) ? res.sendFile(p) : next(); };
app.get(["/welcome", "/about"], sendMkt("index.html"));
app.get("/privacy", sendMkt("privacy.html"));
app.get("/terms", sendMkt("terms.html"));
app.get("/support", sendMkt("support.html"));
app.get("/status", sendMkt("status.html"));

/* ---------- Serve the built web app (one-service deploy). Run `npm run build:web` first. ---------- */
const WEB_DIR = path.join(ROOT, "dist-web");
if (fs.existsSync(WEB_DIR)) {
  app.use(express.static(WEB_DIR));
  app.get("*", (req, res, next) => { if (req.path.startsWith("/api/")) return next(); res.sendFile(path.join(WEB_DIR, "index.html")); });
}

initStore().then(() => {
  app.listen(PORT, () => {
    console.log(`\n  Education Academy API ready on http://localhost:${PORT}`);
    if (!KEY) console.log("  ⚠  No ANTHROPIC_API_KEY found — AI features will error until you add one to .env\n");
  });
}).catch((e) => { console.error("Failed to start:", e); process.exit(1); });
