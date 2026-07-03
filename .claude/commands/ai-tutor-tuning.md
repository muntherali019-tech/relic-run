---
description: Improve AI tutor quality — prompts, model choice, cost, and fallbacks
---

Tune the AI features (question generation, homework marking, scan-and-solve, tutor chat, language lessons) end to end. Load the claude-api skill first for current model IDs, pricing, and API parameters — do not work from memory.

1. Review the tutor prompts in src/data/curriculum.js and the request builders in src/lib/api.js: age-tuning per key stage, output-format strictness (the app parses JSON from responses — prefer robust parsing or structured outputs), and language instructions for the i18n path.
2. Review the server proxy defaults in server/index.js: the default model and ALLOWED_MODELS allowlist. Recommend per-feature routing (cheap fast model for question generation, stronger model for marking/solving) with measured cost per round at current prices; make the routing configurable by env, not hard-coded.
3. Fallback behavior: every AI call site should degrade gracefully (offline bank for quizzes exists — verify marking/solving/chat show friendly retryable errors, never a blank screen).
4. Add response caching where repeat cost is pure waste (course questions already cache via src/lib/examCache.js — check quiz generation for the same stage/subject/topic).
5. If an ANTHROPIC_API_KEY is available, run one live request per feature and inspect quality; otherwise dry-run the request bodies and verify shapes against the API reference.

Report: current vs proposed model per feature, expected cost per active child per day, and every prompt change with before/after text.
