# ◉ Reelmint

**Mint videos, images & copy from a single prompt.**

Reelmint is a self-contained AI content studio. Type or **speak** an idea and it
writes the script, designs every frame, voices it, and exports a ready-to-post
video — short or long. Keep editing just by telling it what to change.

It's a single Node service (Express API + static web app) with **zero build
step**, so it deploys to Render in minutes.

---

## Features

| | |
|---|---|
| 🎬 **Prompt → video** | One idea → a fully storyboarded, voiced video (short or long-form). Exports a real `.webm` in the browser. |
| 🪄 **Voice & text AI editor** | Say or type "make scene 2 funnier" — the storyboard rewrites live. Voice input via the Web Speech API. |
| 🧪 **Hook Lab** | Generate a spread of scroll-stopping hook + thumbnail variants to A/B test before you film. *(Creator)* |
| 🗓 **Series Planner** | Turn one idea into a multi-day posting calendar so you never run out of content. *(Studio)* |
| 🎨 **Brand Kit** | Lock a brand color + handle that's baked into every render and replaces the watermark. *(Creator)* |
| 📝 **Subtitle export** | Download timed `.srt` captions that match the exported video. *(Creator)* |
| 🖼 **Instant images** | Mint posters, quote cards and thumbnails as downloadable PNGs ("Smart Slides"). Plug in any image API to swap in photoreal generation. |
| 📷 **Scan & repurpose** | Upload a screenshot, photo or doc — Claude vision reads it and turns it into content. |
| ✂️ **Long-form → clips** | Paste a transcript, get the most clip-worthy viral moments. |
| 👤 **Accounts + credits** | Email/password sign-in, with server-enforced monthly credits per plan (Free 5 · Creator 100 · Studio unlimited). |
| 💸 **Live Stripe billing** | Real Stripe Checkout + webhook that upgrades the user's plan automatically. Free-tier watermark included. |

## How the AI works

All generation runs through the **Anthropic API** with **per-feature model
routing**: a quality model (`AI_MODEL`, default `claude-opus-4-8`) handles
storyboards, edits, vision and image specs, while a fast model (`AI_MODEL_FAST`,
default `claude-haiku-4-5`) handles high-volume, low-stakes copy like captions
and Hook Lab variants — cheaper and quicker without hurting the headline output.

If `ANTHROPIC_API_KEY` is **not** set, Reelmint runs in **demo mode** — every
screen is still clickable end-to-end with **believable, hand-authored sample
content** (real storyboards, hooks, series plans and captions — never lorem), so
the studio demos convincingly and you can deploy first and add the key later.

Video and image *rendering* happen entirely client-side (Canvas + MediaRecorder)
with cinematic touches (gradient glow, vignette, film grain, drop-shadowed
captions, a scene progress bar and your brand mark), so there's no heavy server
cost — it runs comfortably on Render's free tier.

---

## Run locally

```bash
cd reelmint
npm install
cp .env.example .env        # then paste your ANTHROPIC_API_KEY (optional)
npm start                   # http://localhost:3000
```

## Deploy to Render

**Option A — Blueprint (recommended).** This repo ships `reelmint/render.yaml`.

1. Push to GitHub.
2. Render → **New → Blueprint** → pick this repo.
3. Render reads `reelmint/render.yaml` and creates the service.
4. Add `ANTHROPIC_API_KEY` in the dashboard (marked secret).

**Option B — Manual web service.**

- New → **Web Service** → connect the repo.
- **Root Directory:** `reelmint`
- **Build:** `npm install`
- **Start:** `npm start`
- **Health check path:** `/api/health`
- Add env var `ANTHROPIC_API_KEY`.

The server binds to `process.env.PORT` (Render sets it automatically).

---

## Accounts, credits & billing

- **Accounts** — email/password, hashed with scrypt, signed login tokens (no external auth service).
- **Storage** — `server/store.js` has two interchangeable backends behind one async API:
  - **Postgres** (durable, multi-instance) — used automatically when `DATABASE_URL` is set. The table is created on boot; users are stored as JSONB. SSL is enabled by default for hosted databases (set `PGSSL=disable` for a local DB).
  - **JSON file** (local/demo) — used when `DATABASE_URL` is absent, written to `DATA_DIR`.
  The Render blueprint provisions a free Postgres and wires `DATABASE_URL` automatically, so accounts and billing survive restarts and redeploys.
- **Credits** — each plan has a monthly allowance (Free 5 · Creator 100 · Studio unlimited). Generating a storyboard spends 1 credit; the limit is enforced **server-side**. Anonymous visitors can still try the studio (no hard gate) so the demo stays open.
- **Stripe** — set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_CREATOR`, `STRIPE_PRICE_STUDIO`, and `STRIPE_WEBHOOK_SECRET`. The pricing buttons open a real Checkout session; the webhook (`/api/billing/webhook`, signature-verified) upgrades the plan on success and downgrades on cancellation. Point your Stripe webhook at `https://<your-app>/api/billing/webhook` for `checkout.session.completed`, `customer.subscription.created`, and `customer.subscription.deleted`.

