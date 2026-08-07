// Lightweight UI localization. Registered English strings are translated in a
// single batched AI call the first time a language is chosen, then cached on the
// device (localStorage) so they show instantly and work offline afterwards.
// English is the source — t() returns the English string until a translation
// arrives. Brand names/prices/emoji are preserved by the translator.
import { useState, useEffect } from "react";
import { LANGUAGES } from "../data/languages.js";
import { translateBatch } from "./api.js";

// Every English string wrapped with t() across the app.
export const STRINGS = [
  "Learn & play with Mochi",
  "Hello! I'm Mochi 🐾", "Who's learning today?", "Unlocked", "Free trial",
  "Languages", "Speak with your AI teacher — 8 languages",
  "Advanced courses", "Gas · Electrical · Renewables · Business — exam‑prep",
  "Start a 72-hour free trial, then Junior £3/mo (KS1 & KS2) or Adult £5/mo (KS3, Higher Education & courses).",
  "Grown-ups: progress & reports", "Privacy",
  "Pick a subject to play", "Helpers", "Scan & solve a question", "Get the answer and working in real time",
  "Mark my homework", "Calculator", "A quick maths helper",
  "Choose a plan", "Cancel any time", "Start your 72-hour free trial", "Your free trial has ended — subscribe to keep learning.",
  "Start 72-hour free trial", "Your free trial has ended.",
  "Settings", "Voice & accessibility", "Mochi's voice", "Mochi speaks and cheers you on.",
  "Read questions aloud", "Reads each question and its options — great for early or blind readers. Needs Mochi's voice on.",
  "Mochi guides me", "Mochi welcomes you and gives spoken tips around the app. On by default.",
  "Mochi's language", "The language Mochi speaks. Starts in English; you can also say “speak in French”.",
  "Hear a sample", "Rate Education Academy", "Privacy policy",
  "Calculator 🧮", "Maths helper", "Tip: tap = and Mochi reads the answer aloud.",
  "Advanced courses 🎓", "Exam-prep & revision with your AI trainer", "Back",
  "You're offline — Mochi will use saved content where possible.", "Reset translations",
  "Next puzzle →", "See my stars ⭐", "Round complete!", "Play again 🔁", "Pick another topic",
  "Purr-fect!", "Good try!", "Playing offline puzzles — connect to the internet for fresh ones.",
  "Scan & solve", "Scan a question", "Point your camera at one question", "Scan a different question",
  "Get the answer", "Solving…", "Solve another", "Mark another",
  "Mochi is thinking up your puzzles…", "Snap a photo and Mochi checks it", "Cancel anytime · No ads · Made for families",
  "Languages 🌍", "Learn to speak with your AI teacher, Mochi", "Lesson with your AI teacher", "Practise what you learned",
  "How would you like to practise?", "Quiz", "Match phrases to their meaning", "Listening", "Hear it, then pick what it means",
  "Speaking", "Say it out loud and get feedback",
  "Next", "See results", "Try again", "Back to practice", "Again", "Play again",
  "Amazing speaking! 🌟", "For grown-ups", "Cancel", "Confirm", "Speak it", "Listening…", "I can say it — next", "I can say it — finish",
  "Parent & teacher portal", "Sign in", "Create account",
  "At least 8 characters", "Change password", "Current password", "New password",
  "Time to change your password", "Password changed. Other devices have been signed out.", "Add your first child to start tracking.", "Add child", "Add a child",
  "Sign out", "Delete my account & data", "Email", "Copy", "Create a class to get started.", "Create", "Create a class",
  "Add pupil", "Add a pupil", "Add a goal or task", "Add task", "Link",
  "/month", "✨ Free trial active — {h}h left", "Subscribe — {price}/mo", "Subscribe & start — {price}/mo",
  "{ks} is locked", "Unlock it with the {plan} plan", "You got {c} out of {n} right",
  "You scored {c}/{n}! 🎉", "{c}/{n} — lovely listening! 🎧", "You practised {n} phrases in {lang}.",
  "Restore purchases", "Manage subscription", "Subscription management becomes available once billing is set up.",
  "A grown-up confirms before any purchase. Secure checkout is handled by Stripe.",
  "A grown-up confirms before any purchase. Payment is handled securely by Google Play.",
  "A grown-up confirms before any purchase. This is demo mode — no real payment is taken.",
  "You're all set! 🎉", "Your subscription is active. Enjoy learning with Mochi!", "Start learning",
  "Please create a free account first so your subscription is saved to you.", "Terms",
  "I scored {c}/{n} on Education Academy! 🐱⭐ Learn with Mochi:", "Come and learn with Mochi on Education Academy! 🐱",
  "Copied! Paste it anywhere to share.", "Invite link copied!", "Share my score", "Invite a friend",
  "Badges", "Your badges", "{e} of {t} earned", "{d} day streak", "Daily goal", "Goal reached! 🎉",
  "We use only essential storage to make the app work — no ads, no tracking.", "Got it",
  "Mochi's shop", "Dress up Mochi with stars you've earned", "Colours", "Hats", "Extras",
  "Buy ⭐{cost}", "Wear", "Wearing ✓", "Glasses on", "Glasses off", "Shop", "Daily Challenge", "Daily challenge done ✓",
  "Daily reminder", "A gentle nudge to keep your streak going", "Remind me at", "Reminders work on the installed app.", "Allow notifications in your phone settings to use reminders.",
  "Ask Mochi", "Smart Practice", "Type your question…", "Send", "Explain this", "Give me a hint", "Another example",
  "Hi! I'm Mochi. Ask me anything you're learning and I'll help you work it out. 🐾", "Let's try that again.", "I couldn't reach my brain just now — please try again.",
  "Play a few rounds first and I'll target your tricky topics.", "Mochi is thinking…",
  "Leaderboard", "This week", "Family", "Class", "You", "Open the grown-ups area",
  "Ask a grown-up to connect this device to your family or class to join the leaderboard.", "No scores yet this week — be the first!",
  "🎁 +{n} bonus stars from a friend!", "We'll both get bonus stars.",
  "Streak freeze", "Saves your streak if you miss a day", "You have {n}", "🎁 +{n} bonus stars — thanks for joining!",
];

