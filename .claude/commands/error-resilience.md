---
description: Make every failure mode recoverable — network, AI, speech, billing
---

Harden the app's failure paths so a child never sees a broken screen. The top-level ErrorBoundary exists (src/components/ErrorBoundary.jsx); go deeper.

1. Network failures: every fetch in src/lib/api.js, cloud.js, and billing.js should have a timeout, a typed error the UI can distinguish (offline vs server error vs rate-limited), and one automatic retry with backoff for idempotent GETs only.
2. AI response parsing: anywhere the app JSON-parses model output, malformed output must fall back gracefully (offline bank for quizzes, friendly retry message for marking/solving) — never an uncaught exception.
3. Speech/recognition (src/lib/speech.js, recognition.js): unsupported browsers and denied mic permission must degrade to silent/typed modes without console spam or stuck UI state.
4. Rate-limit handling: the server now returns 429 with Retry-After — the client should surface "Mochi needs a little rest" style messaging and honor the delay.
5. Sync conflicts: bound device state vs cloud state in App.jsx — last-write-wins is fine, but a failed sync must not lose local progress.
6. Add error boundaries around each lazy screen so a crash in Courses doesn't take down the home screen.

Verify by fault injection where possible (block network in Playwright, feed bad JSON through a stubbed fetch). Report each failure mode → old behavior → new behavior.
