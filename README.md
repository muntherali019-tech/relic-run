# 🐱 Education Academy

A cat-themed learning game for UK learners, hosted by **Mochi** the ginger cat. Covers four stages — **Key Stage 1, Key Stage 2, Key Stage 3, and Higher Education** — with 15-question puzzle rounds, AI homework photo-marking, a **scan-and-solve** helper, a subscription paywall, **per-key-stage inspirational theming**, **accounts with cross-device sync**, and a **parent & teacher portal** with separate goal/task tracks and AI-assisted goal suggestions.

Built with **Vite + React**, a small **Express** backend (so your API key never reaches the browser, plus accounts, sync, classes and goals), and **Capacitor** for an Android build. A standalone marketing site lives in `marketing/index.html`.

Also on board: **🏛️ Relic Run** (`public/relicrun/`, served at `/relicrun/`) — a retro Pac-Man-style chase through five real archaeological sites. Guards sweep each level from entrance to exit while you collect historically accurate artifacts (each pickup shows a museum-card fact). Linked from the app's home screen.

> **Reelmint** (the AI video studio) has been extracted into its own standalone project — its full history remains in this repo's git log prior to the extraction commit.

> **Shipping to Google Play?** Read **`DEPLOYMENT.md`** — it's the ordered, step-by-step guide, marking what's done in code vs what needs your own accounts, keys and hosting.

---

## What's inside

| Feature | Notes |
|---|---|
| 4 stages | KS1, KS2, KS3 (maths/English/science), Higher Education (maths/English/science) |
| 15-question rounds | Fresh AI-generated questions, with a large offline fallback bank (12–14 per subject) |
| Scan & Solve | Photograph or type a question → answer + step-by-step working in real time |
| Mark my homework | Photograph completed work → friendly per-question marking |
| Subscriptions | Junior **£3/mo** (KS1 & KS2) · Adult **£5/mo** (KS3 & Higher Education) |
| Parent/teacher dashboard | PIN-gated; accuracy per stage/subject, "needs practice" topics, recent activity |
| Languages | 8 languages — AI‑teacher lessons with tap‑to‑hear pronunciation, plus **quiz, listening and speaking practice** |
| Advanced courses | Exam‑prep & revision for **Gas, Electrical, Renewable engineering and Business management** — AI trainer + exam‑style practice (a revision aid, **not** accredited certification) |
| Free trial | First **72 hours** unlock everything; then Junior £3 / Adult £5 per month |
| Mochi's voice | Speaks questions, feedback and lessons aloud with an animated mouth — free **on‑device** voice, or a **premium cloud voice** (ElevenLabs) via `VITE_TTS=cloud` |
| Accessibility | Screen‑reader labels, live‑region announcements, visible focus rings, and a "read aloud" mode for blind & early readers |
| Progress | Saved on-device via `localStorage` (persists between visits) |

---

## 1. Prerequisites

- **Node.js 20.19+ or 22.12+** (`node -v` to check — required by Vite 8; Node 22 LTS recommended)
- An **Anthropic API key** — create one at <https://console.anthropic.com>

## 2. Install

```bash
npm install
```

## 3. Add your API key

```bash
cp .env.example .env
```

Then open `.env` and paste your key:

```
ANTHROPIC_API_KEY=sk-ant-...
PORT=8787
```

> The key lives only in the backend (`server/index.js`). The browser calls `/api/claude`, which the server forwards to Anthropic. **Never put the key in frontend code.**

## 4. Run it locally

```bash
npm start
```

This starts both the web app and the API together. Open **http://localhost:5173**.

(If you prefer two terminals: `npm run server` and `npm run dev` separately.)

---

## How it works

```
Browser (React)  ──POST /api/claude──►  Express server  ──x-api-key──►  Anthropic API
   src/App.jsx                          server/index.js
```

- `src/data/curriculum.js` — stages, subjects, topics, plans, and the age-tuned tutor prompts.
- `src/data/bank.js` — offline fallback questions used when there's no internet.
- `src/lib/api.js` — `generateQuestions`, `markHomework`, `solveQuestion` (all call the backend).
- `src/lib/progress.js` — localStorage persistence + the stats the dashboard reads.
- The model is set in `server/index.js` (default `claude-sonnet-4-6`) — change it there if you like.

The dashboard is reached via the chart icon (top-right) or the "Grown-ups" link, behind a simple multiplication gate to keep young children out.

---

## Build the Android app (Capacitor)

```bash
npm run build          # produces dist/
npm run cap:add        # one-time: adds the android/ project
npm run cap:sync       # rebuilds + copies web assets into android/
npm run cap:open       # opens Android Studio to run / sign / export
```

You'll need **Android Studio** and a JDK installed. Run on an emulator or device from Android Studio.

### ⚠️ Important for the mobile/production build

