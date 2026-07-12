// Demo mode for Education Academy.
//
// The app proxies every AI feature through /api/claude. Without an
// ANTHROPIC_API_KEY that endpoint used to hard-error, so a keyless deploy was
// dead on arrival for marking, solving, tutoring, courses and languages.
//
// This module answers those calls with genuine, feature-shaped sample content —
// real questions from the offline bank, believable homework feedback, worked
// solutions, a Socratic tutor reply, a mini language lesson, and so on — all in
// the exact JSON shape each client feature parses. So a live demo is fully
// clickable end-to-end, and you can add the key later for real generation.

import { BANK } from "../src/data/bank.js";

// ---- infer stage/subject from the system prompt (tutorBrief embeds them) ----
function detectKs(text) {
  const t = String(text || "");
  if (/Key Stage 1/i.test(t)) return "ks1";
  if (/Key Stage 3/i.test(t)) return "ks3";
  if (/Higher Education|university-level/i.test(t)) return "he";
  return "ks2";
}
function detectSubject(text) {
  const t = String(text || "");
  if (/current subject is English/i.test(t) || /\bEnglish\b/.test(t)) return "english";
  if (/current subject is Science/i.test(t) || /\bScience\b/.test(t)) return "science";
  return "maths";
}
function detectCount(text, dflt) {
  const m = String(text || "").match(/exactly (\d+)/i) || String(text || "").match(/(\d+)\s+exam/i);
  return m ? Math.max(1, Math.min(20, Number(m[1]))) : dflt;
}
function shuffle(a) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
const SUBJ_NAME = { maths: "Maths", english: "English", science: "Science" };

// ---- per-feature builders (return the TEXT the client will JSON-parse) ----

function demoQuestions(system) {
  const ks = detectKs(system), subject = detectSubject(system);
  const count = detectCount(system, 15);
  let pool = BANK[`${ks}_${subject}`] || BANK[`${ks}_maths`] || BANK.ks2_maths;
  const questions = shuffle(pool).slice(0, count);
  return JSON.stringify({ questions });
}

function demoMark(system) {
  const subject = SUBJ_NAME[detectSubject(system)] || "Maths";
  return JSON.stringify({
    subjectDetected: subject,
    summary: "Lovely effort! Most of this is spot on, and your working is clear and easy to follow. 🐾",
    score: "6 out of 8",
    items: [
      { label: "Question 1", correct: true, comment: "Perfect — neatly set out." },
      { label: "Question 2", correct: true, comment: "Great, you carried the ten correctly." },
      { label: "Question 3", correct: false, comment: "So close — check the last step again." },
      { label: "Question 4", correct: true, comment: "Well done, exactly right." },
      { label: "Question 5", correct: false, comment: "The method is right; just a small slip in the total." },
    ],
    praise: "Your handwriting is lovely and clear — that makes marking a joy! ⭐",
    nextStep: "Try double-checking each answer by working backwards. You've got this!",
  });
}

function demoSolve(system) {
  const subject = SUBJ_NAME[detectSubject(system)] || "Maths";
  return JSON.stringify({
    questionRead: "What is 3/4 of 20?",
    subject,
    answer: "15",
    steps: [
      "Find one quarter first: 20 ÷ 4 = 5.",
      "You need three quarters, so multiply: 5 × 3 = 15.",
      "So 3/4 of 20 is 15.",
    ],
    concept: "Finding a fraction of an amount by dividing then multiplying.",
  });
}

function demoChat() {
  const replies = [
    "Great question! Let's take it one step at a time. What do you already know about this — and what feels tricky? 🐾",
    "I love that you're thinking hard about this. Here's a hint: try a smaller example first, then look for the pattern. What do you notice?",
    "You're on the right track! Before I say more — what would happen if you tried the very first step out loud?",
  ];
  return replies[Math.floor(Math.random() * replies.length)];
}

function demoGoal() {
  return JSON.stringify({
    title: "Master times tables to 6×",
    detail: "Spend five minutes a day this week on the 2, 5 and 10 times tables, then try mixed questions. Little and often beats one long session — you'll be amazed how quickly it sticks! 🌟",
  });
}

function demoLanguage(system) {
  const m = String(system).match(/teaching ([A-Za-z]+)/i);
  const lang = m ? m[1] : "French";
  return JSON.stringify({
    intro: `Let's learn some friendly ${lang} greetings together!`,
    phrases: [
      { target: "Bonjour", roman: "bon-zhoor", english: "Hello / Good day", tip: "Use it any time in the daytime." },
      { target: "Merci", roman: "mair-see", english: "Thank you", tip: "Add 'beaucoup' to say thank you very much." },
      { target: "S'il vous plaît", roman: "seel-voo-play", english: "Please", tip: "Politeness opens every door!" },
      { target: "Au revoir", roman: "oh-ruh-vwar", english: "Goodbye", tip: "Say it with a little wave. 👋" },
      { target: "Oui", roman: "wee", english: "Yes", tip: "Short and sweet." },
    ],
    quiz: [
      { prompt: "Which word means 'Hello'?", options: ["Merci", "Bonjour", "Oui", "Au revoir"], answerIndex: 1 },
      { prompt: "How do you say 'Thank you'?", options: ["Merci", "Bonjour", "Oui", "Please"], answerIndex: 0 },
      { prompt: "Which one means 'Goodbye'?", options: ["Oui", "Merci", "Au revoir", "Bonjour"], answerIndex: 2 },
    ],
  });
}

