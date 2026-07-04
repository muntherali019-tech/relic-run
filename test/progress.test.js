import test from "node:test";
import assert from "node:assert/strict";
import { defaultState, addStars, touchStreak, recordRound, overview, weakestTopics, recordCourseResult, markDailyDone, dailyDone } from "../src/lib/progress.js";

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

test("addStars accumulates total and daily stars", () => {
  let s = addStars(defaultState(), 3);
  s = addStars(s, 2);
  assert.equal(s.stars, 5);
  assert.equal(s.starsToday, 5);
  assert.equal(s.dayStamp, today());
});

test("addStars resets the daily count on a new day", () => {
  const stale = { ...addStars(defaultState(), 7), dayStamp: daysAgo(1) };
  const s = addStars(stale, 1);
  assert.equal(s.starsToday, 1);
  assert.equal(s.stars, 8);
});

test("touchStreak starts, continues, and resets streaks", () => {
  let s = touchStreak(defaultState());
  assert.equal(s.streakDays, 1);
  assert.equal(touchStreak(s).streakDays, 1, "same-day activity must not double-count");
  s = touchStreak({ ...s, lastDay: daysAgo(1) });
  assert.equal(s.streakDays, 2, "consecutive day continues the streak");
  s = touchStreak({ ...s, lastDay: daysAgo(3) });
  assert.equal(s.streakDays, 1, "a long gap resets the streak");
});

test("a streak freeze covers exactly one missed day", () => {
  const base = { ...defaultState(), streakDays: 4, lastDay: daysAgo(2), freezes: 1 };
  const s = touchStreak(base);
  assert.equal(s.streakDays, 5, "freeze bridges the gap");
  assert.equal(s.freezes, 0, "freeze is consumed");
  const noFreeze = touchStreak({ ...base, freezes: 0 });
  assert.equal(noFreeze.streakDays, 1, "without a freeze the streak resets");
});

test("recordRound aggregates stats, topics and history", () => {
  let s = recordRound(defaultState(), { ks: "ks2", subject: "maths", topic: "fractions", total: 15, correct: 12, bestStreak: 6 });
  s = recordRound(s, { ks: "ks2", subject: "maths", topic: "fractions", total: 15, correct: 9, bestStreak: 4 });
  const agg = s.stats["ks2:maths"];
  assert.equal(agg.answered, 30);
  assert.equal(agg.correct, 21);
  assert.equal(agg.rounds, 2);
  assert.equal(agg.bestStreak, 6, "bestStreak keeps the maximum");
  assert.equal(agg.byTopic.fractions.answered, 30);
  assert.equal(s.history.length, 2);
  assert.equal(s.history[0].correct, 9, "history is newest-first");
});

test("overview computes totals and accuracy", () => {
  const s = recordRound(defaultState(), { ks: "ks1", subject: "maths", topic: "adding", total: 10, correct: 7, bestStreak: 3 });
  const o = overview(s);
  assert.deepEqual({ answered: o.answered, correct: o.correct, accuracy: o.accuracy }, { answered: 10, correct: 7, accuracy: 70 });
  assert.equal(overview(defaultState()).accuracy, 0, "no answers means 0% not NaN");
});

test("weakestTopics ranks low-accuracy topics with enough attempts", () => {
  let s = recordRound(defaultState(), { ks: "ks2", subject: "maths", topic: "fractions", total: 10, correct: 2, bestStreak: 1 });
  s = recordRound(s, { ks: "ks2", subject: "maths", topic: "shapes", total: 10, correct: 9, bestStreak: 5 });
  s = recordRound(s, { ks: "ks2", subject: "english", topic: "spelling", total: 2, correct: 0, bestStreak: 0 });
  const weak = weakestTopics(s);
  assert.equal(weak[0].topic, "fractions", "lowest accuracy first");
  assert.ok(!weak.some((w) => w.topic === "spelling"), "topics under 3 attempts are excluded");
});

test("markDailyDone awards the bonus once per day", () => {
  const s = markDailyDone(defaultState(), 5);
  assert.equal(s.stars, 5);
  assert.ok(dailyDone(s));
  assert.equal(markDailyDone(s, 5).stars, 5, "second call the same day is a no-op");
});

test("recordCourseResult prepends and caps history", () => {
  let s = defaultState();
  for (let i = 0; i < 55; i++) s = recordCourseResult(s, { course: "Gas", module: `m${i}`, score: 80, type: "module" });
  assert.equal(s.courses.length, 50, "course history is capped at 50");
  assert.equal(s.courses[0].module, "m54", "newest first");
});
