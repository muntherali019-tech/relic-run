import { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import { Star, Check, Loader2, Crown, BarChart3, Volume2, VolumeX, Settings, Mic } from "lucide-react";
import Mochi from "./components/Mochi.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import Badges from "./components/screens/Badges.jsx";
import AskMochi from "./components/screens/AskMochi.jsx";
import Shop from "./components/screens/Shop.jsx";
import Solve from "./components/screens/Solve.jsx";
import Mark from "./components/screens/Mark.jsx";
import Plans from "./components/screens/Plans.jsx";
import Paywall from "./components/screens/Paywall.jsx";
import SubjectMenu from "./components/screens/SubjectMenu.jsx";
import Dashboard from "./components/screens/Dashboard.jsx";
import Play from "./components/screens/Play.jsx";
import Home from "./components/screens/Home.jsx";
import Gate from "./components/screens/Gate.jsx";
import SettingsScreen from "./components/screens/SettingsScreen.jsx";
import Leaderboard from "./components/screens/Leaderboard.jsx";
import { TOPICS, PLANS, planForKs } from "./data/curriculum.js";
import { LANGUAGES } from "./data/languages.js";
import { BANK } from "./data/bank.js";
import { generateQuestions, markHomework, solveQuestion, voiceCommand, translateText, askTutor } from "./lib/api.js";
import { loadState, saveState, defaultState, recordRound, overview, weakestTopics, recordCourseResult, addStars, touchStreak, dailyDone, markDailyDone } from "./lib/progress.js";
import { burstConfetti } from "./lib/celebrate.js";
import { share as shareThing, siteUrl } from "./lib/share.js";
import { isWeb } from "./lib/platform.js";
import { SHOP, FREE, setEquipped, itemCost } from "./lib/mochiShop.js";
import * as reminders from "./lib/reminders.js";
const GrownUps = lazy(() => import("./components/GrownUps.jsx"));
import { pickMessage } from "./lib/motivation.js";
import * as cloud from "./lib/cloud.js";
import * as billing from "./lib/billing.js";
import * as speech from "./lib/speech.js";
import { useT, setUiLang, tf } from "./lib/i18n.js";
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

// Set this to your hosted policy before release (or via VITE_PRIVACY_URL at build time).
const PRIVACY_URL = import.meta.env.VITE_PRIVACY_URL || "/privacy";
const TERMS_URL = import.meta.env.VITE_TERMS_URL || "/terms";

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
  // Send focus (and scroll) to the new screen's main region so keyboard and
  // screen-reader users land at the top of what just appeared.
  useEffect(() => {
    const el = document.querySelector("main");
    if (el) { el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true }); }
    window.scrollTo(0, 0);
  }, [screen]);
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
  // First-launch language chooser so new users worldwide start in their own language.
  // (Declared before the effects below that list `onboard` in their deps.)
  const [onboard, setOnboard] = useState(() => { try { return localStorage.getItem("whisker.onboarded") !== "1"; } catch { return false; } });
  function pickOnboardLang(code) { try { localStorage.setItem("whisker.onboarded", "1"); } catch {} if (code) setVoiceLang(code); setOnboard(false); }
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
  const detectedLang = LANGUAGES.find((l) => String((typeof navigator !== "undefined" && navigator.language) || "").toLowerCase().startsWith(l.id));
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
        <Home state={state} motiv={motiv} speaking={speaking} smartMsg={smartMsg} startDaily={startDaily}
          openAsk={openAsk} startSmart={startSmart} chooseKs={chooseKs} priceFor={priceFor}
          openBadges={() => setScreen("badges")} openShop={() => setScreen("shop")} openBoard={() => setScreen("board")}
          openLanguages={() => setScreen("languages")}
          openCourses={() => { if (state.subs.adult || trial.trialActive()) setScreen("courses"); else { setPendingKs("he"); setScreen("paywall"); } }}
          openGate={openGate} openPrivacy={openPrivacy} openTerms={openTerms} />
      )}

      {/* ---------- PLANS ---------- */}
      {screen === "plans" && (
        <Plans state={state} startTrialFor={startTrialFor} priceFor={priceFor} requestPurchase={requestPurchase}
          restorePurchases={restorePurchases} buyError={buyError} billingNote={billingNote} goHome={goHome} />
      )}

      {/* ---------- PAYWALL ---------- */}
      {screen === "paywall" && pendingKs && (
        <Paywall pendingKs={pendingKs} startTrialFor={startTrialFor} priceFor={priceFor} requestPurchase={requestPurchase}
          buyError={buyError} billingNote={billingNote} goHome={goHome} />
      )}

      {/* ---------- MENU ---------- */}
      {screen === "menu" && (
        <SubjectMenu ks={ks} subject={subject} setSubject={setSubject} motiv={motiv} startRound={startRound}
          openCalc={() => setScreen("calc")}
          openSolve={() => { setScreen("solve"); setSolveResult(null); setSv({ preview: null, data: null, mime: null }); setSolveText(""); setSolveError(null); }}
          openMark={() => { setScreen("mark"); setMarkResult(null); setHw({ preview: null, data: null, mime: null }); setMarkError(null); }}
          goHome={goHome} />
      )}

      {/* ---------- PLAY ---------- */}
      {screen === "play" && (
        <Play ks={ks} subject={subject} topic={topic} questions={questions} qi={qi} picked={picked}
          streak={streak} bestStreak={bestStreak} correctCount={correctCount} loadingQ={loadingQ}
          usedFallback={usedFallback} speaking={speaking} shareMsg={shareMsg}
          answer={answer} nextQ={nextQ} sayQuestion={sayQuestion} startRound={startRound} shareScore={shareScore}
          onBack={() => setScreen("menu")} />
      )}

      {/* ---------- SCAN & SOLVE ---------- */}
      {screen === "solve" && (
        <Solve ks={ks} speaking={speaking} photoConsent={photoConsent} acceptPhotoConsent={acceptPhotoConsent}
          svRef={svRef} sv={sv} setSv={setSv} onSvFile={onSvFile} solveText={solveText} setSolveText={setSolveText}
          solving={solving} doSolve={doSolve} solveError={solveError} solveResult={solveResult} setSolveResult={setSolveResult}
          onBack={() => setScreen("menu")} />
      )}

      {/* ---------- MARK HOMEWORK ---------- */}
      {screen === "mark" && (
        <Mark ks={ks} subject={subject} speaking={speaking} photoConsent={photoConsent} acceptPhotoConsent={acceptPhotoConsent}
          hwRef={hwRef} hw={hw} setHw={setHw} onHwFile={onHwFile} marking={marking} doMark={doMark}
          markError={markError} markResult={markResult} setMarkResult={setMarkResult}
          onBack={() => setScreen("menu")} />
      )}

      {/* ---------- GROWN-UPS GATE ---------- */}
      {screen === "gate" && (
        <Gate gate={gate} setGate={setGate} checkGate={checkGate} buying={buying} buyError={buyError} goHome={goHome} />
      )}

      {/* ---------- DASHBOARD ---------- */}
      {screen === "dashboard" && (
        <Dashboard state={state} ov={ov} weak={weak} bound={bound} setBound={setBound}
          openPortal={() => setScreen("grownups")} resetProgress={resetProgress} openPrivacy={openPrivacy} goHome={goHome} />
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
        <Leaderboard bound={bound} board={board} boardBusy={boardBusy} boardScope={boardScope} openGate={openGate} goHome={goHome} onInvite={inviteFriend} shareMsg={shareMsg} />
      )}

      {/* ---------- ASK MOCHI (tutor chat) ---------- */}
      {screen === "ask" && (
        <AskMochi chatMsgs={chatMsgs} chatBusy={chatBusy} chatInput={chatInput} setChatInput={setChatInput} chatEndRef={chatEndRef} sendChat={sendChat} speaking={speaking} goHome={goHome} />
      )}

      {/* ---------- BADGES ---------- */}
      {screen === "badges" && (
        <Badges state={state} speaking={speaking} goHome={goHome} onInvite={inviteFriend} shareMsg={shareMsg} />
      )}

      {/* ---------- MOCHI SHOP ---------- */}
      {screen === "shop" && (
        <Shop state={state} owns={owns} buyItem={buyItem} equipItem={equipItem} buyFreeze={buyFreeze} toggleGlasses={toggleGlasses} goHome={goHome} />
      )}

      {/* ---------- LANGUAGES ---------- */}
      {screen === "languages" && <ErrorBoundary><Suspense fallback={<ScreenLoading />}><Languages onClose={goHome} /></Suspense></ErrorBoundary>}

      {/* ---------- ADVANCED COURSES ---------- */}
      {screen === "courses" && <ErrorBoundary><Suspense fallback={<ScreenLoading />}><Courses onClose={goHome} onResult={(r) => setState((s) => recordCourseResult(s, r))} /></Suspense></ErrorBoundary>}

      {/* ---------- CALCULATOR ---------- */}
      {screen === "calc" && <ErrorBoundary><Suspense fallback={<ScreenLoading />}><Calc onClose={goHome} /></Suspense></ErrorBoundary>}

      {/* ---------- SETTINGS ---------- */}
      {screen === "settings" && (
        <SettingsScreen
          voiceOn={voiceOn} toggleVoice={toggleVoice} narrateOn={narrateOn} toggleNarrate={toggleNarrate}
          guideOn={guideOn} toggleGuide={toggleGuide} reminder={reminder} toggleReminder={toggleReminder}
          changeReminderTime={changeReminderTime} reminderMsg={reminderMsg} voiceLang={voiceLang} setVoiceLang={setVoiceLang}
          localizedSpeak={localizedSpeak} manageSub={manageSub} manageMsg={manageMsg} openPrivacy={openPrivacy} goHome={goHome}
        />
      )}
    </div>
  );
}
