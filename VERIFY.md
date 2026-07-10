# Verifying Education Academy

## Verified live in Claude Code ✅ (2026-07-10)
Full end-to-end run, not just static checks:
- **`npm install`** — 242 packages, **0 vulnerabilities** (`npm audit`).
- **`npm test`** — **26/26 passing** (node:test): server API over real HTTP (auth, access control, cascade deletes, rate limiter), progress/streak logic, offline-bank integrity.
- **All three production builds pass** — `build:web`, `build:app`, `build:onefile`.
- **PWA assets ship in the bundle** — `manifest.webmanifest`, `sw.js`, favicon and all icons present in `dist-web/`.
- **Server boots** — `/api/health` returns `{ok:true}`; signup returns HTTP 200 in demo mode (no key required to run).
- **Static checks still green** — JS syntax (`node --check`), JSX/React transpile, JSON validity, well-formed HTML, no undefined components.

## Still requires your own credentials/services to exercise
- The **AI calls** need `ANTHROPIC_API_KEY` set (app runs without it; AI features error until added).
- **Stripe** billing needs your live keys + price IDs + webhook secret.
- **Postgres** durability needs a real `DATABASE_URL` (falls back to the JSON file store otherwise).
- **Push notifications** on the Capacitor build.

---

## Verify it in Claude Code (1 step)
I can't push to Claude Code from here, but you can hand it the project in seconds:

1. **Unzip** `education-academy.zip` to a folder.
2. Open that folder in a terminal and start Claude Code:
   ```
   cd education-academy
   claude
   ```
   (Claude Code is the CLI/desktop coding agent — install per docs.claude.com if needed.)
3. Paste this prompt:
   > Review this Vite + React + Express project for bugs and dead code. Then run `npm install`, `npm run build:web`, and `npm run build:app`, and report any errors. Don't change anything until I approve.

Claude Code will install, build, and tell you about any issues — and can fix them in place.

## Or verify locally by hand
```
npm install
npm run dev            # http://localhost:5173 (mock billing, instant unlock — great for a quick look)
npm run build:web      # production website bundle  -> dist-web
npm run build:app      # Capacitor/Play bundle       -> dist-app
npm run build:onefile  # single self-contained file  -> dist-onefile/index.html
```
First run only, if you use them:
```
npm install -D vite-plugin-singlefile          # for build:onefile
npm install pg                                  # only if you set DATABASE_URL (Postgres)
npm install @capacitor/local-notifications      # only for app reminders
```

## Expected "it's working" checks
- `npm run dev` shows the home screen with Mochi, the daily strip (badges / shop / leaderboard), and the Daily Challenge tile.
- A brand-new profile is dropped straight into the first Daily Challenge (the "instant win").
- The Mochi shop has Colours, Hats and Extras (incl. **Streak freeze**).
- Ask Mochi and Smart Practice appear on the home screen.
- AI features (quizzes, Ask Mochi, scan/mark) need `ANTHROPIC_API_KEY` set for the server (`.env`).

If a build error mentions a missing optional package, install it from the list above and re-run.