## Photoreal images

By default the **Image** tab renders "Smart Slide" posters (free, no external call). To get photoreal generation, wire a provider:

- **OpenAI Images** — set `IMAGE_PROVIDER=openai` + `OPENAI_API_KEY` (optionally `IMAGE_MODEL`, default `gpt-image-1`).
- **Any custom endpoint** — set `IMAGE_API_URL` (+ optional `IMAGE_API_KEY`); it receives `{prompt,width,height}` and should return `{url}` or `{b64}`.

If a provider call fails it falls back to Smart Slides automatically.

## Environment variables

| Var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Unlocks real AI. Blank → demo mode. |
| `AI_MODEL` | Quality model id (default `claude-opus-4-8`) — storyboards, edits, vision, image specs. |
| `AI_MODEL_FAST` | Fast model id (default `claude-haiku-4-5`) — captions, Hook Lab. |
| `PORT` | Port (Render sets this). |
| `AUTH_SECRET` | Signs login tokens. **Required in production.** |
| `DATABASE_URL` | Postgres connection string. Set → Postgres backend; blank → JSON file. |
| `PGSSL` | `disable` for a local Postgres without SSL (default: SSL on when `DATABASE_URL` is set). |
| `DATA_DIR` | Where the JSON store is written when `DATABASE_URL` is blank (default `./.data`). |
| `REELMINT_NO_WATERMARK` | `1` removes the free-tier watermark globally. |
| `IMAGE_PROVIDER` / `OPENAI_API_KEY` / `IMAGE_MODEL` | OpenAI image generation. |
| `IMAGE_API_URL` / `IMAGE_API_KEY` | Custom image generator. |
| `STRIPE_SECRET_KEY` | Stripe API key. |
| `STRIPE_PRICE_CREATOR` / `STRIPE_PRICE_STUDIO` | Stripe price IDs per plan. |
| `STRIPE_WEBHOOK_SECRET` | Verifies incoming Stripe webhooks. |

## API

| Endpoint | Body | Returns |
|---|---|---|
| `GET /api/health` | — | `{ ok, enabled, model }` |
| `GET /api/config` | — | status + plans + watermark + current user |
| `POST /api/auth/signup` · `/api/auth/login` | `{email, password}` | `{token, user}` |
| `GET /api/me` | — (Bearer token) | `{user}` |
| `POST /api/billing/checkout` | `{plan}` (Bearer token) | `{url}` (Stripe Checkout) |
| `POST /api/billing/webhook` | Stripe event | upgrades/downgrades plan |
| `POST /api/script` | `{topic, platform, tone, durationSec, format}` | storyboard (costs 1 credit) |
| `POST /api/assistant` | `{instruction, storyboard}` | `{reply, storyboard}` |
| `POST /api/hooks` | `{topic, count}` | `{variants:[{angle,hook,thumbnail}]}` (costs 1 credit) |
| `POST /api/series` | `{topic, days}` | `{plan:[{day,theme,idea,format,cta}]}` (costs 1 credit) |
| `POST /api/image` | `{prompt, style}` | `{type:"design", design}` or `{type:"image", url}` |
| `POST /api/scan` | `{base64, mediaType, instruction}` | `{text}` |
| `POST /api/repurpose` | `{transcript, count}` | `{clips:[…]}` |
| `POST /api/captions` | `{topic, platform, count}` | `{text}` (fast model) |

---

## Project layout

```
reelmint/
├── server/
│   ├── index.js     # Express app + API routes
│   ├── ai.js        # Anthropic integration + per-feature model routing (+ demo)
│   ├── content.js   # believable demo library + pure helpers (storyboard/SRT) — unit-tested
│   ├── auth.js      # accounts, tokens, monthly credit tracking
│   ├── billing.js   # Stripe Checkout + webhook (REST, no SDK)
│   ├── images.js    # photoreal image providers (+ fallback)
│   └── store.js     # persistence — Postgres or JSON file (one async API)
├── public/
│   ├── index.html   # landing + studio (7 tools) + auth modal
│   ├── styles.css
│   └── app.js       # studio logic, canvas render, video/SRT export, brand kit, accounts
├── test/
│   └── content.test.js  # node:test unit tests for the content engine
├── render.yaml      # Render Blueprint
├── package.json
└── .env.example
```

## Tests

```bash
cd reelmint
npm test        # node:test — unit tests for the content engine (no key needed)
```

CI (`.github/workflows/ci.yml`) runs the tests, syntax-checks every JS file, and
smoke-tests the server in demo mode (health, signup, script, hooks, series).

## Notes

- **Video export** uses `MediaRecorder` (`.webm`) — best in Chromium/Edge/Firefox.
- **Voice input/output** uses the Web Speech API (best in Chrome/Edge).
- With `DATABASE_URL` set the app uses Postgres, so accounts/credits/billing
  persist across restarts and scale across instances. Without it, it uses a
  local JSON file (handy for local dev and the zero-config demo).
