// Printable Worksheet Generator — a premium tool for parents and teachers.
//
// Builds a clean, printable worksheet (questions + a separate answer key) from
// the offline question bank, so it works with zero AI cost and even offline.
// Subscriber-gated in the UI; this module is pure and unit-testable.

import { BANK } from "../data/bank.js";
import { KS_LABEL, SUBJ } from "../data/curriculum.js";

const LETTERS = ["A", "B", "C", "D"];

function shuffle(a) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

// Assemble a worksheet model: { title, subject, stage, questions, answers }.
export function buildWorksheet({ ks = "ks2", subject = "maths", count = 10 } = {}) {
  const pool = BANK[`${ks}_${subject}`] || BANK[`${ks}_maths`] || BANK.ks2_maths;
  const picked = shuffle(pool).slice(0, Math.max(1, Math.min(20, count)));
  const questions = picked.map((q, i) => ({
    n: i + 1,
    question: q.question,
    choices: q.choices.map((c, ci) => ({ letter: LETTERS[ci], text: c })),
  }));
  const answers = picked.map((q, i) => ({
    n: i + 1,
    letter: LETTERS[q.answerIndex] || "?",
    text: q.choices[q.answerIndex],
    explanation: q.explanation || "",
  }));
  return {
    title: `${KS_LABEL[ks] || "Learning"} ${SUBJ[subject]?.name || ""} Worksheet`.trim(),
    stage: KS_LABEL[ks] || ks,
    subject: SUBJ[subject]?.name || subject,
    questions,
    answers,
  };
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Render the worksheet model to a standalone, print-ready HTML document.
export function worksheetHTML(model) {
  const qs = model.questions.map((q) => `
    <div class="q">
      <div class="qh"><span class="n">${q.n}.</span> ${esc(q.question)}</div>
      <ol class="choices">${q.choices.map((c) => `<li><span class="op">${c.letter}</span> ${esc(c.text)}</li>`).join("")}</ol>
    </div>`).join("");
  const key = model.answers.map((a) => `<li><b>${a.n}. ${a.letter}</b> — ${esc(a.text)}${a.explanation ? ` <span class="why">(${esc(a.explanation)})</span>` : ""}</li>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(model.title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; color: #33261c; margin: 32px; }
    h1 { font-size: 22px; margin: 0 0 2px; }
    .sub { color: #8a7663; margin: 0 0 18px; font-size: 13px; }
    .brand { float: right; font-weight: 800; color: #e08a2b; }
    .meta { display: flex; gap: 24px; font-size: 13px; color: #8a7663; margin-bottom: 18px; }
    .meta span { border-bottom: 1px dotted #cbb8a3; min-width: 120px; }
    .q { margin: 0 0 14px; page-break-inside: avoid; }
    .qh { font-weight: 600; }
    .n { color: #e08a2b; font-weight: 800; }
    ol.choices { list-style: none; padding: 6px 0 0 22px; margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; }
    ol.choices .op { display: inline-grid; place-items: center; width: 20px; height: 20px; border: 1.5px solid #d9c4ae; border-radius: 6px; font-weight: 700; font-size: 12px; margin-right: 6px; }
    .key { margin-top: 28px; border-top: 2px dashed #e0d2c0; padding-top: 14px; page-break-before: always; }
    .key h2 { font-size: 16px; }
    .key ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; font-size: 13px; }
    .why { color: #8a7663; }
    @media print { body { margin: 14mm; } .brand { color: #000; } }
  </style></head><body>
    <div class="brand">🐱 Education Academy</div>
    <h1>${esc(model.title)}</h1>
    <p class="sub">${esc(model.stage)} · ${esc(model.subject)} · ${model.questions.length} questions</p>
    <div class="meta"><div>Name: <span>&nbsp;</span></div><div>Date: <span>&nbsp;</span></div><div>Score: <span>&nbsp;</span></div></div>
    ${qs}
    <div class="key"><h2>Answer key</h2><ul>${key}</ul></div>
  </body></html>`;
}

// Open the worksheet in a new tab/window and trigger the print dialog.
// Returns false if a popup blocker prevented it (caller can show a toast).
export function printWorksheet(opts) {
  const model = buildWorksheet(opts);
  const html = worksheetHTML(model);
  const w = typeof window !== "undefined" ? window.open("", "_blank") : null;
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch {} }, 350);
  return true;
}
