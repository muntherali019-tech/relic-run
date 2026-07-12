// Anthropic integration for Reelmint.
// Exposes generateText() and generateJSON() plus a vision helper.
// If ANTHROPIC_API_KEY is absent the module runs in DEMO mode so the whole
// product is still clickable end-to-end without a key.

import Anthropic from "@anthropic-ai/sdk";

// Quality model for creative, high-stakes generation (storyboards, edits,
// vision). Fast model for high-volume, low-stakes copy (captions, hooks) —
// cheaper and quicker without hurting the headline output. Both default to
// sensible Claude models and are overridable per deployment.
const MODEL = process.env.AI_MODEL || "claude-opus-4-8";
const MODEL_FAST = process.env.AI_MODEL_FAST || "claude-haiku-4-5";
const API_KEY = process.env.ANTHROPIC_API_KEY || "";

// Which tier each feature uses. Anything not listed falls back to the quality
// model, so new features are high-quality by default until deliberately tuned.
const FEATURE_MODEL = {
  script: MODEL,
  assistant: MODEL,
  scan: MODEL,
  image: MODEL,
  series: MODEL,
  repurpose: MODEL,
  captions: MODEL_FAST,
  hooks: MODEL_FAST,
};

export const aiEnabled = Boolean(API_KEY);

const client = aiEnabled ? new Anthropic({ apiKey: API_KEY }) : null;

function modelFor(feature) {
  return (feature && FEATURE_MODEL[feature]) || MODEL;
}

export function aiStatus() {
  return {
    enabled: aiEnabled,
    model: aiEnabled ? MODEL : "demo",
    fastModel: aiEnabled ? MODEL_FAST : "demo",
  };
}

// Low-level text call. `content` may be a plain string or an array of
// content blocks (used for vision / document input). `feature` picks the model
// tier; `model` can override it directly.
export async function generateText({ system, content, maxTokens = 4000, feature, model }) {
  if (!aiEnabled) {
    return demoText(typeof content === "string" ? content : "");
  }
  const message = await client.messages.create({
    model: model || modelFor(feature),
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content }],
  });
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// Asks the model for JSON and parses it defensively (handles ```json fences
// and stray prose). Falls back to `demo` if nothing parseable comes back.
export async function generateJSON({ system, content, maxTokens = 4000, demo, feature, model }) {
  if (!aiEnabled) return demo;
  const raw = await generateText({
    system: `${system}\n\nReturn ONLY valid minified JSON. No markdown, no commentary.`,
    content,
    maxTokens,
    feature,
    model,
  });
  return parseLooseJSON(raw, demo);
}

// Vision: extract & repurpose content from an uploaded image.
export async function visionExtract({ base64, mediaType, instruction }) {
  if (!aiEnabled) {
    return demoText("scanned image: " + instruction);
  }
  const content = [
    {
      type: "image",
      source: { type: "base64", media_type: mediaType, data: base64 },
    },
    { type: "text", text: instruction },
  ];
  return generateText({
    system:
      "You are Reelmint's scan-and-repurpose engine. Read everything in the image accurately, then do exactly what the user asks.",
    content,
    maxTokens: 4000,
    feature: "scan",
  });
}

function parseLooseJSON(raw, fallback) {
  if (!raw) return fallback;
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

// ---- DEMO MODE helpers (only used when no API key is set) ----
// Returns believable, useful copy — not lorem — so the studio demos well even
// without a key. Routes with structured demo output (captions, scan) supply
// their own richer samples from content.js.
function demoText(seed) {
  const s = (seed || "your idea").trim().slice(0, 60);
  return (
    `Here's a ready-to-post take on ${s}:\n\n` +
    `1. Hook them fast — say the surprising thing in the first line.\n` +
    `2. Deliver one clear, useful point they can act on today.\n` +
    `3. Close with a reason to follow for the next one.\n\n` +
    `(Demo mode — add ANTHROPIC_API_KEY on the server for fully custom AI output.)`
  );
}
