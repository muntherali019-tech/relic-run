import { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import {
  Camera, Star, ArrowLeft, ArrowRight, Check, X, RefreshCw, Sparkles, Loader2, Bell,
  Lock, Crown, ScanLine, Lightbulb, BarChart3, Volume2, VolumeX, Settings, Languages as LangIcon, GraduationCap, Mic, Calculator as CalcIcon, Globe,
} from "lucide-react";
import Mochi from "./components/Mochi.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { KS_LABEL, KS_META, SUBJ, SUBJECTS_BY_KS, TOPICS, PLANS, planForKs } from "./data/curriculum.js";
import { LANGUAGES } from "./data/languages.js";
import { BANK } from "./data/bank.js";
import { generateQuestions, markHomework, solveQuestion, voiceCommand, translateText, askTutor } from "./lib/api.js";
import { loadState, saveState, defaultState, recordRound, overview, weakestTopics, recordCourseResult, addStars, touchStreak, DAILY_GOAL, starsToday, dailyDone, markDailyDone } from "./lib/progress.js";
import { badgeStatus, earnedCount, BADGES } from "./lib/achievements.js";
import { burstConfetti } from "./lib/celebrate.js";
import { share as shareThing, siteUrl } from "./lib/share.js";
import { isWeb } from "./lib/platform.js";
import { SHOP, FREE, COLOR_THEMES, setEquipped, itemCost } from "./lib/mochiShop.js";
import * as reminders from "./lib/reminders.js";
const GrownUps = lazy(() => import("./components/GrownUps.jsx"));
import { pickMessage } from "./lib/motivation.js";
import * as cloud from "./lib/cloud.js";
import * as billing from "./lib/billing.js";
import * as speech from "./lib/speech.js";
import { useT, setUiLang, resetTranslations, tf } from "./lib/i18n.js";
import * as recog from "./lib/recognition.js";
import * as review from "./lib/review.js";
import * as trial from "./lib/trial.js";
import { cheer } from "./lib/coach.js";
const Languages = lazy(() => import("./components/Languages.jsx"));
const Courses = lazy(() => import("./components/Courses.jsx"));
const Calc = lazy(() => import("./components/Calculator.jsx"));

// Shown while a lazy-loaded screen's chunk downloads (usually a blink; visible on slow networks).
const ScreenLoading = () => (
  <main style={{ textAlign: "center", marginTop: 60 }}><Loader2 className="wiggle" size={28} color="#FF8A47" aria-label="Loading" /></main>
);

const ROUND_SIZE = 15;
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
const fmtDate = (ts) => new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const accColor = (p) => (p >= 70 ? "var(--good)" : p >= 40 ? "var(--sunny)" : "var(--coral)");

// Set this to your hosted policy before release (or via VITE_PRIVACY_URL at build time).
const PRIVACY_URL = import.meta.env.VITE_PRIVACY_URL || "/privacy";
const TERMS_URL = import.meta.env.VITE_TERMS_URL || "/terms";

// One-time disclosure shown before the camera features send a photo to the AI.
function ConsentCard({ onAccept }) {
  return (
    <div className="card" style={{ marginTop: 8 }}>
      <div className="fred" style={{ fontWeight: 600, fontSize: 18 }}>📸 Before you take a photo</div>
      <p className="muted" style={{ marginTop: 6 }}>
        To give feedback, your photo is sent securely to an AI service and is <b>not stored</b> afterwards.
        Please check with a parent or teacher before using the camera.
      </p>
      <button className="bigbtn purple" onClick={onAccept}>A grown-up is here — continue</button>
      <p className="note" style={{ marginTop: 8 }}>You'll only see this once on this device.</p>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState(loadState);
  // Persist at most every 400ms — a quiz answer updates state several times in
  // a burst, and serializing the whole state per update janks low-end phones.
  const saveTimerRef = useRef(null);
  const latestStateRef = useRef(state);
  useEffect(() => {
    latestStateRef.current = state;
    saveTimerRef.current = setTimeout(() => saveState(state), 400);
    return () => clearTimeout(saveTimerRef.current);
  }, [state]);
  useEffect(() => {
    const flush = () => saveState(latestStateRef.current);
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => { window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", onHide); };
  }, []);

  // Cross-device sync: when bound to a child profile (from the portal), the
  // device pulls that child's progress on load and pushes changes (debounced).
  const [bound, setBound] = useState(() => { try { return JSON.parse(localStorage.getItem("whisker.bound")); } catch { return null; } });
  useEffect(() => { try { bound ? localStorage.setItem("whisker.bound", JSON.stringify(bound)) : localStorage.removeItem("whisker.bound"); } catch {} }, [bound]);
  useEffect(() => {
    let alive = true;
    if (bound?.childId && bound?.token) cloud.getChildState(bound.token, bound.childId).then((s) => { if (alive && s) setState((p) => ({ ...p, ...s })); }).catch(() => {});
    return () => { alive = false; };
  }, [bound?.childId]);
  const pushRef = useRef(null);
  useEffect(() => {
    if (!bound?.childId || !bound?.token) return;
    clearTimeout(pushRef.current);
    pushRef.current = setTimeout(() => { cloud.putChildState(bound.token, bound.childId, state).catch(() => {}); }, 1200);
    return () => clearTimeout(pushRef.current);
  }, [state, bound?.childId]);

  const [screen, setScreen] = useState("home");
  const [ks, setKs] = useState(null);
  const [subject, setSubject] = useState(null);
  const [topic, setTopic] = useState(null);
  const [pendingKs, setPendingKs] = useState(null);

  // gameplay
  const [questions, setQuestions] = useState([]);
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [loadingQ, setLoadingQ] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);

  // homework
  const [hw, setHw] = useState({ preview: null, data: null, mime: null });
  const [marking, setMarking] = useState(false);
  const [markResult, setMarkResult] = useState(null);
  const [markError, setMarkError] = useState(null);
  const hwRef = useRef(null);

  // scan & solve
  const [sv, setSv] = useState({ preview: null, data: null, mime: null });
  const [solveText, setSolveText] = useState("");
  const [solving, setSolving] = useState(false);
  const [solveResult, setSolveResult] = useState(null);
  const [solveError, setSolveError] = useState(null);
  const svRef = useRef(null);

  // grown-ups gate (also used to gate purchases)
  const [gate, setGate] = useState({ a: 7, b: 8, val: "", err: false, intent: "dashboard", plan: null });
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState(null);
  const [photoConsent, setPhotoConsent] = useState(() => { try { return localStorage.getItem("whisker.photoConsent") === "1"; } catch { return false; } });

  const goHome = () => { setScreen("home"); setKs(null); setSubject(null); setTopic(null); };
  const openPrivacy = () => { try { window.open(PRIVACY_URL, "_blank", "noopener"); } catch {} };
  const openTerms = () => { try { window.open(TERMS_URL, "_blank", "noopener"); } catch {} };
  const acceptPhotoConsent = () => { try { localStorage.setItem("whisker.photoConsent", "1"); } catch {} setPhotoConsent(true); };

  function chooseKs(id) {
    if (state.subs[planForKs(id)] || trial.trialActive()) { setKs(id); setSubject(null); setScreen("menu"); }
    else { setPendingKs(id); setScreen("paywall"); }
  }
  function startTrialFor(id) { trial.startTrial(); if (id) { setKs(id); setSubject(null); setScreen("menu"); } else setScreen("home"); }

  async function startRound(ksVal, subjectVal, topicName, count = ROUND_SIZE, isDaily = false) {
    setDailyActive(isDaily);
    setKs(ksVal); setSubject(subjectVal); setTopic(topicName);
    setScreen("play"); setQi(0); setPicked(null); setCorrectCount(0); setStreak(0); setBestStreak(0);
    setLoadingQ(true); setUsedFallback(false); setQuestions([]);
    try {
      const qs = await generateQuestions({ ks: ksVal, subject: subjectVal, topic: topicName, count, language: langName() });
      if (qs.length < Math.min(10, count)) throw new Error("thin");
      setQuestions(qs);
    } catch {
      setQuestions(shuffle(BANK[`${ksVal}_${subjectVal}`] || []).slice(0, count));
      setUsedFallback(true);
    } finally { setLoadingQ(false); }
  }
  // Daily challenge: a short, free, rotating bonus round to pull learners back each day.
  const [dailyActive, setDailyActive] = useState(false);
  const dayNum = Math.floor(Date.now() / 86400000);
  function dailyPick() {
    const combos = [];
    for (const ks of ["ks1", "ks2"]) for (const subj of ["maths", "english"]) {
      const list = TOPICS[ks]?.[subj] || []; if (list.length) combos.push({ ks, subj, list });
    }
    if (!combos.length) return { ks: "ks2", subject: "maths", topic: "Times tables" };
    const c = combos[dayNum % combos.length];
    return { ks: c.ks, subject: c.subj, topic: c.list[dayNum % c.list.length][0] };
  }
  function startDaily() { const p = dailyPick(); startRound(p.ks, p.subject, p.topic, 5, true); }

  function answer(i) {
    if (picked !== null) return;
    setPicked(i);
    const q = questions[qi];
    const right = i === q.answerIndex;
    if (right) {
      const ns = streak + 1;
      setStreak(ns); setBestStreak((b) => Math.max(b, ns)); setCorrectCount((c) => c + 1);
      setState((s) => addStars(s, 1));
      const milestone = [3, 5, 10, 15].includes(ns) ? `${cheer("streak")} ` : "";
      speech.speak(`Purr-fect! ${milestone}${q.explanation || ""}`);
    } else {
      setStreak(0);
      speech.speak(`Good try! ${q.explanation || ""}`);
    }
  }
  function nextQ() {
    if (qi + 1 < questions.length) { setQi(qi + 1); setPicked(null); }
    else {
      setState((s) => {
        let ns = touchStreak(recordRound(s, { ks, subject, topic, total: questions.length, correct: correctCount, bestStreak }));
        if (dailyActive && !dailyDone(ns)) ns = markDailyDone(ns, 5);
        return ns;
      });
      setDailyActive(false);
      setQi(questions.length);
      maybeQualifyReferral();
      if (correctCount / questions.length >= 0.8) burstConfetti();
      speech.speak(`Round complete! You got ${correctCount} out of ${questions.length} right. Great work!`);
    }
  }

  function readImage(file, set) {
    const r = new FileReader();
    r.onload = () => set({ preview: r.result, data: String(r.result).split(",")[1], mime: file.type || "image/jpeg" });
    r.readAsDataURL(file);
  }
  function onHwFile(e) { const f = e.target.files?.[0]; if (!f) return; setMarkResult(null); setMarkError(null); readImage(f, setHw); }
  function onSvFile(e) { const f = e.target.files?.[0]; if (!f) return; setSolveResult(null); setSolveError(null); readImage(f, setSv); }

  async function doMark() {
    if (!hw.data) return;
    setMarking(true); setMarkError(null); setMarkResult(null);
    try { const r = await markHomework({ ks, subject, image: { data: hw.data, mime: hw.mime }, language: langName() }); setMarkResult(r); speech.speak(r?.summary || "All done!"); }
    catch (e) { setMarkError(e?.name === "ApiError" ? e.message : "Mochi couldn't read that. Marking needs internet — try a clear, well-lit photo."); }
    finally { setMarking(false); }
  }
  async function doSolve() {
    if (!sv.data && !solveText.trim()) return;
    setSolving(true); setSolveError(null); setSolveResult(null);
    try { const r = await solveQuestion({ ks, image: sv.data ? { data: sv.data, mime: sv.mime } : null, text: solveText, language: langName() }); setSolveResult(r); speech.speak(`${r?.answer ? r.answer + ". " : ""}${r?.concept || ""}`); }
    catch (e) { setSolveError(e?.name === "ApiError" ? e.message : "Mochi couldn't solve that. Solving needs internet — try a clearer photo or type the question."); }
    finally { setSolving(false); }
  }

  function openGate(intent = "dashboard", plan = null) {
    setGate({ a: 6 + Math.floor(Math.random() * 4), b: 6 + Math.floor(Math.random() * 4), val: "", err: false, intent, plan });
    setScreen("gate");
  }
  function checkGate() {
    if (Number(gate.val) !== gate.a * gate.b) { setGate((g) => ({ ...g, val: "", err: true })); return; }
    if (gate.intent === "purchase" && gate.plan) confirmPurchase(gate.plan);
    else setScreen("dashboard");
  }
  // Purchases sit behind the grown-up gate (Google Play Families requirement) and go
  // through the billing abstraction (Play Billing-ready) rather than a direct unlock.
  function requestPurchase(plan) { setBuyError(null); openGate("purchase", plan); }
  async function confirmPurchase(plan) {
    setBuying(true); setBuyError(null);
    try {
      if (billing.mode() === "stripe" && !cloud.getSession?.()?.token) {
        setBuying(false);
        setBuyError(t("Please create a free account first so your subscription is saved to you."));
        setScreen("grownups");
        return;
      }
      const r = await billing.purchase(plan);
      if (r?.redirect) return;            // we're leaving for Stripe's hosted checkout page
      if (r?.ok) {
        setState((s) => ({ ...s, subs: { ...s.subs, [plan]: true } }));
        if (pendingKs) { setKs(pendingKs); setSubject(null); setScreen("menu"); }
        else setScreen("plans");
      } else { setBuyError("Purchase didn't complete. Please try again."); setScreen(pendingKs ? "paywall" : "plans"); }
    } catch (e) { setBuyError(e.message || "Purchase failed."); setScreen(pendingKs ? "paywall" : "plans"); }
    finally { setBuying(false); }
  }
  async function restorePurchases() {
    setBuyError(null);
    try {
      const r = await billing.restore();
      const ent = r?.entitlements || (r?.ok ? await billing.getEntitlements() : null);
      if (ent) setState((s) => ({ ...s, subs: { ...s.subs, ...ent } }));
    } catch (e) { setBuyError(e.message || "Couldn't restore purchases."); }
  }
  const [manageMsg, setManageMsg] = useState("");
  async function manageSub() {
    setManageMsg("");
    const r = await billing.openManageSubscription();
    if (!r?.ok && !r?.redirect) setManageMsg(r?.error || t("Subscription management becomes available once billing is set up."));
  }
  const [shareMsg, setShareMsg] = useState("");
  async function shareScore(c, n) {
    const r = await shareThing({ text: tf("I scored {c}/{n} on Education Academy! 🐱⭐ Learn with Mochi:", { c, n }), url: siteUrl() });
    setShareMsg(r === "copied" ? t("Copied! Paste it anywhere to share.") : "");
  }
  async function inviteFriend() {
    const url = myRef ? `${siteUrl()}/?ref=${myRef}` : siteUrl();
    const text = t("Come and learn with Mochi on Education Academy! 🐱") + (myRef ? " " + t("We'll both get bonus stars.") : "");
    const r = await shareThing({ text, url });
    setShareMsg(r === "copied" ? t("Invite link copied!") : "");
  }
  // Weekly family/class leaderboard
  const [board, setBoard] = useState(null);
  const [boardScope, setBoardScope] = useState("");
  const [boardBusy, setBoardBusy] = useState(false);
  useEffect(() => {
    if (screen !== "board" || !bound?.token || !bound?.childId) return;
    let alive = true; setBoardBusy(true);
    cloud.leaderboard(bound.token, bound.childId)
      .then((d) => { if (alive) { setBoard(d.board || []); setBoardScope(d.scope || ""); } })
      .catch(() => { if (alive) setBoard([]); })
      .finally(() => { if (alive) setBoardBusy(false); });
    return () => { alive = false; };
  }, [screen, bound]);
  const [cookieOk, setCookieOk] = useState(() => { try { return localStorage.getItem("whisker.cookieok") === "1"; } catch { return true; } });
  const acceptCookies = () => { try { localStorage.setItem("whisker.cookieok", "1"); } catch {} setCookieOk(true); };
  // Mochi shop: stars buy cosmetics; the equipped look is mirrored to where Mochi reads it.
  const [, setMochiTick] = useState(0);
  useEffect(() => { if (state.mochi) { setEquipped(state.mochi); setMochiTick((n) => n + 1); } }, []);
  const owns = (id) => FREE.has(id) || (state.owned || []).includes(id);
  function buyItem(id) { const cost = itemCost(id); setState((s) => (owns(id) || (s.stars || 0) < cost) ? s : { ...s, stars: s.stars - cost, owned: [...(s.owned || []), id] }); }
  function buyFreeze(cost) { setState((s) => ((s.stars || 0) < cost ? s : { ...s, stars: s.stars - cost, freezes: (s.freezes || 0) + 1 })); }
  function equipItem(kind, id) { setState((s) => { const mochi = { ...(s.mochi || { color: "ginger", hat: "none", glasses: false }), [kind]: id }; setEquipped(mochi); return { ...s, mochi }; }); }
  function toggleGlasses() { setState((s) => { const cur = s.mochi || { color: "ginger", hat: "none", glasses: false }; const mochi = { ...cur, glasses: !cur.glasses }; setEquipped(mochi); return { ...s, mochi }; }); }
  // Daily reminder (installed app only)
  const [reminder, setReminder] = useState(() => reminders.getPref());
  const [reminderMsg, setReminderMsg] = useState("");
  async function toggleReminder() {
    if (reminder.on) { await reminders.disable(); setReminder((r) => ({ ...r, on: false })); setReminderMsg(""); }
    else {
      const r = await reminders.enable(reminder.hour, reminder.minute);
      if (r.ok) { setReminder((p) => ({ ...p, on: true })); setReminderMsg(""); }
      else setReminderMsg(r.denied ? t("Allow notifications in your phone settings to use reminders.") : t("Reminders work on the installed app."));
    }
  }
  async function changeReminderTime(e) {
    const [h, m] = e.target.value.split(":").map(Number);
    setReminder((r) => ({ ...r, hour: h, minute: m }));
    if (reminder.on) await reminders.enable(h, m); else reminders.setPref({ on: false, hour: h, minute: m });
  }
  // Ask Mochi — Socratic tutor chat
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const chatEndRef = useRef(null);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [chatMsgs, chatBusy]);
  function openAsk() {
    const ok = state.subs.junior || state.subs.adult || trial.trialActive();
    if (!ok) { setPendingKs(ks || "ks2"); setScreen("paywall"); return; }
    if (chatMsgs.length === 0) setChatMsgs([{ role: "mochi", text: t("Hi! I'm Mochi. Ask me anything you're learning and I'll help you work it out. 🐾") }]);
    setScreen("ask");
  }
  async function sendChat(text) {
    const q = (text != null ? text : chatInput).trim();
    if (!q || chatBusy) return;
    const next = [...chatMsgs, { role: "user", text: q }];
    setChatMsgs(next); setChatInput(""); setChatBusy(true);
    try {
      const reply = await askTutor({ messages: next.slice(-12), ks: ks || "ks2", language: langName() });
      const say = reply || t("Let's try that again.");
      setChatMsgs((m) => [...m, { role: "mochi", text: say }]);
      speech.speak(say);
    } catch {
      setChatMsgs((m) => [...m, { role: "mochi", text: t("I couldn't reach my brain just now — please try again.") }]);
    } finally { setChatBusy(false); }
  }
  // Smart Practice — auto-targets the learner's weakest topic
  const [smartMsg, setSmartMsg] = useState("");
  function startSmart() {
    const w = weakestTopics(state, 1)[0];
    if (!w) { setSmartMsg(t("Play a few rounds first and I'll target your tricky topics.")); return; }
    const ok = state.subs[planForKs(w.ks)] || trial.trialActive();
    if (!ok) { setPendingKs(w.ks); setScreen("paywall"); return; }
    setSmartMsg(""); startRound(w.ks, w.subject, w.topic, ROUND_SIZE);
  }
  const resetProgress = () => { if (confirm("Clear all stars and progress? Your plan stays active.")) setState((s) => ({ ...defaultState(), subs: s.subs })); };
  // Referral anti-abuse: tell the server this account did its first round, so the bonus
  // is only granted to real, engaged users. Idempotent; we also self-claim immediately.
  function maybeQualifyReferral() {
    const tok = cloud.getSession?.()?.token; if (!tok) return;
    try { if (localStorage.getItem("whisker.qualified") === "1") return; } catch {}
    cloud.qualifyReferral(tok).then((credited) => {
      try { localStorage.setItem("whisker.qualified", "1"); } catch {}
      if (credited) cloud.claimReferral(tok).then((bonus) => { if (bonus > 0) { setState((s) => addStars(s, bonus)); setSmartMsg(tf("🎁 +{n} bonus stars — thanks for joining!", { n: bonus })); } }).catch(() => {});
    }).catch(() => {});
  }

  // ---- voice + accessibility ----
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => speech.onSpeakingChange(setSpeaking), []);
  const [voiceOn, setVoiceOnState] = useState(speech.getVoiceOn);
  const [narrateOn, setNarrateOnState] = useState(speech.getNarrateOn);
  const [guideOn, setGuideOnState] = useState(speech.getGuideOn);
  const [voiceLang, setVoiceLangState] = useState(speech.getLang);
  const [guideMsg, setGuideMsg] = useState("");
  const t = useT();
  const trCache = useRef({});
  const toggleVoice = () => { const v = !voiceOn; setVoiceOnState(v); speech.setVoiceOn(v); };
  const toggleNarrate = () => { const v = !narrateOn; setNarrateOnState(v); speech.setNarrateOn(v); };
  const toggleGuide = () => { const v = !guideOn; setGuideOnState(v); speech.setGuideOn(v); if (v) guide("Okay, I'll guide you along the way."); else { speech.stop(); setGuideMsg(""); } };
  const setVoiceLang = (code) => { setVoiceLangState(code); speech.setLang(code); setUiLang(code); };
  const OPTION_WORD = { en: "Option", es: "Opción", fr: "Option", zh: "选项", ru: "Вариант", ar: "خيار", pt: "Opção", hi: "विकल्प" };
  const optionWord = () => OPTION_WORD[speech.getLang().split("-")[0]] || "Option";
  const langName = () => (LANGUAGES.find((l) => l.code === speech.getLang()) || {}).name || "English";
  const narrateText = (q) => `${q.question}. ${(q.choices || []).map((c, i) => `${optionWord()} ${i + 1}: ${c}`).join(". ")}`;
  const sayQuestion = (q) => speech.speak(narrateText(q), { respectSetting: false });

  // Speak + show a guide line, translated into Mochi's current language (English by default).
  async function localizedSpeak(textEN, opts = {}) {
    const code = speech.getLang();
    let out = textEN;
    if (code && !code.startsWith("en")) {
      const lang = (LANGUAGES.find((l) => l.code === code) || {}).name || "English";
      const key = `${code}|${textEN}`;
      if (trCache.current[key]) out = trCache.current[key];
      else { try { out = await translateText({ text: textEN, language: lang }); trCache.current[key] = out; } catch { out = textEN; } }
    }
    setGuideMsg(out);
    setTimeout(() => setGuideMsg((c) => (c === out ? "" : c)), 7000);
    speech.speak(out, opts);
    return out;
  }
  const guide = (textEN) => { if (guideOn) localizedSpeak(textEN); };

  // Mochi welcomes once per session, then offers a short spoken+visual tip on each new screen.
  const greetedRef = useRef(false);
  const firstDailyRef = useRef(false);
  useEffect(() => { setUiLang(speech.getLang()); }, []);
  const [online, setOnline] = useState(typeof navigator === "undefined" || navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  const rtl = !!(LANGUAGES.find((l) => l.code === voiceLang) || {}).rtl;
  useEffect(() => {
    try { document.documentElement.dir = rtl ? "rtl" : "ltr"; document.documentElement.lang = String(voiceLang || "en").split("-")[0]; } catch {}
  }, [voiceLang, rtl]);
  useEffect(() => {
    if (screen === "home" && guideOn && !onboard && !greetedRef.current) {
      greetedRef.current = true;
      guide("Welcome to Education Academy! I'm Mochi. Tap a stage to learn, push the microphone to talk to me, or open the calculator.");
    }
  }, [screen, guideOn, onboard]);
  // Get new users to a win fast: auto-open the (free) Daily Challenge once, after onboarding.
  useEffect(() => {
    if (onboard || firstDailyRef.current) return;
    try { if (localStorage.getItem("whisker.firstdaily") === "1") { firstDailyRef.current = true; return; } } catch {}
    if (screen === "home" && (state.history?.length || 0) === 0 && !dailyDone(state)) {
      firstDailyRef.current = true;
      try { localStorage.setItem("whisker.firstdaily", "1"); } catch {}
      setTimeout(() => startDaily(), 700);
    }
  }, [onboard, screen]);

  const lastGuideScreen = useRef("home");
  useEffect(() => {
    if (!guideOn || screen === lastGuideScreen.current) return;
    lastGuideScreen.current = screen;
    const hints = {
      plans: "Pick a plan, or start your free trial to unlock everything for seventy-two hours.",
      menu: "Choose a subject, then a topic, and I'll cheer you on!",
      courses: "Choose a course, then revise a module or sit a mock exam.",
      calc: "Here's your calculator. Tap the buttons and I'll read the answer.",
      languages: "Let's learn a language together. Tap any phrase to hear it.",
      grownups: "This is the grown-ups area, for progress and reports.",
      settings: "Here you can change my voice, my language, and turn guidance on or off.",
    };
    if (hints[screen]) guide(hints[screen]);
  }, [screen, guideOn]);

  // Read the question and options aloud when "read aloud" is on.
  useEffect(() => {
    if (screen === "play" && narrateOn && picked === null && questions[qi]) speech.speak(narrateText(questions[qi]));
  }, [screen, qi, questions, narrateOn, picked]);

  // In production billing, recognise existing subscribers and show local prices on launch.
  const [prices, setPrices] = useState(null);
  useEffect(() => {
    if (billing.mode() !== "play") return;
    let alive = true;
    billing.getEntitlements().then((ent) => { if (alive && ent) setState((s) => ({ ...s, subs: { ...s.subs, ...ent } })); }).catch(() => {});
    billing.getPrices().then((p) => { if (alive && p) setPrices(p); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const priceFor = (plan) => (prices && prices[plan]) || PLANS[plan].price;
  // Web subscriptions live on the account: load them on launch, confirm after Stripe checkout,
  // surface the referral code, and claim any bonus stars from a friend's invite.
  const [checkoutDone, setCheckoutDone] = useState(false);
  const [myRef, setMyRef] = useState(null);
  useEffect(() => {
    let alive = true;
    const refreshAccount = () => {
      const tok = cloud.getSession?.()?.token;
      if (!tok) return;
      cloud.me(tok).then((r) => {
        const u = r?.user || {}; if (!alive) return;
        if (u.subs) setState((s) => ({ ...s, subs: { ...s.subs, ...u.subs } }));
        if (u.referralCode) setMyRef(u.referralCode);
        if ((u.pendingBonus || 0) > 0) {
          cloud.claimReferral(tok).then((bonus) => { if (alive && bonus > 0) { setState((s) => addStars(s, bonus)); setSmartMsg(tf("🎁 +{n} bonus stars from a friend!", { n: bonus })); } }).catch(() => {});
        }
      }).catch(() => {});
    };
    refreshAccount();
    try {
      const q = new URLSearchParams(window.location.search);
      const ref = q.get("ref"); if (ref) { try { localStorage.setItem("whisker.ref", ref); } catch {} }
      if (q.get("checkout") === "success") { setCheckoutDone(true); setTimeout(refreshAccount, 1500); }
      if (q.get("checkout") || ref) window.history.replaceState({}, "", window.location.pathname);
    } catch {}
    return () => { alive = false; };
  }, []);
  // First-launch language chooser so new users worldwide start in their own language.
  const [onboard, setOnboard] = useState(() => { try { return localStorage.getItem("whisker.onboarded") !== "1"; } catch { return false; } });
  const detectedLang = LANGUAGES.find((l) => String((typeof navigator !== "undefined" && navigator.language) || "").toLowerCase().startsWith(l.id));
  function pickOnboardLang(code) { try { localStorage.setItem("whisker.onboarded", "1"); } catch {} if (code) setVoiceLang(code); setOnboard(false); }
  const billingNote = billing.mode() === "stripe"
    ? t("A grown-up confirms before any purchase. Secure checkout is handled by Stripe.")
    : billing.mode() === "play"
      ? t("A grown-up confirms before any purchase. Payment is handled securely by Google Play.")
      : t("A grown-up confirms before any purchase. This is demo mode — no real payment is taken.");

  const onStageScreen = ["menu", "play", "solve", "mark"].includes(screen);
  const themeKs = onStageScreen && ks ? ks : "home";
  const motiv = useMemo(() => pickMessage(themeKs), [themeKs]);

  const ov = useMemo(() => overview(state), [state.stats]);
  const weak = useMemo(() => weakestTopics(state), [state.stats]);

  /* ---------- AI voice commands ---------- */
  const [vListening, setVListening] = useState(false);
  const [vMsg, setVMsg] = useState("");
  const [vGate, setVGate] = useState(null); // { a, b, val, err }
  const micOk = () => { try { return localStorage.getItem("whisker.micOk") === "1"; } catch { return false; } }
  function flashMsg(m) { setVMsg(m); setTimeout(() => setVMsg((cur) => (cur === m ? "" : cur)), 3500); }

  function runVoiceAction(r) {
    const act = (r && r.action) || "unknown";
    if (r && r.say && act !== "setLanguage" && act !== "unknown") speech.speak(r.say);
    switch (act) {
      case "home": goHome(); break;
      case "plans": setPendingKs(null); setScreen("plans"); break;
      case "courses": if (state.subs.adult || trial.trialActive()) setScreen("courses"); else { setPendingKs("he"); setScreen("paywall"); } break;
      case "languages": setScreen("languages"); break;
      case "calculator": setScreen("calc"); break;
      case "grownups": openGate(); break;
      case "settings": setScreen("settings"); break;
      case "setLanguage": {
        const want = String(r.language || "").toLowerCase().trim();
        const lang = LANGUAGES.find((l) => l.name.toLowerCase() === want || l.id === want || l.endonym.toLowerCase() === want || want.includes(l.name.toLowerCase()));
        if (lang) { setVoiceLang(lang.code); localizedSpeak(`Great! I'll talk to you in ${lang.name} now.`, { respectSetting: false }); }
        else flashMsg("I can speak English, Spanish, French, Mandarin, Russian, Arabic, Portuguese or Hindi.");
        break;
      }
      case "play": {
        const k = ["ks1", "ks2", "ks3", "he"].includes(r.ks) ? r.ks : (ks || "ks2");
        const subj = ["maths", "english", "science"].includes(r.subject) ? r.subject : null;
        if (!(state.subs[planForKs(k)] || trial.trialActive())) { setPendingKs(k); setScreen("paywall"); break; }
        const n = Number(r.count) > 0 ? Math.min(30, Math.max(3, Math.round(Number(r.count)))) : ROUND_SIZE;
        if (subj && r.topic) startRound(k, subj, String(r.topic), n);
        else { setKs(k); setSubject(subj); setScreen("menu"); }
        break;
      }
      default: speech.speak("Sorry, I didn't catch that."); flashMsg("Try: \u201Cgive me 10 KS2 fractions questions\u201D or \u201Cspeak in French\u201D.");
    }
  }

  function doListen() {
    if (!recog.supported()) { flashMsg("Voice isn't supported on this browser."); return; }
    setVListening(true); setVMsg("Listening\u2026");
    recog.listen({
      lang: "en-GB",
      onResult: async (alts) => {
        const transcript = (alts && alts[0]) || "";
        setVListening(false);
        if (!transcript) { flashMsg("I didn't hear anything."); return; }
        setVMsg(`\u201C${transcript}\u201D`);
        try {
          const r = await voiceCommand({ transcript, actions: ["home", "plans", "courses", "languages", "calculator", "grownups", "settings", "play"] });
          runVoiceAction(r);
        } catch { flashMsg("Voice commands need an internet connection."); }
      },
      onError: () => { setVListening(false); flashMsg("Couldn't hear you — check microphone access."); },
      onEnd: () => setVListening(false),
    });
  }

  function startVoice() {
    if (vListening) return;
    if (!recog.supported()) { flashMsg("Voice isn't supported on this browser."); return; }
    if (!micOk()) { setVGate({ a: 2 + Math.floor(Math.random() * 7), b: 2 + Math.floor(Math.random() * 7), val: "", err: false }); return; }
    doListen();
  }
  function submitVGate() {
    if (parseInt(vGate.val, 10) === vGate.a * vGate.b) { try { localStorage.setItem("whisker.micOk", "1"); } catch {} setVGate(null); doListen(); }
    else setVGate({ ...vGate, err: true, val: "" });
  }

  return (
    <div className={`wa-shell theme-${themeKs}`} dir={rtl ? "rtl" : "ltr"}>
      <header className="topbar">
        <div className="brand">
          <Mochi size={44} expression="idle" />
          <div><h1 className="fred">Education Academy</h1><span>{t("Learn & play with Mochi")}</span></div>
        </div>
        <div className="topbtns">
          <button className="iconbtn" aria-label="Voice command" onClick={startVoice}><Mic size={20} color={vListening ? "#e8633f" : "#6b4fb0"} /></button>
          <button className="iconbtn" aria-label={voiceOn ? "Turn Mochi's voice off" : "Turn Mochi's voice on"} aria-pressed={voiceOn} onClick={toggleVoice}>{voiceOn ? <Volume2 size={20} color="#129a83" /> : <VolumeX size={20} color="#9b8a7a" />}</button>
          <button className="iconbtn" aria-label="Settings" onClick={() => setScreen("settings")}><Settings size={20} color="#6b4fb0" /></button>
          <button className="iconbtn" aria-label="Grown-ups dashboard" onClick={openGate}><BarChart3 size={20} color="#6b4fb0" /></button>
          <button className="iconbtn" aria-label="Plans" onClick={() => { setPendingKs(null); setScreen("plans"); }}><Crown size={20} color="#F2A33A" /></button>
          <div className="starcount"><Star size={18} fill="#FFC83D" color="#FFC83D" />{state.stars}</div>
        </div>
      </header>
      {!online && <div className="offlinebar">{t("You're offline — Mochi will use saved content where possible.")}</div>}

      {/* AI voice command (floating mic) */}
      {recog.supported() && (<>
        {vMsg && <div className="micmsg">{vMsg}</div>}
        <button className={`micfab ${vListening ? "live" : ""}`} aria-label="Voice command" onClick={startVoice}><Mic size={26} /></button>
      </>)}
      {guideMsg && (
        <div className="guidebubble" role="status" aria-live="polite">
          <span style={{ flex: "none" }}><Mochi size={34} expression="happy" speaking={speaking} /></span>
          <span style={{ flex: 1 }}>{guideMsg}</span>
          <button className="guideclose" aria-label="Dismiss" onClick={() => { setGuideMsg(""); speech.stop(); }}>×</button>
        </div>
      )}
      {vGate && (
        <div className="gatewrap" role="dialog" aria-modal="true">
          <div className="gatecard">
            <h3 className="fred" style={{ marginTop: 0 }}>Grown-up check</h3>
            <p className="muted">To use voice commands, please solve: <b>{vGate.a} × {vGate.b}</b></p>
            <input className="gateinput" inputMode="numeric" value={vGate.val} aria-label="Answer" onChange={(e) => setVGate({ ...vGate, val: e.target.value.replace(/[^0-9]/g, ""), err: false })} />
            {vGate.err && <p className="err" style={{ marginTop: 6 }}>Not quite — try again.</p>}
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <button className="bigbtn ghost" style={{ flex: 1 }} onClick={() => setVGate(null)}>Cancel</button>
              <button className="bigbtn purple" style={{ flex: 1 }} onClick={submitVGate}>Enable</button>
            </div>
          </div>
        </div>
      )}
      {/* ---------- POST-CHECKOUT SUCCESS (web) ---------- */}
      {checkoutDone && (
        <div className="gatewrap" role="dialog" aria-modal="true">
          <div className="gatecard" style={{ maxWidth: 340, textAlign: "center" }}>
            <Mochi size={92} expression="happy" />
            <h3 className="fred" style={{ marginTop: 6 }}>{t("You're all set! 🎉")}</h3>
            <p className="muted">{t("Your subscription is active. Enjoy learning with Mochi!")}</p>
            <button className="bigbtn mint" style={{ marginTop: 10 }} onClick={() => { setCheckoutDone(false); setScreen("home"); }}>{t("Start learning")}</button>
          </div>
        </div>
      )}
      {/* ---------- COOKIE NOTICE (web only) ---------- */}
      {isWeb() && !cookieOk && !onboard && !checkoutDone && (
        <div className="consent" role="dialog" aria-label="Cookie notice">
          <p>{t("We use only essential storage to make the app work — no ads, no tracking.")} <a href={PRIVACY_URL} target="_blank" rel="noopener">{t("Privacy")}</a></p>
          <button className="bigbtn mint" style={{ width: "auto", padding: "10px 18px", margin: 0 }} onClick={acceptCookies}>{t("Got it")}</button>
        </div>
      )}
      {/* ---------- FIRST-LAUNCH LANGUAGE PICKER ---------- */}
      {onboard && (
        <div className="gatewrap" role="dialog" aria-modal="true">
          <div className="gatecard" style={{ maxWidth: 360 }}>
            <div style={{ textAlign: "center" }}><Mochi size={72} expression="happy" /></div>
            <h3 className="fred" style={{ marginTop: 6, textAlign: "center" }}>Choose your language</h3>
            <p className="muted" style={{ textAlign: "center", marginTop: 2 }}>You can change this any time in Settings.</p>
            <div style={{ display: "grid", gap: 8, marginTop: 12, maxHeight: "46vh", overflowY: "auto" }}>
              {[...LANGUAGES].sort((a, b) => (a === detectedLang ? -1 : b === detectedLang ? 1 : 0)).map((l) => (
                <button key={l.id} className="rowbtn" style={{ border: "2px solid #eadfce", borderRadius: 14, padding: "12px 14px" }} onClick={() => pickOnboardLang(l.code)} aria-label={l.name}>
                  <span style={{ fontSize: 22, marginInlineEnd: 10 }}>{l.emoji}</span>
                  <span style={{ flex: 1 }}><span style={{ fontWeight: 800 }}>{l.endonym}</span> <span className="muted">· {l.name}</span></span>
                  {l === detectedLang && <Check size={16} color="#129a83" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* ---------- HOME ---------- */}
      {screen === "home" && (
        <main>
          <div className="greet">
            <div className="bob" style={{ display: "inline-block" }}><Mochi size={140} expression="happy" speaking={speaking} /></div>
            <h2 className="fred">{t("Hello! I'm Mochi 🐾")}</h2>
            <p>{t("Who's learning today?")}</p>
          </div>
          <div className="motiv"><Sparkles size={18} className="spark" color="#F2A33A" />{motiv}</div>
          <div className="todayStrip">
            <button className="chip tap" onClick={() => setScreen("badges")} aria-label="Badges">🏅 {tf("{e} of {t} earned", { e: earnedCount(state), t: BADGES.length })}</button>
            <button className="chip tap" onClick={() => setScreen("shop")} aria-label="Shop">🎩 {t("Shop")}</button>
            <button className="chip tap" onClick={() => setScreen("board")} aria-label="Leaderboard">🏆 {t("Leaderboard")}</button>
            {state.streakDays > 0 && <span className="chip flame">🔥 {tf("{d} day streak", { d: state.streakDays })}</span>}
            <span className="goalring" style={{ "--p": Math.min(100, Math.round((starsToday(state) / DAILY_GOAL) * 100)) }} title={t("Daily goal")} aria-label={t("Daily goal")}>
              <i>{starsToday(state)}/{DAILY_GOAL}</i>
            </span>
          </div>
          <button className={`daily ${dailyDone(state) ? "done" : ""}`} onClick={() => !dailyDone(state) && startDaily()} disabled={dailyDone(state)}>
            <span className="dico">⚡</span>
            <span style={{ flex: 1, textAlign: "left" }}>
              <span className="fred" style={{ fontWeight: 700, fontSize: 17 }}>{t("Daily Challenge")}</span>
              <span className="muted" style={{ display: "block", fontSize: 13 }}>{dailyDone(state) ? t("Daily challenge done ✓") : "+5 ⭐"}</span>
            </span>
            {!dailyDone(state) && <ArrowRight size={20} />}
          </button>
          <div className="homeq">
            <button className="qbtn" onClick={openAsk}>💬 {t("Ask Mochi")}</button>
            <button className="qbtn" onClick={startSmart}>🎯 {t("Smart Practice")}</button>
          </div>
          {smartMsg && <p className="note" style={{ textAlign: "center", marginTop: 4 }}>{smartMsg}</p>}
          <div className="pickgrid">
            {KS_META.map((m) => {
              const subbed = state.subs[m.plan];
              const unlocked = subbed || trial.trialActive();
              return (
                <button key={m.id} className="pick" style={{ background: m.grad }} onClick={() => chooseKs(m.id)}>
                  <div className="em">{m.emoji}</div>
                  <div style={{ flex: 1 }}><div className="tt">{KS_LABEL[m.id]}</div><div className="ds">{m.age}</div></div>
                  <span className="lockbadge">{subbed ? <><Check size={14} /> {t("Unlocked")}</> : unlocked ? <><Check size={14} /> {t("Free trial")}</> : <><Lock size={13} /> {priceFor(m.plan)}/mo</>}</span>
                </button>
              );
            })}
          </div>
          <button className="card toolcard" onClick={() => setScreen("languages")} aria-label="Open Languages">
            <div className="toolicon" style={{ background: "var(--mint-soft, #dcf7f1)", fontSize: 24 }} aria-hidden="true">🌍</div>
            <div style={{ flex: 1 }}><div className="fred" style={{ fontWeight: 600, fontSize: 19 }}>{t("Languages")}</div>
              <div style={{ fontWeight: 700, color: "var(--muted)", fontSize: 13 }}>{t("Speak with your AI teacher — 8 languages")}</div></div>
            <LangIcon size={22} color="#129a83" />
          </button>
          <button className="card toolcard" onClick={() => { if (state.subs.adult || trial.trialActive()) setScreen("courses"); else { setPendingKs("he"); setScreen("paywall"); } }} aria-label="Open Advanced courses">
            <div className="toolicon" style={{ background: "var(--purple-soft)", fontSize: 24 }} aria-hidden="true">🎓</div>
            <div style={{ flex: 1 }}><div className="fred" style={{ fontWeight: 600, fontSize: 19 }}>{t("Advanced courses")}</div>
              <div style={{ fontWeight: 700, color: "var(--muted)", fontSize: 13 }}>{t("Gas · Electrical · Renewables · Business — exam‑prep")}</div></div>
            <GraduationCap size={22} color="#6b4fb0" />
          </button>
          <p className="note">
            {t("Start a 72-hour free trial, then Junior £3/mo (KS1 & KS2) or Adult £5/mo (KS3, Higher Education & courses).")}<br />
            <button className="linkbtn" onClick={openGate}>{t("Grown-ups: progress & reports")}</button> · <button className="linkbtn" onClick={openPrivacy}>{t("Privacy")}</button> · <button className="linkbtn" onClick={openTerms}>{t("Terms")}</button>
          </p>
        </main>
      )}

      {/* ---------- PLANS ---------- */}
      {screen === "plans" && (
        <main>
          <button className="iconbtn" onClick={goHome} aria-label="Back" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
          <div className="greet" style={{ marginTop: 4 }}><Crown size={42} color="#F2A33A" /><h2 className="fred" style={{ marginTop: 6 }}>{t("Choose a plan")}</h2><p>{t("Cancel any time")}</p></div>
          {trial.trialActive()
            ? <div className="trialbar">{tf("✨ Free trial active — {h}h left", { h: trial.hoursLeft() })}</div>
            : !trial.trialUsed()
              ? <button className="bigbtn mint" onClick={() => startTrialFor(null)}>{t("Start your 72-hour free trial")}</button>
              : <p className="note" style={{ textAlign: "center" }}>{t("Your free trial has ended — subscribe to keep learning.")}</p>}
          {Object.entries(PLANS).map(([key, p]) => (
            <div key={key} className="plan" style={{ background: p.color }}>
              <h3 className="fred">{p.name}</h3>
              <div style={{ marginTop: 6 }}><span className="price">{priceFor(key)}</span><span style={{ fontWeight: 800 }}> {t("/month")}</span></div>
              <div style={{ fontWeight: 800, opacity: .95, marginTop: 2 }}>{p.covers}</div>
              <ul>{p.features.map((f) => <li key={f}><Check size={18} /> {f}</li>)}</ul>
              {state.subs[key]
                ? <button className="planbtn active" disabled><Check size={16} style={{ verticalAlign: "-3px" }} /> Active</button>
                : <button className="planbtn" onClick={() => requestPurchase(key)}>{tf("Subscribe — {price}/mo", { price: priceFor(key) })}</button>}
            </div>
          ))}
          {buyError && <p className="err">{buyError}</p>}
          {billing.mode() !== "stripe" && <button className="bigbtn ghost" onClick={restorePurchases}>{t("Restore purchases")}</button>}
          <p className="note">{billingNote}</p>
        </main>
      )}

      {/* ---------- PAYWALL ---------- */}
      {screen === "paywall" && pendingKs && (() => {
        const plan = planForKs(pendingKs); const p = PLANS[plan];
        return (
          <main>
            <button className="iconbtn" onClick={goHome} aria-label="Back" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
            <div className="greet" style={{ marginTop: 4 }}>
              <Lock size={38} color={plan === "junior" ? "#F26B2A" : "#6b4fb0"} />
              <h2 className="fred" style={{ marginTop: 8 }}>{tf("{ks} is locked", { ks: KS_LABEL[pendingKs] })}</h2>
              <p>{tf("Unlock it with the {plan} plan", { plan: p.name })}</p>
            </div>
            {!trial.trialUsed() && <button className="bigbtn mint" onClick={() => startTrialFor(pendingKs)}>{t("Start 72-hour free trial")}</button>}
            {trial.trialUsed() && !trial.trialActive() && <p className="note" style={{ textAlign: "center" }}>{t("Your free trial has ended.")}</p>}
            <div className="plan" style={{ background: p.color }}>
              <h3 className="fred">{p.name}</h3>
              <div style={{ marginTop: 6 }}><span className="price">{priceFor(plan)}</span><span style={{ fontWeight: 800 }}> {t("/month")}</span></div>
              <div style={{ fontWeight: 800, opacity: .95, marginTop: 2 }}>{p.covers}</div>
              <ul>{p.features.map((f) => <li key={f}><Check size={18} /> {f}</li>)}</ul>
              <button className="planbtn" onClick={() => requestPurchase(plan)}>{tf("Subscribe & start — {price}/mo", { price: priceFor(plan) })}</button>
            </div>
            <p className="trustline">{t("Cancel anytime · No ads · Made for families")}</p>
            {buyError && <p className="err">{buyError}</p>}
            <p className="note">{billingNote}</p>
          </main>
        );
      })()}

      {/* ---------- MENU ---------- */}
      {screen === "menu" && (
        <main>
          <button className="iconbtn" onClick={goHome} aria-label="Back to home" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
          <div className="greet" style={{ marginTop: 4 }}><h2 className="fred">{KS_LABEL[ks]}</h2><p>{t("Pick a subject to play")}</p></div>
          <div className="motiv"><Sparkles size={18} className="spark" color="#F2A33A" />{motiv}</div>
          <div className="subjgrid">
            {SUBJECTS_BY_KS[ks].map((s) => {
              const { name, color, Icon } = SUBJ[s];
              return (
                <button key={s} className={`subj${subject === s ? " on" : ""}`} style={{ background: color }} onClick={() => setSubject(s)}>
                  <div style={{ display: "grid", placeItems: "center", marginBottom: 8 }}><Icon size={32} color="#fff" /></div>{name}
                </button>
              );
            })}
          </div>

          {subject && (<>
            <div className="sectitle">{SUBJ[subject].name} topics</div>
            <div className="toplist">
              {TOPICS[ks][subject].map(([name, em]) => (
                <button key={name} className="topic" onClick={() => startRound(ks, subject, name)}>
                  <span style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={{ fontSize: 22 }}>{em}</span>{name}</span>
                  <span className="dot" style={{ background: SUBJ[subject].color }} />
                </button>
              ))}
            </div>
            {subject === "maths" && (
              <button className="card toolcard" onClick={() => setScreen("calc")} aria-label="Open calculator">
                <div className="toolicon" style={{ background: "var(--purple-soft)" }}><CalcIcon size={26} color="#6b4fb0" /></div>
                <div><div className="fred" style={{ fontWeight: 600, fontSize: 19 }}>{t("Calculator")}</div>
                  <div style={{ fontWeight: 700, color: "var(--muted)", fontSize: 13 }}>{t("A quick maths helper")}</div></div>
              </button>
            )}
          </>)}

          <div className="sectitle">{t("Helpers")}</div>
          <button className="card toolcard" onClick={() => { setScreen("solve"); setSolveResult(null); setSv({ preview: null, data: null, mime: null }); setSolveText(""); setSolveError(null); }}>
            <div className="toolicon" style={{ background: "var(--sky-soft)" }}><ScanLine size={28} color="#2b80d6" /></div>
            <div><div className="fred" style={{ fontWeight: 600, fontSize: 19 }}>{t("Scan & solve a question")}</div>
              <div style={{ fontWeight: 700, color: "var(--muted)", fontSize: 13 }}>{t("Get the answer and working in real time")}</div></div>
          </button>
          <button className="card toolcard" onClick={() => { setScreen("mark"); setMarkResult(null); setHw({ preview: null, data: null, mime: null }); setMarkError(null); }}>
            <div className="toolicon" style={{ background: "var(--purple-soft)" }}><Camera size={28} color="#6b4fb0" /></div>
            <div><div className="fred" style={{ fontWeight: 600, fontSize: 19 }}>{t("Mark my homework")}</div>
              <div style={{ fontWeight: 700, color: "var(--muted)", fontSize: 13 }}>{t("Snap a photo and Mochi checks it")}</div></div>
          </button>
        </main>
      )}

      {/* ---------- PLAY ---------- */}
      {screen === "play" && (
        <main>
          <button className="iconbtn" onClick={() => setScreen("menu")} aria-label="Back" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
          {loadingQ && (
            <div style={{ textAlign: "center", marginTop: 40 }}>
              <div className="bob" style={{ display: "inline-block" }}><Mochi size={130} expression="think" /></div>
              <p className="fred" style={{ fontSize: 20, marginTop: 10 }}>{t("Mochi is thinking up your puzzles…")}</p>
              <Loader2 className="wiggle" size={26} color="#FF8A47" />
            </div>
          )}
          {!loadingQ && qi < questions.length && (() => {
            const q = questions[qi]; const answered = picked !== null; const ok = answered && picked === q.answerIndex;
            return (<>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                <span className="qtag">{SUBJ[subject].name} · {topic} · Q{qi + 1}/{questions.length}</span>
                {streak >= 2 && <span className="streak">🔥 {streak} streak</span>}
              </div>
              <div className="progress"><i style={{ width: `${(qi / questions.length) * 100}%` }} /></div>
              <div className="qcard card" style={{ marginTop: 16 }}>
                <Mochi size={92} expression={answered ? (ok ? "happy" : "oops") : "idle"} speaking={speaking} />
                <div className="qtext fred">{q.question}</div>
                <button className="spk" onClick={() => sayQuestion(q)} aria-label="Hear the question and options" style={{ margin: "4px auto 0" }}><Volume2 size={20} /></button>
              </div>
              <div className="choices">
                {q.choices.map((c, i) => {
                  let cls = "choice";
                  if (answered && i === q.answerIndex) cls += " correct";
                  else if (answered && i === picked) cls += " wrong";
                  return <button key={i} className={cls} disabled={answered} onClick={() => answer(i)}>{c}</button>;
                })}
              </div>
              {answered && <div className={`feedback ${ok ? "ok" : "no"} pop`} role="status" aria-live="assertive">{ok ? <Check size={20} /> : <X size={20} />}<div>{t(ok ? "Purr-fect!" : "Good try!")} {q.explanation}</div></div>}
              {answered && <button className="bigbtn" onClick={nextQ}>{qi + 1 < questions.length ? t("Next puzzle →") : t("See my stars ⭐")}</button>}
              {usedFallback && <p className="note">{t("Playing offline puzzles — connect to the internet for fresh ones.")}</p>}
            </>);
          })()}
          {!loadingQ && questions.length > 0 && qi >= questions.length && (() => {
            const total = questions.length; const earned = Math.max(1, Math.round((correctCount / total) * 5));
            return (
              <div className="summary card" style={{ marginTop: 18 }}>
                <div className="bob" style={{ display: "inline-block" }}><Mochi size={130} expression="happy" speaking={speaking} /></div>
                <h2 className="fred" style={{ margin: "8px 0 0" }}>{t("Round complete!")}</h2>
                <div className="starsRow">{[0, 1, 2, 3, 4].map((n) => <Star key={n} size={34} fill={n < earned ? "#FFC83D" : "#eee"} color={n < earned ? "#FFC83D" : "#eee"} className={n < earned ? "pop" : ""} />)}</div>
                <p style={{ fontWeight: 800, fontSize: 18, margin: 0 }}>{tf("You got {c} out of {n} right", { c: correctCount, n: total })}</p>
                {bestStreak >= 3 && <p style={{ fontWeight: 700, color: "var(--ginger-deep)", margin: "6px 0 0" }}>🔥 Best streak: {bestStreak}</p>}
                <button className="bigbtn mint" onClick={() => startRound(ks, subject, topic)}>{t("Play again 🔁")}</button>
                <button className="bigbtn ghost" onClick={() => shareScore(correctCount, total)}>📣 {t("Share my score")}</button>
                <button className="bigbtn ghost" onClick={() => setScreen("menu")}>{t("Pick another topic")}</button>
                {shareMsg && <p className="note" style={{ textAlign: "center" }}>{shareMsg}</p>}
              </div>
            );
          })()}
        </main>
      )}

      {/* ---------- SCAN & SOLVE ---------- */}
      {screen === "solve" && (
        <main>
          <button className="iconbtn" onClick={() => setScreen("menu")} aria-label="Back" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
          <div className="greet" style={{ marginTop: 4 }}><Mochi size={96} expression="think" speaking={speaking} /><h2 className="fred" style={{ marginTop: 6 }}>{t("Scan & solve")}</h2><p>{KS_LABEL[ks]} · answer in real time</p></div>
          {!photoConsent && <ConsentCard onAccept={acceptPhotoConsent} />}
          {photoConsent && (<>
          <input ref={svRef} type="file" accept="image/*" capture="environment" onChange={onSvFile} style={{ display: "none" }} />
          {!sv.preview && (
            <div className="dropzone" onClick={() => svRef.current?.click()}>
              <ScanLine size={40} color="#2b80d6" />
              <p className="fred" style={{ fontSize: 19, margin: "10px 0 2px" }}>{t("Scan a question")}</p>
              <p style={{ color: "var(--muted)", fontWeight: 700, margin: 0, fontSize: 13 }}>{t("Point your camera at one question")}</p>
            </div>
          )}
          {sv.preview && <img src={sv.preview} alt="Question to solve" className="photo" />}
          {sv.preview && <button className="bigbtn ghost" onClick={() => svRef.current?.click()} style={{ marginTop: 12 }}>{t("Scan a different question")}</button>}
          <textarea className="txtin" placeholder="…or type the question here" value={solveText} onChange={(e) => setSolveText(e.target.value)} />
          {!solveResult && <button className="bigbtn sky" disabled={solving || (!sv.data && !solveText.trim())} onClick={doSolve}>
            {solving ? <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><Loader2 className="wiggle" size={20} /> {t("Solving…")}</span>
                     : <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><Sparkles size={20} /> {t("Get the answer")}</span>}
          </button>}
          {solveError && <div className="feedback no" style={{ marginTop: 16 }}><X size={20} /><div>{solveError}</div></div>}
          {solveResult && (
            <div className="card" style={{ marginTop: 16 }}>
              {solveResult.subject && <span className="pill">{solveResult.subject}</span>}
              {solveResult.questionRead && <div className="qquote">“{solveResult.questionRead}”</div>}
              {solveResult.answer && <div className="ans">{solveResult.answer}</div>}
              {Array.isArray(solveResult.steps) && solveResult.steps.length > 0 && (
                <><div className="sectitle" style={{ marginTop: 18 }}>How to get there</div><ol className="steps">{solveResult.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></>
              )}
              {solveResult.concept && <div className="feedback ok" style={{ marginTop: 14 }}><Lightbulb size={20} /><div>{solveResult.concept}</div></div>}
              <button className="bigbtn ghost" onClick={() => { setSolveResult(null); setSv({ preview: null, data: null, mime: null }); setSolveText(""); }} style={{ marginTop: 14 }}>
                <RefreshCw size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />{t("Solve another")}
              </button>
            </div>
          )}
          </>)}
          <p className="note">Try the question yourself first — then use Mochi to check the method. A grown-up should confirm important answers.</p>
        </main>
      )}

      {/* ---------- MARK HOMEWORK ---------- */}
      {screen === "mark" && (
        <main>
          <button className="iconbtn" onClick={() => setScreen("menu")} aria-label="Back" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
          <div className="greet" style={{ marginTop: 4 }}><Mochi size={96} expression="read" speaking={speaking} /><h2 className="fred" style={{ marginTop: 6 }}>{t("Mark my homework")}</h2><p>{KS_LABEL[ks]}{subject ? ` · ${SUBJ[subject].name}` : ""}</p></div>
          {!photoConsent && <ConsentCard onAccept={acceptPhotoConsent} />}
          {photoConsent && (<>
          <input ref={hwRef} type="file" accept="image/*" capture="environment" onChange={onHwFile} style={{ display: "none" }} />
          {!hw.preview && (
            <div className="dropzone" onClick={() => hwRef.current?.click()}>
              <Camera size={40} color="#F26B2A" />
              <p className="fred" style={{ fontSize: 19, margin: "10px 0 2px" }}>Take or upload a photo</p>
              <p style={{ color: "var(--muted)", fontWeight: 700, margin: 0, fontSize: 13 }}>Lay the page flat in good light</p>
            </div>
          )}
          {hw.preview && (<>
            <img src={hw.preview} alt="Homework to mark" className="photo" />
            <button className="bigbtn ghost" onClick={() => hwRef.current?.click()} style={{ marginTop: 12 }}>Choose a different photo</button>
            {!markResult && <button className="bigbtn purple" disabled={marking} onClick={doMark}>
              {marking ? <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><Loader2 className="wiggle" size={20} /> Mochi is marking…</span>
                       : <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><Sparkles size={20} /> Mark it!</span>}
            </button>}
          </>)}
          {markError && <div className="feedback no" style={{ marginTop: 16 }}><X size={20} /><div>{markError}</div></div>}
          {markResult && (
            <div className="card" style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span className="pill">{markResult.subjectDetected || "Homework"}</span>
                {markResult.score && <span className="fred" style={{ fontWeight: 700, fontSize: 22 }}>{markResult.score}</span>}
              </div>
              {markResult.summary && <p style={{ fontWeight: 700, marginTop: 12 }}>{markResult.summary}</p>}
              {Array.isArray(markResult.items) && markResult.items.length > 0 && (
                <div style={{ marginTop: 8 }}>{markResult.items.map((it, i) => (
                  <div className="markitem" key={i}>
                    <div className="markmark" style={{ background: it.correct ? "var(--good)" : "var(--bad)" }}>{it.correct ? <Check size={18} /> : <X size={18} />}</div>
                    <div><div style={{ fontWeight: 800 }}>{it.label}</div>{it.comment && <div style={{ color: "var(--muted)", fontWeight: 700, fontSize: 14 }}>{it.comment}</div>}</div>
                  </div>
                ))}</div>
              )}
              {markResult.praise && <div className="feedback ok" style={{ marginTop: 14 }}><Sparkles size={20} /><div>{markResult.praise}</div></div>}
              {markResult.nextStep && <p style={{ fontWeight: 700, marginTop: 12 }}>👉 <b>Try next:</b> {markResult.nextStep}</p>}
              <button className="bigbtn ghost" onClick={() => { setMarkResult(null); setHw({ preview: null, data: null, mime: null }); }} style={{ marginTop: 14 }}>
                <RefreshCw size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />{t("Mark another")}
              </button>
            </div>
          )}
          </>)}
          <p className="note">Mochi gives friendly guidance. A grown-up should always check important marks.</p>
        </main>
      )}

      {/* ---------- GROWN-UPS GATE ---------- */}
      {screen === "gate" && (
        <main>
          <button className="iconbtn" onClick={goHome} aria-label="Back" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
          <div className="gatebox">
            <Mochi size={110} expression="think" />
            <h2 className="fred" style={{ marginTop: 6 }}>For grown-ups</h2>
            <p style={{ color: "var(--muted)", fontWeight: 700 }}>
              {gate.intent === "purchase" ? "To confirm a purchase, please answer this:" : "To see progress, answer this:"}
            </p>
            <p className="fred" style={{ fontSize: 30, margin: "8px 0 0" }}>{gate.a} × {gate.b} = ?</p>
            <div><input className="gatein" inputMode="numeric" value={gate.val} autoFocus
              onChange={(e) => setGate((g) => ({ ...g, val: e.target.value.replace(/[^0-9]/g, ""), err: false }))}
              onKeyDown={(e) => e.key === "Enter" && checkGate()} /></div>
            {gate.err && <p style={{ color: "var(--bad)", fontWeight: 800, marginTop: 8 }}>Not quite — try again.</p>}
            {buyError && <p className="err">{buyError}</p>}
            <button className="bigbtn purple" disabled={buying} onClick={checkGate}>
              {buying ? <Loader2 className="wiggle" size={18} /> : gate.intent === "purchase" ? "Confirm" : "Enter dashboard"}
            </button>
          </div>
        </main>
      )}

      {/* ---------- DASHBOARD ---------- */}
      {screen === "dashboard" && (
        <main>
          <button className="iconbtn" onClick={goHome} aria-label="Back" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
          <div className="greet" style={{ marginTop: 4 }}><BarChart3 size={40} color="#6b4fb0" /><h2 className="fred" style={{ marginTop: 6 }}>Progress</h2><p>Parent &amp; teacher view</p></div>

          <div className="statgrid">
            <div className="stat"><b>{state.stars}</b><span>Stars earned</span></div>
            <div className="stat"><b>{ov.answered}</b><span>Questions answered</span></div>
            <div className="stat"><b>{ov.accuracy}%</b><span>Overall accuracy</span></div>
            <div className="stat"><b>{ov.rounds}</b><span>Rounds played</span></div>
          </div>

          {ov.answered === 0 && <p className="empty">No activity yet. Play a round to see progress here.</p>}

          {/* per-stage / per-subject accuracy */}
          {KS_META.map((m) => {
            const lines = SUBJECTS_BY_KS[m.id].map((s) => [s, state.stats[`${m.id}:${s}`]]).filter(([, v]) => v && v.answered);
            if (lines.length === 0) return null;
            return (
              <div className="card stagecard" key={m.id}>
                <div className="fred" style={{ fontWeight: 600, fontSize: 18 }}>{m.emoji} {KS_LABEL[m.id]}</div>
                {lines.map(([s, v]) => {
                  const acc = Math.round((v.correct / v.answered) * 100);
                  return (
                    <div className="subjline" key={s}>
                      <div className="subjhead"><span>{SUBJ[s].name}</span><span>{acc}% · {v.correct}/{v.answered}</span></div>
                      <div className="bar"><i style={{ width: `${acc}%`, background: accColor(acc) }} /></div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {weak.length > 0 && (
            <>
              <div className="sectitle">Needs practice</div>
              <div className="card">
                {weak.map((w, i) => (
                  <div className="tinytopic" key={i} style={{ fontSize: 14, color: "var(--ink)" }}>
                    <span>{KS_LABEL[w.ks]} · {SUBJ[w.subject].name} · {w.topic}</span>
                    <span style={{ color: accColor(w.accuracy), fontWeight: 800 }}>{w.accuracy}%</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {state.history.length > 0 && (
            <>
              <div className="sectitle">Recent activity</div>
              <div className="card">
                {state.history.slice(0, 8).map((h, i) => (
                  <div className="actrow" key={i}>
                    <span>{fmtDate(h.ts)} · {SUBJ[h.subject].name} · {h.topic}</span>
                    <span className="actscore" style={{ color: accColor(Math.round((h.correct / h.total) * 100)) }}>{h.correct}/{h.total}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {bound ? (
            <div className="chip" style={{ margin: "0 0 12px" }}><RefreshCw size={14} /> Syncing this device to a child profile
              <button className="linkbtn" style={{ marginLeft: 8 }} onClick={() => setBound(null)}>Stop</button></div>
          ) : null}
          <button className="bigbtn purple" onClick={() => setScreen("grownups")}>Parent &amp; Teacher portal →</button>
          <button className="bigbtn ghost" onClick={resetProgress} style={{ marginTop: 18 }}>Reset progress</button>
          <p className="note">No ads, ever. Progress saves on this device and syncs across devices when you use an account. <button className="linkbtn" onClick={openPrivacy}>Privacy policy</button></p>
        </main>
      )}

      {/* ---------- GROWN-UPS PORTAL ---------- */}
      {screen === "grownups" && (
        <ErrorBoundary>
          <Suspense fallback={<ScreenLoading />}>
            <GrownUps onClose={() => setScreen("dashboard")} onBind={(childId, token) => setBound({ childId, token })} onPrivacy={openPrivacy} />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* ---------- LEADERBOARD ---------- */}
      {screen === "board" && (
        <main>
          <button className="iconbtn" onClick={goHome} aria-label="Back" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
          <div className="greet" style={{ marginTop: 4 }}><h2 className="fred">🏆 {t("Leaderboard")}</h2><p>{t("This week")}{boardScope ? ` · ${boardScope === "class" ? t("Class") : t("Family")}` : ""}</p></div>
          {!bound?.token ? (
            <div className="card" style={{ textAlign: "center" }}>
              <Mochi size={84} expression="idle" />
              <p style={{ fontWeight: 700 }}>{t("Ask a grown-up to connect this device to your family or class to join the leaderboard.")}</p>
              <button className="bigbtn purple" onClick={openGate}>{t("Open the grown-ups area")}</button>
            </div>
          ) : boardBusy ? (
            <div style={{ textAlign: "center", marginTop: 30 }}><Loader2 className="wiggle" size={26} color="#FF8A47" /></div>
          ) : (board && board.length) ? (
            <div className="lboard">
              {board.map((r, i) => (
                <div key={i} className={`lrow ${r.you ? "you" : ""}`}>
                  <span className="lrank">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
                  <span className="lname">{r.name}{r.you ? ` (${t("You")})` : ""}</span>
                  <span className="lstars"><Star size={15} fill="#FFC83D" color="#FFC83D" /> {r.stars}</span>
                </div>
              ))}
            </div>
          ) : <p className="note" style={{ textAlign: "center" }}>{t("No scores yet this week — be the first!")}</p>}
          <button className="bigbtn ghost" style={{ marginTop: 14 }} onClick={inviteFriend}>{t("Invite a friend")}</button>
          {shareMsg && <p className="note" style={{ textAlign: "center" }}>{shareMsg}</p>}
        </main>
      )}

      {/* ---------- ASK MOCHI (tutor chat) ---------- */}
      {screen === "ask" && (
        <main>
          <button className="iconbtn" onClick={goHome} aria-label="Back" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
          <div className="greet" style={{ marginTop: 4 }}><Mochi size={84} expression={chatBusy ? "think" : "happy"} speaking={speaking} /><h2 className="fred" style={{ marginTop: 6 }}>💬 {t("Ask Mochi")}</h2></div>
          <div className="chatwrap">
            {chatMsgs.map((m, i) => <div key={i} className={`bubble ${m.role}`}>{m.text}</div>)}
            {chatBusy && <div className="bubble mochi typing">{t("Mochi is thinking…")}</div>}
            <div ref={chatEndRef} />
          </div>
          <div className="chips">
            {[t("Explain this"), t("Give me a hint"), t("Another example")].map((c) => <button key={c} className="qchip" onClick={() => sendChat(c)} disabled={chatBusy}>{c}</button>)}
          </div>
          <div className="chatbar">
            <input className="chatinput" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }} placeholder={t("Type your question…")} aria-label={t("Type your question…")} />
            <button className="sendbtn" onClick={() => sendChat()} disabled={chatBusy || !chatInput.trim()} aria-label={t("Send")}>{chatBusy ? <Loader2 className="wiggle" size={18} /> : <ArrowRight size={20} />}</button>
          </div>
        </main>
      )}

      {/* ---------- BADGES ---------- */}
      {screen === "badges" && (
        <main>
          <button className="iconbtn" onClick={goHome} aria-label="Back" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
          <div className="greet" style={{ marginTop: 4 }}><Mochi size={92} expression="happy" speaking={speaking} /><h2 className="fred" style={{ marginTop: 6 }}>🏅 {t("Your badges")}</h2><p>{tf("{e} of {t} earned", { e: earnedCount(state), t: BADGES.length })}</p></div>
          <div className="badgegrid">
            {badgeStatus(state).map((b) => (
              <div key={b.id} className={`badge ${b.earned ? "earned" : ""}`}>
                <div className="bi">{b.icon}</div>
                <div className="bn">{b.name}</div>
                <div className="bd">{b.desc}</div>
              </div>
            ))}
          </div>
          <button className="bigbtn ghost" style={{ marginTop: 16 }} onClick={inviteFriend}>{t("Invite a friend")}</button>
          {shareMsg && <p className="note" style={{ textAlign: "center" }}>{shareMsg}</p>}
        </main>
      )}

      {/* ---------- MOCHI SHOP ---------- */}
      {screen === "shop" && (
        <main>
          <button className="iconbtn" onClick={goHome} aria-label="Back" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
          <div className="greet" style={{ marginTop: 4 }}>
            <Mochi size={120} expression="happy" />
            <h2 className="fred" style={{ marginTop: 6 }}>🎩 {t("Mochi's shop")}</h2>
            <p>{t("Dress up Mochi with stars you've earned")}</p>
            <div className="starcount" style={{ margin: "6px auto 0" }}><Star size={18} fill="#FFC83D" color="#FFC83D" />{state.stars}</div>
          </div>

          <h3 className="fred shoph">{t("Colours")}</h3>
          <div className="shopgrid">
            {SHOP.colors.map((it) => {
              const owned = owns(it.id); const on = (state.mochi?.color || "ginger") === it.id;
              return (
                <div key={it.id} className={`shopitem ${on ? "on" : ""}`}>
                  <div className="swatch" style={{ background: COLOR_THEMES[it.id].base }} />
                  <div className="sn">{it.name}</div>
                  {!owned ? <button className="shopbtn" disabled={state.stars < it.cost} onClick={() => buyItem(it.id)}>{tf("Buy ⭐{cost}", { cost: it.cost })}</button>
                    : <button className="shopbtn alt" onClick={() => equipItem("color", it.id)} disabled={on}>{on ? t("Wearing ✓") : t("Wear")}</button>}
                </div>
              );
            })}
          </div>

          <h3 className="fred shoph">{t("Hats")}</h3>
          <div className="shopgrid">
            {SHOP.hats.map((it) => {
              const owned = owns(it.id); const on = (state.mochi?.hat || "none") === it.id;
              return (
                <div key={it.id} className={`shopitem ${on ? "on" : ""}`}>
                  <div className="hatprev"><Mochi size={64} expression="idle" hat={it.id} glasses={false} color={state.mochi?.color} /></div>
                  <div className="sn">{it.name}</div>
                  {!owned ? <button className="shopbtn" disabled={state.stars < it.cost} onClick={() => buyItem(it.id)}>{tf("Buy ⭐{cost}", { cost: it.cost })}</button>
                    : <button className="shopbtn alt" onClick={() => equipItem("hat", it.id)} disabled={on}>{on ? t("Wearing ✓") : t("Wear")}</button>}
                </div>
              );
            })}
          </div>

          <h3 className="fred shoph">{t("Extras")}</h3>
          <div className="shopgrid">
            {SHOP.extras.map((it) => {
              if (it.id === "streakfreeze") {
                return (
                  <div key={it.id} className="shopitem">
                    <div className="hatprev" style={{ fontSize: 34 }}>🧊</div>
                    <div className="sn">{it.name}</div>
                    <div className="muted" style={{ fontSize: 10.5, lineHeight: 1.25 }}>{t("Saves your streak if you miss a day")}</div>
                    <div className="muted" style={{ fontSize: 11, fontWeight: 800 }}>{tf("You have {n}", { n: state.freezes || 0 })}</div>
                    <button className="shopbtn" disabled={state.stars < it.cost} onClick={() => buyFreeze(it.cost)}>{tf("Buy ⭐{cost}", { cost: it.cost })}</button>
                  </div>
                );
              }
              const owned = owns(it.id); const on = !!state.mochi?.glasses;
              return (
                <div key={it.id} className="shopitem">
                  <div className="hatprev"><Mochi size={64} expression="idle" glasses hat="none" color={state.mochi?.color} /></div>
                  <div className="sn">{it.name}</div>
                  {!owned ? <button className="shopbtn" disabled={state.stars < it.cost} onClick={() => buyItem(it.id)}>{tf("Buy ⭐{cost}", { cost: it.cost })}</button>
                    : <button className="shopbtn alt" onClick={toggleGlasses}>{on ? t("Glasses off") : t("Glasses on")}</button>}
                </div>
              );
            })}
          </div>
        </main>
      )}

      {/* ---------- LANGUAGES ---------- */}
      {screen === "languages" && <ErrorBoundary><Suspense fallback={<ScreenLoading />}><Languages onClose={goHome} /></Suspense></ErrorBoundary>}

      {/* ---------- ADVANCED COURSES ---------- */}
      {screen === "courses" && <ErrorBoundary><Suspense fallback={<ScreenLoading />}><Courses onClose={goHome} onResult={(r) => setState((s) => recordCourseResult(s, r))} /></Suspense></ErrorBoundary>}

      {/* ---------- CALCULATOR ---------- */}
      {screen === "calc" && <ErrorBoundary><Suspense fallback={<ScreenLoading />}><Calc onClose={goHome} /></Suspense></ErrorBoundary>}

      {/* ---------- SETTINGS ---------- */}
      {screen === "settings" && (
        <main>
          <button className="iconbtn" onClick={goHome} aria-label="Back" style={{ marginTop: 8 }}><ArrowLeft size={20} /></button>
          <div className="greet" style={{ marginTop: 4 }}><Settings size={36} color="#6b4fb0" /><h2 className="fred" style={{ marginTop: 6 }}>{t("Settings")}</h2><p>{t("Voice & accessibility")}</p></div>
          <div className="card">
            <div className="setrow">
              <div><div style={{ fontWeight: 800 }}>{t("Mochi's voice")}</div><div className="muted">{t("Mochi speaks and cheers you on.")}</div></div>
              <button className={`switch ${voiceOn ? "on" : ""}`} role="switch" aria-checked={voiceOn} aria-label="Mochi's voice" onClick={toggleVoice}><span /></button>
            </div>
            <div className="setrow">
              <div><div style={{ fontWeight: 800 }}>{t("Read questions aloud")}</div><div className="muted">{t("Reads each question and its options — great for early or blind readers. Needs Mochi's voice on.")}</div></div>
              <button className={`switch ${narrateOn ? "on" : ""}`} role="switch" aria-checked={narrateOn} aria-label="Read questions aloud" onClick={toggleNarrate}><span /></button>
            </div>
            <div className="setrow">
              <div><div style={{ fontWeight: 800 }}>{t("Mochi guides me")}</div><div className="muted">{t("Mochi welcomes you and gives spoken tips around the app. On by default.")}</div></div>
              <button className={`switch ${guideOn ? "on" : ""}`} role="switch" aria-checked={guideOn} aria-label="Mochi guides me" onClick={toggleGuide}><span /></button>
            </div>
            <div className="setrow">
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800 }}><Bell size={15} style={{ verticalAlign: "-2px" }} /> {t("Daily reminder")}</div>
                <div className="muted">{t("A gentle nudge to keep your streak going")}</div>
                {reminder.on && (
                  <label style={{ display: "block", marginTop: 6, fontWeight: 700, fontSize: 13 }}>{t("Remind me at")}{" "}
                    <select value={`${reminder.hour}:${reminder.minute}`} onChange={changeReminderTime} style={{ fontFamily: "inherit", fontWeight: 700, padding: "4px 8px", borderRadius: 8, border: "2px solid #eadfce" }}>
                      <option value="15:0">3:00 pm</option><option value="15:30">3:30 pm</option><option value="16:0">4:00 pm</option>
                      <option value="17:0">5:00 pm</option><option value="18:0">6:00 pm</option><option value="19:0">7:00 pm</option><option value="19:30">7:30 pm</option>
                    </select>
                  </label>
                )}
                {reminderMsg && <div className="muted" style={{ marginTop: 6, color: "var(--ginger-deep)" }}>{reminderMsg}</div>}
              </div>
              <button className={`switch ${reminder.on ? "on" : ""}`} role="switch" aria-checked={reminder.on} aria-label="Daily reminder" onClick={toggleReminder}><span /></button>
            </div>
            <div className="setrow">
              <div><div style={{ fontWeight: 800 }}><Globe size={15} style={{ verticalAlign: "-2px", marginRight: 4 }} />{t("Mochi's language")}</div><div className="muted">{t("The language Mochi speaks. Starts in English; you can also say “speak in French”.")}</div></div>
              <select className="langsel" value={voiceLang} onChange={(e) => setVoiceLang(e.target.value)} aria-label="Mochi's language">
                {LANGUAGES.map((l) => <option key={l.id} value={l.code}>{l.emoji} {l.name}</option>)}
              </select>
            </div>
          </div>
          {!speech.supported() && <p className="note">Your device doesn't expose a speech voice here — try the latest Chrome, or the Android app with a text-to-speech engine installed.</p>}
          {speech.mode() === "cloud" && <p className="note">✨ Premium voice is enabled.</p>}
          <button className="bigbtn ghost" onClick={() => localizedSpeak("Hi! This is how I sound. You can do it!", { respectSetting: false })}><Volume2 size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />{t("Hear a sample")}</button>
          <button className="bigbtn ghost" onClick={() => review.requestReview()}><Star size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />{t("Rate Education Academy")}</button>
          <button className="bigbtn ghost" onClick={manageSub}>{t("Manage subscription")}</button>
          {manageMsg && <p className="note" style={{ textAlign: "center" }}>{manageMsg}</p>}
          {!String(voiceLang).startsWith("en") && <p className="note"><button className="linkbtn" onClick={resetTranslations}>{t("Reset translations")}</button></p>}
          <p className="note"><button className="linkbtn" onClick={openPrivacy}>{t("Privacy policy")}</button></p>
        </main>
      )}
    </div>
  );
}