const NAME = Object.fromEntries(LANGUAGES.map((l) => [l.id, l.name]));
const listeners = new Set();
let lang = "en";
const dicts = {};
const load = (c) => { try { return JSON.parse(localStorage.getItem("whisker.i18n." + c)) || {}; } catch { return {}; } };
const save = (c, d) => { try { localStorage.setItem("whisker.i18n." + c, JSON.stringify(d)); } catch {} };
const notify = () => listeners.forEach((fn) => { try { fn(); } catch {} });

export function setUiLang(code) {
  lang = (code || "en").split("-")[0];
  if (lang === "en") { notify(); return; }
  if (!dicts[lang]) dicts[lang] = load(lang);
  const missing = STRINGS.filter((s) => !dicts[lang][s]);
  if (!missing.length) { notify(); return; }
  translateBatch({ strings: missing, language: NAME[lang] || lang })
    .then((arr) => { missing.forEach((s, i) => { if (arr[i]) dicts[lang][s] = arr[i]; }); save(lang, dicts[lang]); notify(); })
    .catch(() => notify());
}
export function t(en) { if (lang === "en") return en; return (dicts[lang] && dicts[lang][en]) || en; }

// Translate a template containing {placeholders}, then substitute values.
// The translator preserves {placeholders}; substitution happens after.
export function tf(template, vars = {}) {
  return t(template).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

// Clear all cached translations and re-fetch the current language (for when wording changes).
export function resetTranslations() {
  try { Object.keys(localStorage).forEach((k) => { if (k.startsWith("whisker.i18n.")) localStorage.removeItem(k); }); } catch {}
  Object.keys(dicts).forEach((k) => delete dicts[k]);
  setUiLang(lang);
}

// Hook: returns t() and re-renders the component when translations load.
export function useT() {
  const [, force] = useState(0);
  useEffect(() => { const fn = () => force((n) => n + 1); listeners.add(fn); return () => listeners.delete(fn); }, []);
  return t;
}
