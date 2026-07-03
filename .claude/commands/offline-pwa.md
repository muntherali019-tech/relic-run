---
description: Make the web build installable and quiz-playable offline (service worker + precache)
---

The app already has a web manifest, icons, an offline banner, and an offline question bank (src/data/bank.js). Finish the offline story for the web build (dist-web):

1. Add a service worker that precaches the built shell (index.html, hashed JS/CSS chunks, icons) with a cache-first strategy and a version tied to the build hash, so quizzes from the offline bank work with no network.
2. Never cache /api/* responses except an explicit, short-lived cache for course questions if src/lib/examCache.js doesn't already cover it — AI answers must stay fresh.
3. Register the worker only in the web build (`isWeb()` from src/lib/platform.js) and only in production, with an update flow that activates new versions on next launch (skipWaiting + clients.claim, plus a "refresh for update" toast if straightforward).
4. Keep vite config changes minimal: prefer a hand-written public/sw.js + small registration snippet over adding a PWA plugin dependency; if a plugin is clearly better, justify it first.
5. Verify: `npm run build`, serve dist-web, load once, go offline (headless Chromium via Playwright), reload, and complete a quiz question from the offline bank.

Report what is cached, the update strategy, and the verification evidence.
