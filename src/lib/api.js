import { tutorBrief, SUBJ, KS_LABEL } from "../data/curriculum.js";

// In dev, Vite proxies /api to the backend. For a production mobile build,
// set VITE_API_BASE to your deployed backend URL (see README).
const BASE = import.meta.env.VITE_API_BASE || "/api";

export function extractJSON(text) {
  let t = (text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s !== -1 && e !== -1) t = t.slice(s, e + 1);
  return JSON.parse(t);
}

// Typed API error so the UI can tell offline / timeout / rate-limited / server
// failures apart. `message` is always safe to show to a learner.
export class ApiError extends Error {
  constructor(message, { kind = "server", status = 0, retryAfter = 0 } = {}) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;       // "offline" | "timeout" | "network" | "rate-limited" | "server"
    this.status = status;
    this.retryAfter = retryAfter; // seconds, for kind === "rate-limited"
  }
}

const TIMEOUT_MS = 90000; // image marking can legitimately take a while

async function call({ system, content, max_tokens = 1500, feature }) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new ApiError("You're offline — Mochi needs the internet for this.", { kind: "offline" });
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${BASE}/claude`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, content, max_tokens, feature }),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") throw new ApiError("That took too long — please try again.", { kind: "timeout" });
    throw new ApiError("Couldn't reach Mochi — check your connection and try again.", { kind: "network" });
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) {
    const retryAfter = Math.max(1, Number(res.headers.get("retry-after")) || 30);
    throw new ApiError(`Mochi needs a little rest — try again in ${retryAfter} seconds.`, { kind: "rate-limited", status: 429, retryAfter });
  }
  if (!res.ok) throw new ApiError("Mochi had a hiccup — please try again in a moment.", { status: res.status });
  const data = await res.json();
  if (data.error) throw new ApiError(String(data.error.message || data.error), { status: res.status });
  return (data.content || []).map((b) => (b.type === "text" ? b.text : "")).join("\n");
}

// 15 fresh multiple-choice questions for a stage/subject/topic.
// Ask Mochi: a Socratic tutor chat — guides with hints and questions, age-appropriate.
export async function askTutor({ messages = [], ks = "ks2", language = "English" }) {
  const langClause = (language && language !== "English") ? ` Always reply in natural, age-appropriate ${language}.` : "";
  const system =
    `You are Mochi, a warm, encouraging cat tutor for a ${String(ks).toUpperCase()} learner. ` +
    `Teach like a great tutor: guide with small steps, hints and questions instead of just giving the final answer; check understanding; keep replies short (2–4 sentences), friendly and in simple words, with an example when it helps. ` +
    `If a learner asks for the answer to what looks like a live test or homework they must do alone, teach the underlying idea instead. If anything is inappropriate or unsafe, gently steer back to learning.` +
    langClause;
  const transcript = messages.map((m) => `${m.role === "user" ? "Learner" : "Mochi"}: ${m.text}`).join("\n");
  const text = await call({ system, content: `${transcript}\nMochi:`, max_tokens: 600, feature: "chat" });
  return text.trim();
}

export async function generateQuestions({ ks, subject, topic, count = 15, language = "English" }) {
  const diff = ks === "ks1" ? "very easy" : ks === "he" ? "rigorous and university-level" : "appropriately challenging";
  const langClause = (language && language !== "English")
    ? ` Write the question text, all four answer choices, AND the explanation in natural, age-appropriate ${language}. Do not include any English text or translations. Keep numerals and standard symbols where appropriate.`
    : "";
  const system =
    tutorBrief(ks, subject) +
    ` Create exactly ${count} multiple-choice questions on the given topic. Each has 4 short answer choices with exactly one correct; vary the position of the correct answer across questions.` +
    langClause +
    ` Reply with ONLY raw JSON, no markdown:` +
    ' {"questions":[{"question":"...","choices":["a","b","c","d"],"answerIndex":0,"explanation":"one short sentence"}]}';
  const text = await call({
    system,
    content: `Topic: ${topic}. Make them fun and ${diff}. Do not repeat questions.`,
    max_tokens: 3500,
    feature: "questions",
  });
  const parsed = extractJSON(text);
  return (parsed.questions || []).filter((q) => Array.isArray(q.choices) && q.choices.length === 4).slice(0, count);
}

// Mark a photo of completed homework.
export async function markHomework({ ks, subject, image, language = "English" }) {
  const langClause = (language && language !== "English")
    ? ` Write all your feedback — summary, each comment, praise and next step — in natural ${language}. Keep numerals and the learner's original answers as they are.`
    : "";
  const system =
    tutorBrief(ks, subject) +
    " You are marking a photo of a learner's homework. Be warm and always find something to praise. Judge each visible question; if handwriting is unclear, say so kindly rather than guessing." +
    langClause +
    " Reply with ONLY raw JSON:" +
    ' {"subjectDetected":"...","summary":"1-2 friendly sentences","score":"e.g. 6 out of 8 or null","items":[{"label":"Question 1","correct":true,"comment":"short note"}],"praise":"one cheerful line","nextStep":"one gentle tip"}';
  const text = await call({
    max_tokens: 1600,
    feature: "mark",
    system,
    content: [
      { type: "image", source: { type: "base64", media_type: image.mime, data: image.data } },
      { type: "text", text: `Please mark this ${KS_LABEL[ks]}${subject ? " " + SUBJ[subject].name : ""} homework.` },
    ],
  });
  return extractJSON(text);
}

