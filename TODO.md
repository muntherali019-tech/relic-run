# Optimization TODO

Tracking the 15 master prompts scaffolded in `.claude/commands/` (run any of them as a slash command, e.g. `/harden-api`). Each row records whether the optimization was applied in the setup pass on `claude/relic-run-game-setup-ahiyee`, and what remains.

| # | Prompt | Status | Notes |
|---|--------|--------|-------|
| 1 | `/audit-deps` | ✅ Applied | vite 5 → 8.1.3, @vitejs/plugin-react → 6.0.3, vite-plugin-singlefile → 2.3.3. `npm audit`: **0 vulnerabilities** in both the root and `reelmint/`. All three build modes verified. |
| 2 | `/harden-api` | ✅ Applied | In-memory rate limiting on `/api/claude`, `/api/tts` (30/5 min per IP) and auth routes (10/15 min); model allowlist + `max_tokens` cap on the AI proxy; security headers (nosniff, frame-deny, no-referrer); `CORS_ORIGIN` env restriction; 8-char password minimum; production warning for missing `AUTH_SECRET`. All verified live with curl. |
| 3 | `/optimize-bundle` | ✅ Applied | Lazy-loaded GrownUps, Languages, Courses, Calculator via React.lazy + Suspense. Main bundle 340 → 276 kB (gzip 104 → 88 kB). All three build modes pass. |
| 4 | `/ci-pipeline` | ✅ Applied | Added `.github/workflows/main-ci.yml`: npm ci → audit (fail on high) → server syntax check → all three builds → API smoke test. Existing reelmint CI untouched. |
| 5 | `/test-suite` | ⬜ Pending | No tests exist yet. Highest-value next step: server API tests with `node:test`. |
| 6 | `/error-resilience` | ⬜ Pending | Client should honor the new 429 Retry-After responses; per-screen error boundaries. |
| 7 | `/accessibility-audit` | ⬜ Pending | WCAG 2.1 AA pass (contrast, live regions, focus management, touch targets). |
| 8 | `/i18n-coverage` | ⬜ Pending | GrownUps and Languages screens still contain hard-coded English strings. |
| 9 | `/offline-pwa` | ⬜ Pending | Service worker + precache so offline-bank quizzes work fully offline. |
| 10 | `/perf-audit` | ⬜ Pending | App.jsx re-render hotspots, animation cost, localStorage churn. |
| 11 | `/child-safety-compliance` | ⬜ Pending | COPPA / UK Children's Code engineering review of data flows. |
| 12 | `/db-migration` | ⬜ Pending | JSON-file store → Postgres (pg is already an optional dep; Render deploy ready). |
| 13 | `/ai-tutor-tuning` | ⬜ Pending | Per-feature model routing, prompt tuning, cost measurement. Server now enforces `ALLOWED_MODELS` (default `claude-sonnet-4-6,claude-haiku-4-5`, env-overridable). |
| 14 | `/refactor-app-shell` | ⬜ Pending | Break the ~1300-line App.jsx into screen components. |
| 15 | `/game-content-expansion` | ⬜ Pending | Top up offline bank to ≥15 questions per subject; validator script. |

## Other changes in the setup pass

- Removed the stray 1-byte `Higher Education` file from the repo root.
- Verified `npm install`, `npm run build`, `npm run build:app`, and `npm run build:onefile` all succeed, and the API boots and responds in demo mode with no secrets set.
