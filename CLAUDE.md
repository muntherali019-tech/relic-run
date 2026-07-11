# CLAUDE.md

Guidance for AI assistants (Claude Code and others) working in this repository.

## What this is

**Whisker Academy** (package name `whisker-academy`; the repo is `relic-run`) is a
cat-themed educational game for UK KS1–KS3 and Higher Education learners. Mochi, the
cat mascot, guides children through quizzes; the app also offers AI homework marking,
a scan-and-solve helper, a spoken AI tutor, language practice, and a grown-ups portal
for parents/teachers. Everything is built from **one React codebase** that ships to
three targets (website, Play Store app, single-file HTML) plus a small Express backend
that proxies AI calls and holds accounts.

There is a **separate, unrelated subproject** in `reelmint/` — an AI video/image studio
(Express + zero-build static app). It has its own `package.json`, README, CI workflow,
and deploy config. Treat it as a distinct project; do not mix its dependencies or
tooling with the main app.

## Tech stack

- **Frontend:** React 18 + Vite 8, plain CSS (`src/styles.css`), `lucide-react` icons.
  No CSS framework, no state library — state is a single object in `App.jsx`.
- **Backend:** Node (ESM) + Express 4. No TypeScript anywhere. `"type": "module"`.
- **Persistence:** file-based JSON store by default, Postgres (single JSONB row) when
  `DATABASE_URL` is set (`pg` is an optional dependency).
- **AI:** Anthropic Claude, called only from the server so the API key never reaches
  the browser. Client sends a `feature` hint; the server routes per feature to a model.
- **Mobile:** Capacitor wraps the `app` build for Google Play (`@capacitor/android`).
- **Tests:** Node's built-in `node:test` runner. No Jest/Vitest, no extra test deps.
- **Node:** use Node 22 (CI uses 22 for the main app, 20 for reelmint).

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
server/
  index.js                Express app: AI proxy, TTS, auth, accounts, Stripe, email,
                          leaderboard, weekly-report cron. All routes under /api.
  auth.js                 Password hashing + signed-token auth (built-in dev auth).
  store.js                Persistence backend (file or Postgres); routes use load()/save().
  email.js                Weekly parent emails (console/resend/sendgrid providers).
test/                     node:test suites: bank.test.js, progress.test.js, server.test.js
reelmint/                 Separate AI studio subproject (own package.json + CI).
.claude/
  commands/               15 optimization prompts, runnable as slash commands.
  hooks/session-start.sh  Installs deps on Claude Code web session start.
  settings.json           Harness settings.
.github/workflows/        ci.yml (reelmint), main-ci.yml (this app).
TODO.md                   Status of the 15 optimization passes + verified end state.
```

### `src/lib/` modules (keep logic here, not in components)

`api.js` (AI client + typed `ApiError`), `progress.js` (local state load/save, streaks,
stars, rounds), `i18n.js` (`t`/`tf`/`useT`/`setUiLang`), `speech.js` (TTS/voice),
`recognition.js` (speech-to-text), `billing.js` (mock/RevenueCat/Stripe), `cloud.js`
(server account sync), `celebrate.js` (confetti), `mochiShop.js` (shop items),
`motivation.js`/`coach.js` (encouragement copy), `achievements.js` (badges),
`review.js` (spaced review), `trial.js` (free-trial state), `examCache.js`,
`reminders.js` (local notifications), `share.js`, `platform.js` (`isWeb`).

## Commands

```bash
npm install            # install deps (session-start hook does this on Claude web)
npm run dev            # Vite dev server (web mode) on :5173, proxies /api -> :8787
npm run server         # Express backend on :8787
npm start              # run web + api together (concurrently)
npm test               # node:test — the full suite (run this before committing)
npm run build          # web build  -> dist-web  (alias: build:web)
npm run build:app      # Capacitor build -> dist-app
npm run build:onefile  # single self-contained index.html -> dist-onefile
npm run preview        # preview the built dist-web
```

Reelmint (from `reelmint/`): `npm install` then `npm start` (or `npm run dev`). No build step.

## Build modes (one codebase, three outputs)

Vite `--mode` selects the target (see `vite.config.js`):

- **`web`** → `dist-web` — the website; Stripe payments; registers the service worker.
- **`app`** → `dist-app` — assets for Capacitor to wrap into the Android app.
- **`onefile`** → `dist-onefile` — everything inlined into one `index.html` you can
  open or host anywhere (`vite-plugin-singlefile`).

Per-mode env comes from `.env.web` / `.env.app` / `.env.onefile`; secrets and local
config go in `.env` (copy from `.env.example`). `VITE_*` vars are build-time/client-safe;
everything else is server-only.

## Conventions & rules

- **Never expose the Anthropic API key to the client.** All AI/TTS goes through the
  Express proxy (`/api/claude`, `/api/tts`). The browser calls `src/lib/api.js`, which
  hits `/api` (proxied in dev; `VITE_API_BASE` in prod).
- **No new dependencies without good reason.** The project deliberately avoids extra
  deps (tests use `node:test`, the rate limiter and store are hand-rolled). `npm audit`
  must stay at 0 vulnerabilities; CI fails on high/critical. `pg` and Capacitor
  notification packages are intentionally *optional*.
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
- **Child-safety/privacy:** homework and scan photos live in component memory only
  (never persisted or synced). No third-party trackers. Account deletion cascades.
  Keep it that way.

## Testing & verification

- `npm test` runs three suites: server API over real HTTP (auth, access control,
  cascade deletes, rate limiting), progress/streak logic, and offline-bank integrity
  (every bank has enough non-repeating questions). All must pass.
- For UI/behavior changes, verify in a headless browser (the app must render, navigate,
  and complete an offline quiz round) — not just tests.
- The Postgres path can only be syntax-checked in this sandbox (no Postgres/Docker);
  exercise it against a real `DATABASE_URL` before relying on it.

## CI

- `.github/workflows/main-ci.yml` (this app): `npm ci` → `npm audit --audit-level=high`
  → `npm test` → `node --check server/*.js` → build web/app/onefile → API smoke test.
- `.github/workflows/ci.yml` (reelmint, scoped to `reelmint/`).

Match CI locally before pushing: tests green, audit clean, all three builds succeed.

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
- AI behavior → `src/lib/api.js` (client) and `server/index.js` (proxy + model routing).
- Accounts / auth / Stripe / email → `server/index.js`, `server/auth.js`,
  `server/store.js`, `server/email.js`.
- Config / secrets / env → `.env.example` (documents every variable) and the
  per-mode `.env.web` / `.env.app` / `.env.onefile`.
- Current optimization status and remaining follow-ups → `TODO.md`.
