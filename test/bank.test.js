import test from "node:test";
import assert from "node:assert/strict";
import { BANK } from "../src/data/bank.js";
import { SUBJECTS_BY_KS } from "../src/data/curriculum.js";

const ROUND_SIZE = 15; // must match ROUND_SIZE in src/App.jsx

test("every stage/subject combination has an offline bank", () => {
  for (const [ks, subjects] of Object.entries(SUBJECTS_BY_KS)) {
    for (const subject of subjects) {
      assert.ok(Array.isArray(BANK[`${ks}_${subject}`]), `missing bank for ${ks}_${subject}`);
    }
  }
});

test("every bank holds at least a full round of questions", () => {
  for (const [key, arr] of Object.entries(BANK)) {
    assert.ok(arr.length >= ROUND_SIZE, `${key} has ${arr.length} questions, needs >= ${ROUND_SIZE}`);
  }
});

test("every question is well-formed", () => {
  for (const [key, arr] of Object.entries(BANK)) {
    const seen = new Set();
    arr.forEach((q, i) => {
      const id = `${key}[${i}]`;
      assert.equal(typeof q.question, "string", `${id} question must be a string`);
      assert.ok(q.question.trim().length > 0, `${id} question must not be empty`);
      assert.ok(Array.isArray(q.choices) && q.choices.length === 4, `${id} must have exactly 4 choices`);
      q.choices.forEach((c, j) => assert.ok(String(c).trim().length > 0, `${id} choice ${j} must not be empty`));
      assert.ok(Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex <= 3, `${id} answerIndex out of range`);
      assert.equal(new Set(q.choices.map(String)).size, 4, `${id} has duplicate choices`);
      assert.equal(typeof q.explanation, "string", `${id} explanation must be a string`);
      assert.ok(!seen.has(q.question), `${id} duplicate question text in ${key}`);
      seen.add(q.question);
    });
  }
});

test("correct answers are spread across positions in each bank", () => {
  for (const [key, arr] of Object.entries(BANK)) {
    const positions = new Set(arr.map((q) => q.answerIndex));
    assert.ok(positions.size >= 2, `${key} puts every correct answer in the same position`);
  }
});
