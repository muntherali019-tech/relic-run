---
description: Scaffold an automated test suite for the server and core game logic
---

This project has no tests. Create a lean, fast suite using Node's built-in `node:test` runner (no new dependencies) plus vitest only if component tests are explicitly wanted.

Priority order:
1. Server API tests (highest value): boot server/index.js on a random port with a temp data dir, then test signup/login round-trip, auth-gated routes reject without a token, child access control (a teacher can't read another teacher's pupils), rate limiting, and password policy.
2. Pure-logic unit tests: src/lib/progress.js (recordRound, overview, weakestTopics), server/store.js (overview, weakest), and the Stripe signature verifier with a synthetic HMAC.
3. Offline bank integrity: every entry in src/data/bank.js has exactly one correct answer index in range and 15-question rounds can be assembled for each stage/subject.

Wire `"test": "node --test test/"` into package.json and make the suite pass. Tests must not require ANTHROPIC_API_KEY or network access — the AI proxy is out of scope except for asserting its input clamping.