The dev setup proxies `/api` to `localhost:8787`, which **won't exist on a phone**. For a real release you must:

1. **Deploy the backend** (`server/index.js`) somewhere with your key set as an env var — e.g. Render, Railway, Fly.io, a VPS, or a serverless function.
2. Point the app at it by setting an env var before building:

   ```bash
   VITE_API_BASE=https://your-backend.example.com/api npm run build
   ```

   (`src/lib/api.js` already reads `VITE_API_BASE`, falling back to `/api` in dev.)

---

## Before you ship to the Play Store (children's app checklist)

This app is aimed partly at children, so it falls under stricter rules. Treat these as starting points, not legal advice:

- **Play "Designed for Families" / target-audience declaration** — set the target age groups in the Play Console; this triggers extra policy requirements.
- **COPPA (US) and UK GDPR / Age-Appropriate Design Code ("Children's Code")** — minimise data collection, especially for under-13s/under-18s.
- **Privacy policy** — required, and must clearly state what's collected. Photos sent for marking/solving are processed by the Anthropic API; disclose this and avoid storing images longer than needed.
- **No behavioural ads / restricted SDKs** for child audiences.
- **Real payments** — the in-app checkout here is a **demo**. App stores require **Google Play Billing** for digital subscriptions (or Stripe for web). Wire this up before charging.
- **Data handling** — consider keeping homework photos in memory only (don't persist them), and add a clear consent step for camera use.

---

## Honest limitations (current prototype)

- **Checkout is a demo** — subscribing just flips a local flag; no money moves. Replace with Play Billing / Stripe.
- **AI features need internet** — quizzes fall back to the offline bank, but marking and solving need a connection (and your API key).
- **Progress is per-device** — `localStorage` only. Add accounts + a server to sync across devices.
- **AI can make mistakes** — the app reminds learners that a grown-up should check important answers.

---

Made with 🐾 for curious learners.

## Quality & polish
- **Whole-app localisation** — UI text follows Mochi's language via a batched, on-device-cached translation layer (`src/lib/i18n.js`); Settings has a **Reset translations** action. Quizzes, solve/mark feedback and courses already generate in the chosen language.
- **Crash safety** — a top-level error boundary shows a friendly, recoverable screen instead of a blank page.
- **Installable** — web manifest + icon + Apple/Android meta; **safe-area insets** for notched phones; native **splash/status-bar** config for the Android build.
- **Accessibility & reach** — respects `prefers-reduced-motion`; **right-to-left layout** for Arabic; spoken narration; focus-visible styles; large tap targets.
- **Offline awareness** — an offline banner, and on-device caching of course questions.
- **Worldwide** — first-launch language picker (auto-suggests the device language), and local-currency pricing surfaced from Google Play.

> Before store submission, add PNG app icons (192/512 and an adaptive icon) and have a native speaker proof the cached translations (saved as editable JSON on device). Full UI-string coverage is in place for the main screens; the grown-ups portal and language module still have a few English strings.

## Two separate builds (web vs mobile app)
The web app and the Android app are **built separately from this one codebase**, to different output folders and with different payment paths:

| | Command | Output | Payments |
|---|---|---|---|
| **Web** (your website) | `npm run build:web` | `dist-web/` | Stripe Checkout |
| **Mobile app** (Google Play) | `npm run build:app` | `dist-app/` | Google Play Billing (RevenueCat) |

- `npm run dev` runs the web build locally with instant "mock" unlock for testing.
- Mobile packaging: `npm run cap:sync` (builds the app bundle into `dist-app` and syncs Capacitor), then `npm run cap:open`.
- The active platform is set by `VITE_PLATFORM` via `.env.web` / `.env.app`; `src/lib/platform.js` exposes `isApp()` / `isWeb()`.
- Web payments need Stripe env vars on the server (see `.env.example` and `PRICING.md`); the app store handles per-country local currency automatically.

## Deploying
- **Website (with API + payments) — the easy path:** see **DEPLOY_WEBSITE.md** (written in plain steps). It uses `render.yaml` to run one service that builds `dist-web` and serves it together with the API, so you only manage one URL.
- **Google Play app:** see **DEPLOYMENT.md**. Pricing/currency for both: **PRICING.md**.

## One self-contained file (one app, one file)
The whole app can be emitted as a single HTML file:
```
npm install -D vite-plugin-singlefile
npm run build:onefile        # -> dist-onefile/index.html
```
`dist-onefile/index.html` bundles all JS/CSS inline — open it from disk or drop it on any static host. It uses demo (mock) billing; set `VITE_API_BASE` in `.env.onefile` to your deployed API to switch on the AI tutor. The full **website** (with accounts, Stripe and the API) remains the separate `npm run build:web` + server deploy described in DEPLOY_WEBSITE.md.