// Scan or type a single question and get the answer + worked steps.
export async function solveQuestion({ ks, image, text, language = "English" }) {
  const langClause = (language && language !== "English")
    ? ` Write the steps and the concept in natural ${language}. Keep the final answer, numerals and symbols as appropriate.`
    : "";
  const system =
    tutorBrief(ks, null) +
    " The learner has scanned or typed a question and wants to understand it. Read the question, give the correct final answer, then show clear step-by-step working at the right level." +
    langClause +
    " Reply with ONLY raw JSON:" +
    ' {"questionRead":"...","subject":"...","answer":"the final answer, concise","steps":["step 1","step 2"],"concept":"one line on what this teaches"}';
  const content = [];
  if (image) content.push({ type: "image", source: { type: "base64", media_type: image.mime, data: image.data } });
  content.push({ type: "text", text: text?.trim() ? `Question: ${text.trim()}` : "Solve the question in the image." });
  const out = await call({ max_tokens: 1400, system, content, feature: "solve" });
  return extractJSON(out);
}

// Suggest a short, achievable goal/task for a child (used by the grown-ups portal).
export async function suggestGoal({ ks, subject, childName = "the learner", focus = "" }) {
  const system =
    tutorBrief(ks, subject || null) +
    " Suggest ONE short, specific, achievable learning goal or task suitable for this learner this week. Keep the title under 8 words. Reply with ONLY raw JSON:" +
    ' {"title":"...","detail":"one or two encouraging sentences explaining the task"}';
  const out = await call({
    system,
    content: `Learner: ${childName}. ${focus ? "Focus on: " + focus + ". " : ""}Make it motivating and age-appropriate.`,
    max_tokens: 400,
    feature: "goal",
  });
  return extractJSON(out);
}

// Expert AI language teacher: returns a short, child-friendly lesson + mini quiz.
export async function languageLesson({ language, topic = "Greetings", level = "beginner" }) {
  const system =
    `You are Mochi, a warm, patient, expert language teacher for children, teaching ${language}. ` +
    `Create a short ${level} lesson on "${topic}". Be cheerful, simple and encouraging. ` +
    `Reply with ONLY raw JSON (no markdown): ` +
    `{"intro":"one friendly sentence to say out loud introducing the lesson",` +
    `"phrases":[{"target":"phrase in ${language} native script","roman":"easy pronunciation in Latin letters","english":"English meaning","tip":"short friendly tip"}],` +
    `"quiz":[{"prompt":"short English question to pick the right ${language} phrase or its meaning","options":["..","..","..",".."],"answerIndex":0}]}. ` +
    `Use 5-6 phrases and 3 quiz questions. Always include "roman" for non-Latin scripts.`;
  const out = await call({ system, content: `Teach this now: ${topic} (${level}).`, max_tokens: 1300, feature: "language" });
  return extractJSON(out);
}

// A short, encouraging progress note from Mochi for a parent report.
export async function progressNote({ childName = "your child", ks, overview, weak = [], goalsOpen = 0, goalsDone = 0 }) {
  const system =
    "You are Mochi, a warm, encouraging tutor. Write a short progress note (2-3 sentences) for a PARENT about their child's learning. " +
    "Be specific, positive and end with one gentle suggestion. Plain text only, no markdown, no preamble.";
  const content =
    `Child: ${childName}. Stage: ${ks}. Accuracy: ${overview.accuracy}%. Questions answered: ${overview.answered}. Rounds: ${overview.rounds}. ` +
    `Topics to practise: ${weak.map((w) => w.topic).join(", ") || "none in particular"}. Goals: ${goalsDone} done, ${goalsOpen} open.`;
  const out = await call({ system, content, max_tokens: 220, feature: "note" });
  return String(out).trim();
}

