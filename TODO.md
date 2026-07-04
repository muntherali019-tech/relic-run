# Optimization TODO

Tracking the 15 master prompts scaffolded in `.claude/commands/` (run any of them as a slash command, e.g. `/harden-api`). Two passes have been applied on `claude/relic-run-game-setup-ahiyee`: the setup pass (prompts 1–4) and the full application pass (prompts 5–15).

| # | Prompt | Status | Notes |
|---|--------|--------|-------|
| 1 | `/audit-deps` | ✅ Applied | vite 5 → 8.1.3, @vitejs/plugin-react → 6.0.3, vite-plugin-singlefile → 2.3.3. `npm audit`: **0 vulnerabilities** in both the root and `reelmint/`. |
| 2 | `/harden-api` | ✅ Applied | Rate limiting on `/api/claude`, `/api/tts` (30/5 min per IP) and auth routes (10/15 min); model allowlist + `max_tokens` cap; security headers; `CORS_ORIGIN` restriction; 8-char password minimum; missing-`AUTH_SECRET` production warning. Verified live with curl. |
| 3 | `/optimize-bundle` | ✅ Applied | Lazy-loaded GrownUps, Languages, Courses, Calculator. Main bundle 340 → 276 kB (gzip 104 → 88 kB). |
| 4 | `/ci-pipeline` | ✅ Applied | `.github/workflows/main-ci.yml`: npm ci → audit (fail on high) → tests → server syntax check → all three builds → API smoke test. |
| 5 | `/test-suite` | ✅ Applied | 26 tests, all passing (`npm test`, node:test — no new deps). Server API over real HTTP (auth, access control, cascade deletes, rate limiter), progress logic (streaks incl. freezes), offline-bank integrity. |
| 6 | `/error-resilience` | ✅ Applied | Typed `ApiError` (offline/timeout/network/rate-limited/server) with 90s timeout and child-friendly 429 Retry-After messaging; per-screen ErrorBoundaries around every lazy screen. |
| 7 | `/accessibility-audit` | ✅ Applied | **Also fixed a load-blocking production crash** (`onboard` referenced in effect deps ~70 lines before its declaration — every prod load hit the error screen; present since the initial commit). Touch targets 42→44 px; focus moves to `main` on screen change. Verified headlessly. Remaining: full-app contrast measurement pass. |
| 8 | `/i18n-coverage` | ✅ Applied | 49 GrownUps strings + 6 Languages speech/announce lines wrapped in `t()`/`tf()`. Remaining: the plain-text emailed progress report stays English by design (labels are part of the document format). |
| 9 | `/offline-pwa` | ✅ Applied | `public/sw.js` (shell network-first, hashed assets cache-first, `/api/*` never cached), registered in production web builds only. Verified: offline reload still renders the app. |
| 10 | `/perf-audit` | ✅ Applied | localStorage writes debounced to one per 400 ms burst (was one per state update) with pagehide flush; dashboard stats memoized. Animations already transform-only with reduced-motion coverage. |
| 11 | `/child-safety-compliance` | ✅ Reviewed | All checks passed, no code fixes needed: homework/scan photos live in component memory only (never persisted or synced); privacy.html discloses Anthropic + transient image processing; no third-party trackers anywhere; deletion cascades proven by tests; camera/portal behind consent + parental gate. Owner action: fill the `[DATE]`/`[COMPANY]`/`[CONTACT]` placeholders in marketing/privacy.html before release. |
| 12 | `/db-migration` | ✅ Applied | Postgres JSONB backend already existed in server/store.js; added the missing first-boot import of `server/data/db.json` into an empty database. PG path syntax-checked only — no Postgres/Docker in this sandbox; exercise it once against a real DATABASE_URL. |
| 13 | `/ai-tutor-tuning` | ✅ Applied | Every AI call carries a feature hint (questions/mark/solve/chat/language/course/exam/goal/note/voice/translate); server routes per feature via `MODEL_<FEATURE>` env with `MODEL_DEFAULT` fallback (documented in .env.example). Verified end-to-end against the live API path. Remaining: measure per-feature quality/cost with a real key before switching cheap features to Haiku. |
| 14 | `/refactor-app-shell` | ✅ Applied | All 13 screens extracted to `src/components/screens/` (Home, Gate, SubjectMenu, Play, Solve, Mark, Plans, Paywall, Dashboard, AskMochi, Badges, Leaderboard, Shop, SettingsScreen + shared ConsentCard). App.jsx 1310 → 785 lines and is now the shell: state machine, effects, handlers, header, and modal overlays. Verified with a full headless click-through of every screen including a complete offline quiz round. |
| 15 | `/game-content-expansion` | ✅ Applied | Every stage/subject bank now ≥ 15 questions (full round, no repeats); fixed three duplicate question stems the new validator caught; validator runs in `npm test`. |

## Verified end state

- `npm test`: 26/26 passing · `npm audit`: 0 vulnerabilities (both roots)
- All three builds pass (`build`, `build:app`, `build:onefile`)
- App verified in headless Chromium: renders, navigates, works offline, portal + badges + leaderboard screens clean
