import test from "node:test";
import assert from "node:assert/strict";
import { buildWorksheet, worksheetHTML } from "../src/lib/worksheet.js";

// The Printable Worksheet Generator turns the offline bank into a real,
// print-ready sheet with a separate answer key — no AI, works offline.

test("buildWorksheet produces the requested number of questions with lettered choices", () => {
  const ws = buildWorksheet({ ks: "ks2", subject: "maths", count: 10 });
  assert.equal(ws.questions.length, 10);
  assert.equal(ws.answers.length, 10);
  for (const q of ws.questions) {
    assert.ok(q.question && Array.isArray(q.choices) && q.choices.length === 4);
    assert.deepEqual(q.choices.map((c) => c.letter), ["A", "B", "C", "D"]);
  }
});

test("the answer key letter matches the correct choice text", () => {
  const ws = buildWorksheet({ ks: "ks3", subject: "science", count: 8 });
  for (let i = 0; i < ws.answers.length; i++) {
    const a = ws.answers[i];
    const q = ws.questions[i];
    const chosen = q.choices.find((c) => c.letter === a.letter);
    assert.ok(chosen, "answer letter must exist among the choices");
    assert.equal(chosen.text, a.text);
  }
});

test("count is clamped and unknown banks fall back gracefully", () => {
  assert.ok(buildWorksheet({ ks: "ks2", subject: "maths", count: 999 }).questions.length <= 20);
  assert.ok(buildWorksheet({ ks: "ks2", subject: "maths", count: 0 }).questions.length >= 1);
  // Unknown stage/subject falls back to a real bank rather than crashing.
  const fallback = buildWorksheet({ ks: "zzz", subject: "history", count: 5 });
  assert.equal(fallback.questions.length, 5);
});

test("worksheetHTML renders a self-contained, escaped document with an answer key", () => {
  const html = worksheetHTML(buildWorksheet({ ks: "ks1", subject: "english", count: 6 }));
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Answer key/);
  assert.match(html, /Education Academy/);
  // No raw angle brackets from question text should break the markup.
  assert.ok(!/<script/i.test(html));
});