// Expert vocational trainer: an exam-prep lesson + exam-style quiz for a course module.
export async function courseLesson({ course, module, level = "exam preparation", language = "English" }) {
  const langClause = (language && language !== "English")
    ? ` Write the intro, all keypoints, and every quiz question, option and explanation in natural ${language}. Keep UK standard names, regulation codes and acronyms (for example BS 7671, GSIUR, MCS, G98/G99) and units unchanged.`
    : "";
  const system =
    `You are an expert UK vocational trainer delivering ${level} for "${course}". Teach the module "${module}" clearly for an adult revising for assessment. ` +
    `Be accurate and practical and name relevant UK standards/regulations where appropriate, but DO NOT invent specific clause or table numbers.` +
    langClause +
    ` Reply with ONLY raw JSON (no markdown): {"intro":"one motivating sentence to say aloud","keypoints":["concise revision points"],` +
    `"quiz":[{"q":"exam-style question","options":["..","..","..",".."],"answerIndex":0,"why":"short explanation"}]}. ` +
    `Use 5-7 keypoints and 4 exam-style questions. If unsure, stay general rather than inventing specifics.`;
  const out = await call({ system, content: `Teach module: ${module}. Audience: adult revising for ${course} assessment.`, max_tokens: 1600, feature: "course" });
  return extractJSON(out);
}

// A batch of exam-style questions across a whole course (for mock exams).
export async function examQuestions({ course, modules = [], count = 10, language = "English" }) {
  const langClause = (language && language !== "English")
    ? ` Write every question, option and explanation in natural ${language}. Keep UK standard names, regulation codes and acronyms (for example BS 7671, GSIUR, MCS, G98/G99) and units unchanged.`
    : "";
  const system =
    `You are an expert UK vocational examiner for "${course}". Write ${count} exam-style multiple-choice questions spanning these topics: ${modules.join(", ")}. ` +
    `Accurate and practical; name UK standards/regulations where appropriate but DO NOT invent specific clause or table numbers. Vary the difficulty.` +
    langClause +
    ` Reply with ONLY raw JSON (no markdown): {"quiz":[{"q":"...","options":["","","",""],"answerIndex":0,"why":"short explanation"}]}. Exactly ${count} questions, each with 4 options.`;
  const out = await call({ system, content: `Generate ${count} exam questions for ${course}.`, max_tokens: 3200, feature: "exam" });
  const data = extractJSON(out);
  return Array.isArray(data?.quiz) ? data.quiz : [];
}

// Interpret a spoken command and route it to one in-app action.
export async function voiceCommand({ transcript, actions = [] }) {
  const system =
    `You route a short spoken command in a children's education app to ONE action. ` +
    `Available actions: ${actions.join(", ")}. ` +
    `Reply with ONLY raw JSON (no markdown): {"action":"<one of the actions, or 'unknown'>","ks":"ks1|ks2|ks3|he|null","subject":"maths|english|science|null","topic":"<short topic like 'fractions', or null>","count":<integer number of questions, or null>,"language":"<a language name like French, or null>","say":"a short friendly confirmation to read aloud"}. ` +
    `Map phrases like "open the calculator" -> calculator; "show my progress" -> grownups; "subscribe"/"plans" -> plans; "languages" -> languages; "courses"/"exam" -> courses; "home" -> home; "settings" -> settings. ` +
    `For practice/quiz requests use action "play" and fill subject, topic and count: e.g. "give me 10 KS2 fractions questions" -> {action:"play",ks:"ks2",subject:"maths",topic:"fractions",count:10}. ` +
    `For changing my speaking language use action "setLanguage" with the language name: e.g. "speak in French"/"change language to Spanish" -> {action:"setLanguage",language:"French"}. If unclear, use action "unknown".`;
  const out = await call({ system, content: `Command: "${transcript}"`, max_tokens: 220, feature: "voice" });
  return extractJSON(out);
}

// Translate short UI/guidance text into another language (for Mochi's voice).
export async function translateText({ text, language }) {
  if (!text) return "";
  const system = `Translate the user's text into ${language}. Reply with ONLY the natural translation — no quotes, no notes, no transliteration, no English.`;
  const out = await call({ system, content: String(text), max_tokens: 400, feature: "translate" });
  return (out || "").trim();
}

// Translate a batch of UI strings in one call. Returns an array (same order).
export async function translateBatch({ strings = [], language }) {
  if (!strings.length) return [];
  const system =
    `Translate each item of the user's JSON array of short app UI strings into ${language}. ` +
    `Keep brand names (Education Academy, Mochi), prices like "£3/mo", emoji and placeholders intact. ` +
    `Reply with ONLY a raw JSON array of strings, the same length and order, each the translation of the matching item — no notes.`;
  const out = await call({ system, content: JSON.stringify(strings), max_tokens: 2000, feature: "translate" });
  try { const arr = JSON.parse((out || "").replace(/```json/gi, "").replace(/```/g, "").trim()); return Array.isArray(arr) ? arr : []; }
  catch { return []; }
}