function demoNote() {
  return "Your child is making steady, happy progress — accuracy is climbing and they're showing up regularly, which matters most at this age. Fractions are the one area to keep nudging; a few minutes of practice this week will make a real difference. Keep cheering them on! 🐾";
}

function demoCourse(system) {
  const m = String(system).match(/for "([^"]+)"/);
  const course = m ? m[1] : "your course";
  return JSON.stringify({
    intro: `Let's revise the key ideas for ${course} — you're closer to passing than you think!`,
    keypoints: [
      "Always start from the relevant UK standard and work outwards to the practical case.",
      "Safe isolation before work: prove dead, lock off, and test your tester.",
      "Record readings methodically — clear records are half of a good assessment answer.",
      "Know the difference between inspection and testing, and when each applies.",
      "When unsure on site, stop and consult the standard rather than guess.",
    ],
    quiz: [
      { q: "What should you do immediately before working on a circuit you believe is isolated?", options: ["Assume it's dead", "Prove it dead with an approved tester", "Ask a colleague", "Check the invoice"], answerIndex: 1, why: "Always prove dead with a tester you've verified works before and after." },
      { q: "Which comes first in safe isolation?", options: ["Test", "Lock off", "Identify the circuit", "Sign off"], answerIndex: 2, why: "Correctly identify the circuit before isolating and locking off." },
      { q: "Good assessment records are…", options: ["Optional", "Methodical and clear", "Only for large jobs", "Kept in your head"], answerIndex: 1, why: "Clear, methodical records demonstrate competence and traceability." },
      { q: "If a requirement is unclear on site you should…", options: ["Guess sensibly", "Consult the relevant standard", "Skip it", "Ask the customer"], answerIndex: 1, why: "Consult the standard — it's the authoritative source." },
    ],
  });
}

function demoExam(system) {
  const count = detectCount(system, 10);
  const base = [
    { q: "The unit of electrical resistance is the…", options: ["volt", "amp", "ohm", "watt"], answerIndex: 2, why: "Resistance is measured in ohms (Ω)." },
    { q: "Safe isolation requires you to…", options: ["Work quickly", "Prove dead before touching", "Trust the label", "Wear gloves only"], answerIndex: 1, why: "Always prove the circuit dead with a verified tester." },
    { q: "A risk assessment is completed…", options: ["After the job", "Before starting work", "Only if asked", "Never"], answerIndex: 1, why: "Assess risks before work begins." },
    { q: "Records of test results should be…", options: ["Verbal", "Clear and written", "Optional", "Kept private"], answerIndex: 1, why: "Written, clear records are part of a compliant job." },
    { q: "The first step of safe isolation is to…", options: ["Lock off", "Identify the circuit", "Test", "Sign off"], answerIndex: 1, why: "Identify the correct circuit first." },
  ];
  const quiz = Array.from({ length: count }, (_, i) => base[i % base.length]);
  return JSON.stringify({ quiz });
}

function demoVoice() {
  return JSON.stringify({
    action: "unknown",
    ks: null, subject: null, topic: null, count: null, language: null,
    say: "In demo mode I can't route that yet — add an API key to enable voice control. Try tapping a subject to play!",
  });
}

// Translate: with no key we keep the UI in English. For a single string, echo it
// back; for a batch (a JSON array), return the same array so lengths line up.
function demoTranslate(content) {
  const raw = typeof content === "string" ? content : "";
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try { const arr = JSON.parse(trimmed); if (Array.isArray(arr)) return JSON.stringify(arr); } catch {}
  }
  return raw;
}

// Router. `feature` is the hint the client sends; fall back to a friendly line.
export function demoResponseText({ system = "", content = "", feature = "" }) {
  switch (feature) {
    case "questions": return demoQuestions(system);
    case "mark": return demoMark(system);
    case "solve": return demoSolve(system);
    case "chat": return demoChat();
    case "goal": return demoGoal();
    case "language": return demoLanguage(system);
    case "note": return demoNote();
    case "course": return demoCourse(system);
    case "exam": return demoExam(system);
    case "voice": return demoVoice();
    case "translate": return demoTranslate(content);
    default:
      return "Demo mode is on — add an ANTHROPIC_API_KEY on the server to unlock live AI. Everything else works!";
  }
}

// Shape it exactly like the Anthropic Messages API so the client parses it as-is.
export function demoClaudeResponse(body) {
  return { content: [{ type: "text", text: demoResponseText(body || {}) }], model: "demo", stop_reason: "end_turn" };
}
