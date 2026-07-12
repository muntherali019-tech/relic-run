// Unit tests for the content engine — the pure helpers behind demo mode and
// the storyboard/subtitle pipeline. No server, no API key, no deps beyond
// Node's built-in test runner.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PALETTES,
  demoStoryboard,
  demoHooks,
  demoSeries,
  demoClips,
  demoCaptions,
  demoDesign,
  decorateStoryboard,
  buildSRT,
  seedFrom,
} from "../server/content.js";

test("demoStoryboard is topic-aware and never lorem", () => {
  const focus = demoStoryboard("morning focus habits", 5);
  assert.equal(focus.title, "3 Habits That Doubled My Focus");
  const money = demoStoryboard("how to save money", 5);
  assert.match(money.title, /\$4,000/);
  // adaptive fallback still reads like real copy, not filler
  const other = demoStoryboard("underwater basket weaving", 5);
  assert.ok(other.hook.length > 10);
  assert.ok(!/lorem|placeholder|add your api key/i.test(JSON.stringify(other)));
});

test("demoStoryboard respects the requested scene count (3..8)", () => {
  for (const n of [3, 4, 6, 8]) {
    assert.equal(demoStoryboard("focus", n).scenes.length, n, `n=${n}`);
  }
  // clamps out-of-range requests
  assert.equal(demoStoryboard("focus", 1).scenes.length, 3);
  assert.equal(demoStoryboard("focus", 99).scenes.length, 8);
});

test("every storyboard scene has the fields the renderer needs", () => {
  const sb = decorateStoryboard(demoStoryboard("fitness plan", 5));
  for (const s of sb.scenes) {
    assert.ok(s.caption && typeof s.caption === "string");
    assert.ok(s.voiceover && typeof s.voiceover === "string");
    assert.ok(s.imagePrompt && typeof s.imagePrompt === "string");
    assert.ok(s.palette && s.palette.bg && s.palette.accent);
  }
  assert.ok(Array.isArray(sb.hashtags) && sb.hashtags.length <= 8);
});

test("decorateStoryboard recovers from malformed input", () => {
  const sb = decorateStoryboard({ scenes: null });
  assert.ok(sb.scenes.length >= 3);
  const sb2 = decorateStoryboard(null);
  assert.ok(sb2.scenes.length >= 3);
});

test("demoHooks returns the requested count of distinct angles", () => {
  const { variants } = demoHooks("cold plunge", 4);
  assert.equal(variants.length, 4);
  const angles = new Set(variants.map((v) => v.angle));
  assert.equal(angles.size, 4);
  for (const v of variants) {
    assert.ok(v.hook.includes("cold plunge") || v.hook.length > 0);
    assert.ok(v.thumbnail.length > 0);
  }
});

test("demoSeries builds a day-numbered plan within bounds", () => {
  const plan = demoSeries("sourdough", 7);
  assert.equal(plan.days, 7);
  assert.equal(plan.plan.length, 7);
  assert.deepEqual(plan.plan.map((d) => d.day), [1, 2, 3, 4, 5, 6, 7]);
  for (const d of plan.plan) {
    assert.ok(d.theme && d.idea && d.format && d.cta);
  }
  assert.equal(demoSeries("x", 99).days, 14); // clamps
  assert.equal(demoSeries("x", 1).days, 3);
});

test("demoClips and demoCaptions produce believable, sized output", () => {
  const clips = demoClips("Here is a long transcript about growth and focus.", 3).clips;
  assert.equal(clips.length, 3);
  assert.ok(clips[0].title && clips[0].quote);

  const caps = demoCaptions("cold plunge", "instagram", 3);
  assert.equal(caps.split("\n\n").length, 3);
  assert.ok(caps.includes("#coldplunge"));
});

test("demoDesign is deterministic per prompt", () => {
  const a = demoDesign("neon quote card");
  const b = demoDesign("neon quote card");
  assert.deepEqual(a, b);
  assert.ok(PALETTES.includes(a.palette));
  assert.ok(["center", "lower", "split"].includes(a.layout));
});

test("buildSRT emits valid, sequential subtitle cues", () => {
  const scenes = demoStoryboard("focus", 4).scenes;
  const srt = buildSRT(scenes, 2.6);
  const blocks = srt.trim().split("\n\n");
  assert.equal(blocks.length, 4);
  // index line, timestamp line, text line
  assert.match(blocks[0], /^1\n00:00:00,000 --> 00:00:02,600\n.+/);
  assert.match(blocks[1], /^2\n00:00:02,600 --> 00:00:05,200\n.+/);
  // timestamps must be well-formed HH:MM:SS,mmm
  for (const b of blocks) {
    assert.match(b.split("\n")[1], /^\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}$/);
  }
});

test("seedFrom is stable and unsigned", () => {
  assert.equal(seedFrom("abc"), seedFrom("abc"));
  assert.ok(seedFrom("abc") >= 0);
  assert.notEqual(seedFrom("abc"), seedFrom("abd"));
});
