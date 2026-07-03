import { useState, useEffect } from "react";
import { useT, tf } from "../lib/i18n.js";
import {
  ArrowLeft, LogOut, Plus, Check, X, Sparkles, Loader2, Trash2,
  GraduationCap, Users, Star, Link2, RotateCcw, RefreshCw, FileText, Mail,
} from "lucide-react";
import Mochi from "./Mochi.jsx";
import { KS_LABEL, KS_META, SUBJECTS_BY_KS, SUBJ } from "../data/curriculum.js";
import { suggestGoal, progressNote } from "../lib/api.js";
import { overview as ovState, weakestTopics } from "../lib/progress.js";
import * as cloud from "../lib/cloud.js";
import * as review from "../lib/review.js";

const KS_OPTIONS = KS_META.map((m) => [m.id, KS_LABEL[m.id]]);
const acc = (p) => (p >= 70 ? "var(--good)" : p >= 40 ? "var(--sunny)" : "var(--coral)");

/* Goals & tasks for one child. Shows BOTH tracks; you can only edit your own. */
function GoalSection({ token, child, role }) {
  const tr = useT();
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: "", detail: "", subject: "" });
  const [aiBusy, setAiBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const refresh = () => { setLoading(true); cloud.listGoals(token, child.id).then(setGoals).catch((e) => setErr(e.message)).finally(() => setLoading(false)); };
  useEffect(refresh, [child.id]);

  async function suggest() {
    setAiBusy(true); setErr("");
    try { const g = await suggestGoal({ ks: child.ks, subject: form.subject, childName: child.name }); setForm((f) => ({ ...f, title: g.title || f.title, detail: g.detail || f.detail })); }
    catch { setErr(tr("Couldn't reach the AI — check your connection and API key.")); }
    finally { setAiBusy(false); }
  }
  async function add() {
    if (!form.title.trim()) return;
    setBusy(true); setErr("");
    try { await cloud.addGoal(token, child.id, { ...form, aiGenerated: false }); setForm({ title: "", detail: "", subject: "" }); refresh(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  const toggle = (g) => cloud.setGoalStatus(token, g.id, g.status === "done" ? "open" : "done").then(refresh).catch((e) => setErr(e.message));
  const remove = (g) => cloud.deleteGoal(token, g.id).then(refresh).catch((e) => setErr(e.message));

  const mine = (g) => g.setBy === role;

  return (
    <>
      <div className="sectitle">{tr("Goals & tasks")}</div>
      <p className="muted" style={{ margin: "0 0 8px" }}>
        {role === "parent" ? tr("Your parent track is separate from the teacher's. You set and mark your own.") : tr("Your teacher track is separate from the parent's. You set and mark your own.")}
      </p>
      <div className="card">
        {loading ? <p className="muted" style={{ textAlign: "center", margin: 8 }}>{tr("Loading…")}</p>
          : goals.length === 0 ? <p className="muted" style={{ textAlign: "center", margin: 8 }}>{tr("No goals yet. Add the first below.")}</p>
          : goals.map((g) => (
            <div className="goalrow" key={g.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className={`trackbadge ${g.setBy}`}>{g.setBy === "parent" ? tr("Parent") : tr("Teacher")}</span>
                {g.subject && SUBJ[g.subject] && <span className="muted">{SUBJ[g.subject].name}</span>}
                <span style={{ marginLeft: "auto", fontWeight: 800, color: g.status === "done" ? "var(--good)" : "var(--muted)" }}>
                  {g.status === "done" ? "✓ " + tr("Done") : tr("Open")}
                </span>
              </div>
              <div style={{ fontWeight: 800, marginTop: 4, textDecoration: g.status === "done" ? "line-through" : "none" }}>{g.title}</div>
              {g.detail && <div className="muted" style={{ marginTop: 2 }}>{g.detail}</div>}
              {mine(g) ? (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button className="chip" onClick={() => toggle(g)}>{g.status === "done" ? <><RotateCcw size={14} /> {tr("Reopen")}</> : <><Check size={14} /> {tr("Mark done")}</>}</button>
                  <button className="chip" onClick={() => remove(g)} style={{ color: "var(--bad)" }}><Trash2 size={14} /> {tr("Delete")}</button>
                </div>
              ) : <div className="muted" style={{ marginTop: 6, fontStyle: "italic" }}>{g.setBy === "parent" ? tr("Set by the parent — view only") : tr("Set by the teacher — view only")}</div>}
            </div>
          ))}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>{tr("Add a goal or task")}</div>
        <div className="field"><label>{tr("Title")}</label>
          <input className="tin" value={form.title} placeholder={tr("e.g. Practise the 7 times table")} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div className="field"><label>{tr("Details (optional)")}</label>
          <textarea className="txtin" style={{ marginTop: 0 }} value={form.detail} placeholder={tr("What should they do?")} onChange={(e) => setForm({ ...form, detail: e.target.value })} /></div>
        <div className="field"><label>{tr("Subject (optional)")}</label>
          <select className="tin" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
            <option value="">{tr("Any")}</option>
            {SUBJECTS_BY_KS[child.ks].map((s) => <option key={s} value={s}>{SUBJ[s].name}</option>)}
          </select></div>
        {err && <p className="err">{err}</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button className="bigbtn ghost" style={{ marginTop: 0, flex: 1 }} disabled={aiBusy} onClick={suggest}>
            {aiBusy ? <Loader2 className="wiggle" size={18} /> : <><Sparkles size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />{tr("Suggest with AI")}</>}
          </button>
          <button className="bigbtn purple" style={{ marginTop: 0, flex: 1 }} disabled={busy || !form.title.trim()} onClick={add}>
            {busy ? <Loader2 className="wiggle" size={18} /> : <><Plus size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />{tr("Add task")}</>}
          </button>
        </div>
      </div>
    </>
  );
}

const ChildStats = ({ o }) => {
  const tr = useT();
  return (
    <>
      <div className="statgrid" style={{ marginTop: 12 }}>
        <div className="stat"><b>{o.stars}</b><span>{tr("Stars")}</span></div>
        <div className="stat"><b>{o.accuracy}%</b><span>{tr("Accuracy")}</span></div>
        <div className="stat"><b>{o.answered}</b><span>{tr("Answered")}</span></div>
        <div className="stat"><b>{o.rounds}</b><span>{tr("Rounds")}</span></div>
      </div>
      {o.coursesTaken > 0 && <p className="muted" style={{ textAlign: "center", marginTop: 8 }}>🎓 {tf("Courses: {p} passed / {t} taken", { p: o.coursesPassed, t: o.coursesTaken })}</p>}
    </>
  );
};

export default function GrownUps({ onClose, onBind, onPrivacy }) {
  const tr = useT();
  const [session, setSession] = useState(null);
  const [view, setView] = useState("account"); // account | parent | parentChild | teacher | teacherPupil
  const [booting, setBooting] = useState(true);

  // account form
  const [mode, setMode] = useState("in");
  const [f, setF] = useState({ name: "", email: "", password: "", role: "parent" });
  const [authErr, setAuthErr] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  // data
  const [children, setChildren] = useState([]);
  const [activeChild, setActiveChild] = useState(null);
  const [classes, setClasses] = useState([]);
  const [activeClass, setActiveClass] = useState(null);
  const [activePupil, setActivePupil] = useState(null);
  const [dataErr, setDataErr] = useState("");

  // small inline forms
  const [childForm, setChildForm] = useState({ name: "", ks: "ks1", open: false });
  const [classForm, setClassForm] = useState({ name: "", open: false });
  const [pupilForm, setPupilForm] = useState({ name: "", ks: "ks2", open: false });
  const [joinCode, setJoinCode] = useState("");
  const [joinMsg, setJoinMsg] = useState("");

  function routeFor(user, token) {
    if (user.role === "teacher") { setView("teacher"); cloud.listClasses(token).then(setClasses).catch((e) => setDataErr(e.message)); }
    else { setView("parent"); cloud.listChildren(token).then(setChildren).catch((e) => setDataErr(e.message)); }
  }

  useEffect(() => {
    const s = cloud.getSession();
    if (s?.token) cloud.me(s.token).then(({ user }) => { const sess = { token: s.token, user }; setSession(sess); routeFor(user, s.token); }).catch(() => { cloud.clearSession(); }).finally(() => setBooting(false));
    else setBooting(false);
  }, []);

  async function submitAuth() {
    setAuthBusy(true); setAuthErr("");
    try {
      const data = mode === "up" ? await cloud.signup(f.email, f.password, f.role, f.name) : await cloud.login(f.email, f.password);
      const sess = { token: data.token, user: data.user };
      cloud.setSession(sess); setSession(sess); routeFor(data.user, data.token);
    } catch (e) { setAuthErr(e.message); } finally { setAuthBusy(false); }
  }
  function signOut() { cloud.clearSession(); setSession(null); setView("account"); setChildren([]); setClasses([]); setActiveChild(null); setActivePupil(null); }

  const t = session?.token;
  const refreshChildren = () => cloud.listChildren(t).then(setChildren).catch((e) => setDataErr(e.message));
  const refreshClasses = () => cloud.listClasses(t).then(setClasses).catch((e) => setDataErr(e.message));

  async function addChild() {
    if (!childForm.name.trim()) return;
    try { await cloud.addChild(t, childForm.name, childForm.ks); setChildForm({ name: "", ks: "ks1", open: false }); refreshChildren(); }
    catch (e) { setDataErr(e.message); }
  }
  async function addClass() {
    if (!classForm.name.trim()) return;
    try { await cloud.addClass(t, classForm.name); setClassForm({ name: "", open: false }); refreshClasses(); }
    catch (e) { setDataErr(e.message); }
  }
  async function addPupil() {
    if (!pupilForm.name.trim() || !activeClass) return;
    try { await cloud.addPupil(t, activeClass.id, pupilForm.name, pupilForm.ks); setPupilForm({ name: "", ks: "ks2", open: false }); const cs = await cloud.listClasses(t); setClasses(cs); setActiveClass(cs.find((c) => c.id === activeClass.id)); }
    catch (e) { setDataErr(e.message); }
  }
  async function joinTeacherClass() {
    if (!joinCode.trim() || !activeChild) return;
    setJoinMsg("");
    try { const r = await cloud.joinClass(t, activeChild.id, joinCode); setJoinMsg(tf('Linked to "{name}". Their teacher can now set work too.', { name: r.className })); setJoinCode(""); }
    catch (e) { setJoinMsg(e.message); }
  }
  async function deleteAccount() {
    if (!window.confirm(tr("Delete your account and all associated data? This cannot be undone."))) return;
    try { await cloud.deleteAccount(t); signOut(); } catch (e) { setDataErr(e.message); }
  }
  async function removeChild() {
    if (!activeChild || !window.confirm(tf("Remove {name} and all their data? This cannot be undone.", { name: activeChild.name }))) return;
    try { await cloud.deleteChild(t, activeChild.id); setActiveChild(null); setView("parent"); refreshChildren(); }
    catch (e) { setDataErr(e.message); }
  }

  // ---- parent progress report ----
  const [report, setReport] = useState(null);
  const [reportBusy, setReportBusy] = useState(false);
  async function makeReport() {
    if (!activeChild) return;
    setReportBusy(true); setDataErr("");
    try {
      const [goals, state] = await Promise.all([cloud.listGoals(t, activeChild.id), cloud.getChildState(t, activeChild.id)]);
      const ov = ovState(state);
      const weak = weakestTopics(state);
      const open = goals.filter((g) => g.status !== "done").length;
      const done = goals.length - open;
      let note = "";
      try { note = await progressNote({ childName: activeChild.name, ks: KS_LABEL[activeChild.ks], overview: ov, weak, goalsOpen: open, goalsDone: done }); } catch {}
      if (!note) note = `${activeChild.name} has answered ${ov.answered} questions with ${ov.accuracy}% accuracy. Keep cheering them on at home!`;
      const weakText = weak.length ? weak.map((w) => `${SUBJ[w.subject]?.name || w.subject}: ${w.topic} (${w.accuracy}%)`).join("; ") : "Great all-round progress!";
      const goalsText = goals.length ? goals.map((g) => `- [${g.setBy === "parent" ? "Parent" : "Teacher"}] ${g.title} — ${g.status === "done" ? "Done" : "Open"}`).join("\n") : "No goals set yet.";
      const courses = (state.courses || []).slice(0, 5);
      const coursesText = courses.length
        ? courses.map((c) => `- ${c.course}${c.module ? " · " + c.module : " · exam"}: ${c.score}%${c.type === "exam" ? (c.passed ? " (PASS)" : " (retry)") : ""}`).join("\n")
        : "No courses yet.";
      const text =
`Education Academy — Progress report for ${activeChild.name}
${KS_LABEL[activeChild.ks]} · ${new Date().toLocaleDateString()}

Stars earned: ${state.stars || 0}
Questions answered: ${ov.answered} (accuracy ${ov.accuracy}%)
Rounds completed: ${ov.rounds}
Best streak: ${ov.best}
Topics to practise: ${weakText}

Goals & tasks:
${goalsText}

Courses:
${coursesText}

Mochi's note:
${note}

Sent from Education Academy`;
      setReport({ text, name: activeChild.name });
      if (ov.answered > 0) review.maybeRequestReview(); // positive moment, shown to the grown-up
    } catch (e) { setDataErr(e.message); }
    finally { setReportBusy(false); }
  }
  function emailReport() {
    if (!report) return;
    const subject = encodeURIComponent(`Education Academy progress — ${report.name}`);
    const body = encodeURIComponent(report.text);
    try { window.open(`mailto:?subject=${subject}&body=${body}`, "_blank"); } catch {}
  }
  async function copyReport() { if (report) { try { await navigator.clipboard.writeText(report.text); } catch {} } }
  async function toggleWeekly() {
    try { const u = await cloud.setWeeklyEmail(t, !session.user.weeklyEmail); setSession((s) => ({ ...s, user: u })); }
    catch (e) { setDataErr(e.message); }
  }

  const Back = ({ to, label }) => (
    <button className="iconbtn" onClick={to} aria-label={label || "Back"} style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
  );

  if (booting) return <main><div style={{ textAlign: "center", marginTop: 60 }}><Loader2 className="wiggle" size={28} color="#6b4fb0" /></div></main>;

  /* ---------- ACCOUNT ---------- */
  if (!session || view === "account") {
    return (
      <main>
        <Back to={onClose} label="Back to app" />
        <div className="greet" style={{ marginTop: 4 }}>
          <Mochi size={100} expression="idle" />
          <h2 className="fred" style={{ marginTop: 6 }}>{tr("Parent & teacher portal")}</h2>
          <p>{tr("Track progress, set goals, and assign work")}</p>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button className={`seg ${mode === "in" ? "on" : ""}`} style={{ flex: 1 }} onClick={() => setMode("in")}>{tr("Sign in")}</button>
          <button className={`seg ${mode === "up" ? "on" : ""}`} style={{ flex: 1 }} onClick={() => setMode("up")}>{tr("Create account")}</button>
        </div>
        <div className="card" style={{ marginTop: 12 }}>
          {mode === "up" && (
            <>
              <div className="field"><label>{tr("I am a…")}</label>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className={`seg ${f.role === "parent" ? "on" : ""}`} style={{ flex: 1 }} onClick={() => setF({ ...f, role: "parent" })}>{tr("Parent")}</button>
                  <button className={`seg ${f.role === "teacher" ? "on" : ""}`} style={{ flex: 1 }} onClick={() => setF({ ...f, role: "teacher" })}>{tr("Teacher")}</button>
                </div>
              </div>
              <div className="field"><label>{tr("Name")}</label><input className="tin" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            </>
          )}
          <div className="field"><label>{tr("Email")}</label><input className="tin" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div className="field"><label>{tr("Password")}</label><input className="tin" type="password" autoComplete={mode === "up" ? "new-password" : "current-password"} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} onKeyDown={(e) => e.key === "Enter" && submitAuth()} /></div>
          {authErr && <p className="err">{authErr}</p>}
          <button className="bigbtn purple" disabled={authBusy} onClick={submitAuth}>
            {authBusy ? <Loader2 className="wiggle" size={18} /> : mode === "up" ? tr("Create account") : tr("Sign in")}
          </button>
        </div>
        <p className="note">{tr("Or")} <button className="linkbtn" onClick={onClose}>{tr("keep using this device without an account")}</button>. · <button className="linkbtn" onClick={onPrivacy}>{tr("Privacy policy")}</button></p>
      </main>
    );
  }

  /* ---------- PARENT HOME ---------- */
  if (view === "parent") {
    return (
      <main>
        <Back to={onClose} label="Back to app" />
        <div className="greet" style={{ marginTop: 4 }}>
          <Users size={38} color="#6b4fb0" />
          <h2 className="fred" style={{ marginTop: 6 }}>{tf("Hi {name} 👋", { name: session.user.name || tr("there") })}</h2>
          <p>{tr("Your children's learning health")}</p>
        </div>
        {dataErr && <p className="err">{dataErr}</p>}
        {children.length === 0 && <p className="muted" style={{ textAlign: "center" }}>{tr("Add your first child to start tracking.")}</p>}
        <div className="pickgrid">
          {children.map((c) => (
            <button key={c.id} className="card toolcard" onClick={() => { setActiveChild(c); setReport(null); setJoinMsg(""); setView("parentChild"); }}>
              <div className="toolicon" style={{ background: "var(--purple-soft)", fontSize: 24 }}>{KS_META.find((m) => m.id === c.ks)?.emoji || "🐱"}</div>
              <div style={{ flex: 1 }}>
                <div className="fred" style={{ fontWeight: 600, fontSize: 18 }}>{c.name}</div>
                <div className="muted">{KS_LABEL[c.ks]} · ⭐ {c.overview.stars} · {c.overview.accuracy}% accuracy</div>
              </div>
            </button>
          ))}
        </div>
        {childForm.open ? (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="field"><label>{tr("Child's name")}</label><input className="tin" value={childForm.name} onChange={(e) => setChildForm({ ...childForm, name: e.target.value })} /></div>
            <div className="field"><label>{tr("Key stage")}</label>
              <select className="tin" value={childForm.ks} onChange={(e) => setChildForm({ ...childForm, ks: e.target.value })}>{KS_OPTIONS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></div>
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button className="bigbtn ghost" style={{ marginTop: 0, flex: 1 }} onClick={() => setChildForm({ name: "", ks: "ks1", open: false })}>{tr("Cancel")}</button>
              <button className="bigbtn purple" style={{ marginTop: 0, flex: 1 }} onClick={addChild}>{tr("Add child")}</button>
            </div>
          </div>
        ) : <button className="bigbtn" onClick={() => setChildForm({ ...childForm, open: true })}><Plus size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />{tr("Add a child")}</button>}
        <div className="card" style={{ marginTop: 12 }}>
          <div className="setrow" style={{ borderBottom: "none", padding: 0 }}>
            <div><div style={{ fontWeight: 800 }}>{tr("Weekly email summary")}</div><div className="muted">{tf("Sent to {email}.", { email: session.user.email })}</div></div>
            <button className={`switch ${session.user.weeklyEmail ? "on" : ""}`} role="switch" aria-checked={!!session.user.weeklyEmail} aria-label="Weekly email summary" onClick={toggleWeekly}><span /></button>
          </div>
        </div>
        <button className="bigbtn ghost" onClick={signOut}><LogOut size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />{tr("Sign out")}</button>
        <button className="linkbtn" style={{ color: "var(--bad)", display: "block", margin: "10px auto 0" }} onClick={deleteAccount}>{tr("Delete my account & data")}</button>
      </main>
    );
  }

  /* ---------- PARENT → CHILD ---------- */
  if (view === "parentChild" && activeChild) {
    return (
      <main>
        <Back to={() => setView("parent")} />
        <div className="greet" style={{ marginTop: 4 }}>
          <Mochi size={84} expression="read" />
          <h2 className="fred" style={{ marginTop: 6 }}>{activeChild.name}</h2>
          <p>{KS_LABEL[activeChild.ks]}</p>
        </div>
        <ChildStats o={activeChild.overview} />

        <button className="bigbtn sky" disabled={reportBusy} onClick={makeReport}>
          {reportBusy ? <Loader2 className="wiggle" size={18} /> : <><FileText size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />{tr("Progress report")}</>}
        </button>
        {report && (
          <div className="card" style={{ marginTop: 12 }}>
            <pre className="reporttext">{report.text}</pre>
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <button className="bigbtn purple" style={{ marginTop: 0, flex: 1 }} onClick={emailReport}><Mail size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />{tr("Email")}</button>
              <button className="bigbtn ghost" style={{ marginTop: 0, flex: 1 }} onClick={copyReport}>{tr("Copy")}</button>
            </div>
          </div>
        )}

        <button className="bigbtn mint" onClick={() => { onBind?.(activeChild.id, t); }}>
          <RefreshCw size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />{tf("Sync this device to {name}", { name: activeChild.name })}
        </button>
        <p className="muted" style={{ textAlign: "center", margin: "6px 4px 0" }}>{tf("On {name}'s own device, sign in here and tap this — their progress will follow them.", { name: activeChild.name })}</p>

        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800 }}><Link2 size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />{tr("Link to a teacher's class")}</div>
          <p className="muted" style={{ margin: "4px 0 8px" }}>{tr("Enter the code a teacher gave you so they can set work too (kept separate from your goals).")}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="tin" style={{ flex: 1, textTransform: "uppercase" }} placeholder="ABC123" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
            <button className="bigbtn purple" style={{ marginTop: 0, width: "auto", padding: "12px 18px" }} onClick={joinTeacherClass}>{tr("Link")}</button>
          </div>
          {joinMsg && <p className="muted" style={{ marginTop: 8 }}>{joinMsg}</p>}
        </div>

        <GoalSection token={t} child={activeChild} role="parent" />
        <button className="linkbtn" style={{ color: "var(--bad)", display: "block", margin: "16px auto 0" }} onClick={removeChild}>{tf("Remove {name} & their data", { name: activeChild.name })}</button>
      </main>
    );
  }

  /* ---------- TEACHER HOME ---------- */
  if (view === "teacher") {
    return (
      <main>
        <Back to={onClose} label="Back to app" />
        <div className="greet" style={{ marginTop: 4 }}>
          <GraduationCap size={40} color="#6b4fb0" />
          <h2 className="fred" style={{ marginTop: 6 }}>{tf("Hi {name} 👋", { name: session.user.name || tr("there") })}</h2>
          <p>{tr("Your classes & pupils")}</p>
        </div>
        {dataErr && <p className="err">{dataErr}</p>}
        {!activeClass ? (
          <>
            {classes.length === 0 && <p className="muted" style={{ textAlign: "center" }}>{tr("Create a class to get started.")}</p>}
            <div className="pickgrid">
              {classes.map((c) => (
                <button key={c.id} className="card toolcard" onClick={() => setActiveClass(c)}>
                  <div className="toolicon" style={{ background: "var(--sky-soft)" }}><Users size={26} color="#2b80d6" /></div>
                  <div style={{ flex: 1 }}>
                    <div className="fred" style={{ fontWeight: 600, fontSize: 18 }}>{c.name}</div>
                    <div className="muted">{c.pupils.length === 1 ? tr("1 pupil") : tf("{n} pupils", { n: c.pupils.length })} · {tr("code")} <b>{c.code}</b></div>
                  </div>
                </button>
              ))}
            </div>
            {classForm.open ? (
              <div className="card" style={{ marginTop: 12 }}>
                <div className="field"><label>{tr("Class name")}</label><input className="tin" value={classForm.name} placeholder={tr("e.g. Year 4 Maths")} onChange={(e) => setClassForm({ ...classForm, name: e.target.value })} /></div>
                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <button className="bigbtn ghost" style={{ marginTop: 0, flex: 1 }} onClick={() => setClassForm({ name: "", open: false })}>{tr("Cancel")}</button>
                  <button className="bigbtn purple" style={{ marginTop: 0, flex: 1 }} onClick={addClass}>{tr("Create")}</button>
                </div>
              </div>
            ) : <button className="bigbtn" onClick={() => setClassForm({ ...classForm, open: true })}><Plus size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />{tr("Create a class")}</button>}
            <button className="bigbtn ghost" onClick={signOut}><LogOut size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />{tr("Sign out")}</button>
            <button className="linkbtn" style={{ color: "var(--bad)", display: "block", margin: "10px auto 0" }} onClick={deleteAccount}>{tr("Delete my account & data")}</button>
          </>
        ) : (
          <>
            <Back to={() => setActiveClass(null)} label="Back to classes" />
            <div className="card" style={{ marginTop: 8 }}>
              <div className="fred" style={{ fontWeight: 600, fontSize: 18 }}>{activeClass.name}</div>
              <p className="muted" style={{ margin: "4px 0 8px" }}>{tr("Share this code with parents so they can link their child:")}</p>
              <span className="codechip">{activeClass.code}</span>
            </div>
            <div className="sectitle">{tr("Pupils")}</div>
            <div className="pickgrid">
              {activeClass.pupils.map((p) => (
                <button key={p.id} className="card toolcard" onClick={() => { setActivePupil(p); setView("teacherPupil"); }}>
                  <div className="toolicon" style={{ background: "var(--purple-soft)", fontSize: 22 }}>{KS_META.find((m) => m.id === p.ks)?.emoji || "🐱"}</div>
                  <div style={{ flex: 1 }}>
                    <div className="fred" style={{ fontWeight: 600, fontSize: 17 }}>{p.name}</div>
                    <div className="muted">{KS_LABEL[p.ks]} · ⭐ {p.overview.stars} · {p.overview.accuracy}%</div>
                  </div>
                </button>
              ))}
            </div>
            {pupilForm.open ? (
              <div className="card" style={{ marginTop: 12 }}>
                <div className="field"><label>{tr("Pupil's name")}</label><input className="tin" value={pupilForm.name} onChange={(e) => setPupilForm({ ...pupilForm, name: e.target.value })} /></div>
                <div className="field"><label>{tr("Key stage")}</label>
                  <select className="tin" value={pupilForm.ks} onChange={(e) => setPupilForm({ ...pupilForm, ks: e.target.value })}>{KS_OPTIONS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></div>
                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <button className="bigbtn ghost" style={{ marginTop: 0, flex: 1 }} onClick={() => setPupilForm({ name: "", ks: "ks2", open: false })}>{tr("Cancel")}</button>
                  <button className="bigbtn purple" style={{ marginTop: 0, flex: 1 }} onClick={addPupil}>{tr("Add pupil")}</button>
                </div>
              </div>
            ) : <button className="bigbtn" onClick={() => setPupilForm({ ...pupilForm, open: true })}><Plus size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />{tr("Add a pupil")}</button>}
          </>
        )}
      </main>
    );
  }

  /* ---------- TEACHER → PUPIL ---------- */
  if (view === "teacherPupil" && activePupil) {
    return (
      <main>
        <Back to={() => setView("teacher")} label="Back to class" />
        <div className="greet" style={{ marginTop: 4 }}>
          <Mochi size={84} expression="think" />
          <h2 className="fred" style={{ marginTop: 6 }}>{activePupil.name}</h2>
          <p>{KS_LABEL[activePupil.ks]}</p>
        </div>
        <ChildStats o={activePupil.overview} />
        <GoalSection token={t} child={activePupil} role="teacher" />
      </main>
    );
  }

  return <main><Back to={onClose} /></main>;
}
