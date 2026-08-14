# CLAUDE.md

Guidance for AI assistants (Claude Code and others) working in this repository.

## Read this first: the repo is deprecated

`README.md` opens with a deprecation banner. This repo is a **working copy** of
Education Academy; the canonical repo — the one behind the live site — is
[`muntherali019-tech/Higher-education-`](https://github.com/muntherali019-tech/Higher-education-).
This copy is kept for history.

Practical consequence: **the two repos have diverged**, so don't assume a change
here lands anywhere. Things that live only here are the extracted screen
components wired into `App.jsx`, `server/plans.js` (the multi-tier plan catalog),
`server/demo.js`, the API rate limiter, `src/lib/worksheet.js`, the Relic Run
arcade game and the model-orchestrator service. Things that live only in the
canonical repo include gift subscriptions, `src/lib/analytics.js` + the funnel
endpoints, `src/components/Worksheet.jsx`/`Gift.jsx`, `src/lib/printable.js` and
the Vitest test setup. Before porting anything, check the other repo's current
state rather than trusting either CLAUDE.md alone.

If someone asks for work "on Education Academy" without naming a repo, ask which
one they mean.

## What this is

**Education Academy** (package name `whisker-academy`; the repo is `relic-run`) is a
cat-themed educational game for UK KS1–KS3 and Higher Education learners. Mochi, the
cat mascot, guides children through quizzes; the app also offers AI homework marking,
a scan-and-solve helper, a spoken AI tutor, language practice, printable worksheets,
and a grown-ups portal for parents/teachers. Everything is built from **one React
codebase** that ships to three targets (website, Play Store app, single-file HTML)
plus a small Express backend that proxies AI calls and holds accounts.

Also in the repo: **🏛️ Relic Run** (`public/relicrun/`, served at `/relicrun/`) — a
standalone retro Pac-Man-style arcade game, and the reason for the repo's name. See
[Relic Run](#relic-run-publicrelicrun) below.

> The **Reelmint** AI video studio used to live in `reelmint/`. It has been extracted
> into its own repository and the directory is gone; its history is in this repo's
> git log before the extraction commit. Ignore any older doc that still references it.

## Tech stack

- **Frontend:** React 18 + Vite 8, plain CSS (`src/styles.css`), `lucide-react` icons.
  No CSS framework, no state library — state is a single object in `App.jsx`.
- **Backend:** Node (ESM) + Express 4. No TypeScript in the app itself. `"type": "module"`.
- **Persistence:** file-based JSON store by default, Postgres (single JSONB row) when
  `DATABASE_URL` is set (`pg` is an optional dependency).
- **AI:** Anthropic Claude, called only from the server so the API key never reaches
  the browser. Client sends a `feature` hint; the server routes per feature to a model.
- **Mobile:** Capacitor wraps the `app` build for Google Play (`@capacitor/android`).
- **Tests:** Node's built-in `node:test` runner. No Jest/Vitest, no extra test runner
  deps (`nock` is the one test-only helper, used by the orchestrator integration test).
- **Node:** `engines` allows `^20.19.0 || >=22.12.0`; CI runs 22. Use 22 — the
  orchestrator integration test is TypeScript and relies on Node's built-in type
  stripping.

## Repository layout

```
src/
  App.jsx                 The app shell: state machine, effects, handlers, header,
                          modal overlays. Screens are extracted; keep it a shell.
  main.jsx                React entry; registers the service worker (prod web only).
  styles.css              All styling + CSS color tokens (:root variables).
  components/
    screens/              One component per screen (Home, Play, Solve, Mark, Dashboard,
                          Gate, SubjectMenu, Plans, Paywall, AskMochi, Badges,
                          Leaderboard, Shop, SettingsScreen, + shared ConsentCard).
                          All 14 are imported and rendered by App.jsx.
    GrownUps.jsx          Parent/teacher portal (lazy-loaded).
    Languages.jsx         Language practice (lazy-loaded).
    Courses.jsx           Higher-Ed courses (lazy-loaded).
    Calculator.jsx        Calculator tool (lazy-loaded).
    Mochi.jsx             The animated cat mascot (SVG).
    ErrorBoundary.jsx     Wraps the app and each lazy screen.
  data/
    bank.js               Offline question bank (>=15 questions per stage/subject).
    curriculum.js         TOPICS, PLANS, KS labels, tutorBrief, planForKs.
    languages.js          LANGUAGES list.
    courses.js            Higher-Ed course definitions.
  lib/                    Framework-free logic modules (see below).
  services/
    model-orchestrator/   Image-generation provider abstraction (TypeScript, see below).
server/
  index.js                Express app: AI proxy, TTS, auth, accounts, Stripe, email,
                          leaderboard, weekly-report cron. All routes under /api.
  auth.js                 Password hashing + signed-token auth (built-in dev auth).
  store.js                Persistence backend (file or Postgres); routes use load()/save().
  plans.js                PLAN_CATALOG — the single source of truth for what can be
                          bought and which access tracks it unlocks. Served at GET /api/plans.
  demo.js                 Keyless demo mode: feature-shaped sample content for every
                          AI route so a no-key deploy is fully clickable.
  email.js                Weekly parent emails (console/resend/sendgrid providers).
test/                     node:test suites: bank, plans, progress, worksheet,
                          server (auth/access control), routes (everything else)
tests/integration/        node:test integration suite for the model orchestrator (TS)
public/relicrun/          The standalone Relic Run arcade game (see below)
marketing/                Static legal/marketing pages served at clean URLs
.claude/
  commands/               15 optimization prompts, runnable as slash commands.
  hooks/session-start.sh  Installs deps on Claude Code web session start.
  settings.json           Harness settings.
.github/workflows/main-ci.yml   The only CI workflow.
TODO.md                   Status of the 15 optimization passes + verified end state.
```

### `src/lib/` modules (keep logic here, not in components)

`api.js` (AI client + typed `ApiError`), `progress.js` (local state load/save, streaks,
stars, rounds), `i18n.js` (`t`/`tf`/`useT`/`setUiLang`), `speech.js` (TTS/voice),
`recognition.js` (speech-to-text), `billing.js` (mock/RevenueCat/Stripe), `cloud.js`
(server account sync), `celebrate.js` (confetti), `mochiShop.js` (shop items),
`motivation.js`/`coach.js` (encouragement copy), `achievements.js` (badges),
`review.js` (spaced review), `trial.js` (free-trial state), `worksheet.js` (pure
printable-worksheet builder over the offline bank — zero AI cost, unit tested),
`examCache.js`, `reminders.js` (local notifications), `share.js`, `platform.js` (`isWeb`).

## Commands

```bash
npm install            # install deps (session-start hook does this on Claude Code web)
npm run dev            # Vite dev server (web mode) on :5173, proxies /api -> :8787
npm run server         # Express backend on :8787
npm start              # run web + api together (concurrently)
npm test               # node --test — the full suite (run this before committing)
npm run build          # web build  -> dist-web  (alias: build:web)
npm run build:app      # Capacitor build -> dist-app
npm run build:onefile  # single self-contained index.html -> dist-onefile
npm run preview        # preview the built dist-web
```

## Build modes (one codebase, three outputs)

Vite `--mode` selects the target (see `vite.config.js`):

- **`web`** → `dist-web` — the website; Stripe payments; registers the service worker.
- **`app`** → `dist-app` — assets for Capacitor to wrap into the Android app.
- **`onefile`** → `dist-onefile` — everything inlined into one `index.html` you can
  open or host anywhere (`vite-plugin-singlefile`).

Per-mode env comes from `.env.web` / `.env.app` / `.env.onefile`; secrets and local
config go in `.env` (copy from `.env.example`). `VITE_*` vars are build-time/client-safe;
everything else is server-only.

## Relic Run (`public/relicrun/`)

A **zero-dependency, zero-build** arcade game: three plain files (`index.html`,
`game.js`, `levels.js`) drawn to a `<canvas>`, served straight from `public/` at
`/relicrun/` and linked from the app's home screen. Five levels model real
archaeological sites; guards sweep entrance→exit while the player collects
historically accurate artifacts, each showing a museum-card fact.

It shares nothing with the React app — no imports in either direction, no build
step, no tests. Edit the three files directly and reload. Keep it dependency-free.

## Model orchestrator (`src/services/model-orchestrator/`)

The one piece of **TypeScript** in the codebase. `SDXLOrchestrator` implements the
`ModelOrchestrator` interface from `types.ts`: prompt in, `ModelResponse` out, via a
Stability-SDXL-compatible HTTP endpoint (`axios`). It tolerates three provider
response shapes (`artifacts[].base64`, `output[].url`/`url`, unknown raw body) and
falls back to a `mock://` URL when no `apiUrl` is configured. Config comes from
`SDXL_API_KEY` / `SDXL_API_URL` / `SDXL_MODEL`.

It is **not wired into the app or the server** — it's a standalone service module
with an integration test (`tests/integration/orchestrator.integration.test.ts`, which
stubs HTTP with `nock`). Node's built-in type stripping runs the `.ts` test directly
under `node --test`; there is no compile step, so keep the TypeScript to what
stripping supports (no `enum`, no parameter properties, no `namespace`).

## Conventions & rules

- **Never expose the Anthropic API key to the client.** All AI/TTS goes through the
  Express proxy (`/api/claude`, `/api/tts`). The browser calls `src/lib/api.js`, which
  hits `/api` (proxied in dev; `VITE_API_BASE` in prod).
- **No new dependencies without good reason.** The project deliberately avoids extra
  deps (tests use `node:test`, the rate limiter and store are hand-rolled).
  **Runtime dependencies must stay at 0 vulnerabilities** — CI fails on
  high/critical for `npm audit --omit=dev`, and that gate is the one to keep
  green. The full audit runs report-only because the remaining high advisories
  are all transitive under `@capacitor/cli` (Android build tooling) and need a
  Capacitor major bump to clear. `pg` and the Capacitor notification packages
  are intentionally *optional*.
- **`App.jsx` is the shell.** Add new UI as a screen component under
  `src/components/screens/` and wire it through the shell — don't grow `App.jsx` back
  into a monolith. Heavy/rare screens are `lazy()`-loaded; wrap risky screens in an
  `ErrorBoundary`.
- **Put logic in `src/lib/`,** presentation in components.
- **User-facing strings go through i18n** (`t()` / `tf()` from `src/lib/i18n.js`). The
  emailed progress report stays English by design (it's document formatting).
- **Accessibility matters** (audience is children): 44px minimum touch targets, focus
  management on screen change, WCAG 2.1 AA contrast. Color tokens live in `:root` in
  `src/styles.css` — normal text must clear 4.5:1, graphical/icon elements 3:1.
- **Errors must be recoverable and child-friendly.** Use the typed `ApiError`
  (`offline` / `timeout` / `network` / `rate-limited` / `server`); its `message` is
  always safe to show a learner.
- **Server storage is swappable** — route handlers only call `load()`/`save()`/helpers
  from `server/store.js`. Don't reach into a specific backend from a route.
- **Plans belong in `server/plans.js`.** A new tier maps onto the two existing access
  tracks (`junior`, `adult`), so nothing downstream changes. Don't hard-code plan ids
  or Stripe prices in routes.
- **Demo mode must stay believable.** Every AI feature has a keyless fallback in
  `server/demo.js` in the exact JSON shape the client parses. Add one whenever you add
  an AI feature, or a no-key deploy breaks.
- **Child-safety/privacy:** homework and scan photos live in component memory only
  (never persisted or synced). No third-party trackers. Account deletion cascades.
  Keep it that way.

### API hardening (already in place — don't regress it)

`server/index.js` carries a hand-rolled, dependency-free security layer:

- **Rate limits** — `aiLimit` (30 requests / 5 min per IP) on `/api/claude` and
  `/api/tts`; `authLimit` (10 / 15 min per IP) on signup and login.
- **CORS** locked to `CORS_ORIGIN` (comma-separated) in production.
- Model allow-list and a `max_tokens` cap on the AI proxy; security headers;
  8-character password minimum; a startup warning when `AUTH_SECRET` is unset.

## Testing & verification

- `npm test` runs `node --test` over both test directories — **~60 tests, all keyless**:
  `server` (auth, child access control, cascade deletes, rate limiting), `routes`
  (goals, classes, leaderboard, referrals, prefs, TTS, cron, admin, Stripe
  portal/webhook), `progress` (streaks/stars), `bank` (offline-bank integrity),
  `plans`, `worksheet`, and `tests/integration/orchestrator.integration.test.ts`.
  All must pass. **Every `/api` route has coverage — keep it that way when adding one.**
- `server.test.js` and `routes.test.js` each spawn **their own** server on their
  own port and temp store. That is deliberate: the auth endpoints are
  rate-limited per IP+path, so sharing a server would make the files interfere
  and the request budgets are counted per file.
- **The Stripe webhook must fail closed.** `verifyStripeSig` returns false when
  `STRIPE_WEBHOOK_SECRET` is unset (it used to return *true*, so any unsigned
  POST was processed — enough to grant yourself a plan by naming your own uid),
  and rejects signatures outside `STRIPE_WEBHOOK_TOLERANCE` (default 300s).
  `routes.test.js` asserts both; don't relax them for local convenience.
- For UI/behavior changes, verify in a headless browser (the app must render, navigate,
  and complete an offline quiz round) — not just tests.
- The Postgres path can only be syntax-checked in this sandbox (no Postgres/Docker);
  exercise it against a real `DATABASE_URL` before relying on it.

## CI

`.github/workflows/main-ci.yml` ("Main App CI") is the only workflow:
`npm ci` → `npm audit --omit=dev --audit-level=high` → `npm audit || true`
(report-only) → `npm test` → `node --check server/*.js` → build web/app/onefile →
demo-mode API smoke test.

Match CI locally before pushing: tests green, runtime audit clean, all three builds
succeed.

## Git workflow

- Default branch is `main`. Do work on a feature branch and push with
  `git push -u origin <branch>`; retry network failures with exponential backoff.
- **Do not open a pull request unless explicitly asked.**
- End commit messages with the `Co-Authored-By:` / `Claude-Session:` trailers the
  harness provides. Do not put the model identifier in commits, code, or PRs.
- If a designated branch's PR has already merged, restart the branch from the latest
  `main` for follow-up work rather than stacking onto merged history.

## Where to look first

- Adding/changing a screen or the app flow → `src/App.jsx` + `src/components/screens/`.
- Question content → `src/data/bank.js` (offline) and `src/data/curriculum.js`.
- AI behavior → `src/lib/api.js` (client) and `server/index.js` (proxy + model routing),
  with the keyless fallbacks in `server/demo.js`.
- Plans, pricing, entitlements → `server/plans.js`.
- Accounts / auth / Stripe / email → `server/index.js`, `server/auth.js`,
  `server/store.js`, `server/email.js`.
- The arcade game → `public/relicrun/`.
- Config / secrets / env → `.env.example` (documents every variable) and the
  per-mode `.env.web` / `.env.app` / `.env.onefile`.
- Current optimization status and remaining follow-ups → `TODO.md`.

**Keep this file honest** — update it in the same change as any structural change
(new module, new command, schema change, tooling swap).
