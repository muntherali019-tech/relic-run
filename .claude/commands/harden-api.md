---
description: Security-harden the Express API (server/index.js) without adding dependencies
---

Audit and harden the Express backend in server/index.js and server/auth.js. This server proxies paid third-party APIs (Anthropic, ElevenLabs) and holds children's education data, so treat every endpoint as internet-facing.

Check each of these and fix what is missing, using only Node built-ins (no new npm deps):

1. Rate limiting on cost-bearing routes (/api/claude, /api/tts) and brute-forceable routes (/api/auth/login, /api/auth/signup).
2. Clamped, allowlisted client-controlled parameters on the AI proxy: model must come from an allowlist, max_tokens must be capped.
3. Security headers on every response: X-Content-Type-Options, X-Frame-Options, Referrer-Policy.
4. CORS restricted to configured origins in production (CORS_ORIGIN env var).
5. Password policy on signup (minimum 8 characters) and constant-time comparisons in auth (already scrypt + timingSafeEqual — verify, don't rewrite).
6. Startup warnings when production runs with insecure defaults (missing AUTH_SECRET, missing STRIPE_WEBHOOK_SECRET while Stripe is configured).
7. Verify the Stripe webhook still reads the raw body before express.json and that signature verification uses timingSafeEqual.

After changes: `node --check` every server file, boot the server on a spare port, and prove each protection works with curl (429 after the limit, 400 on a short password, headers present). Report each check as pass/fixed/fail with evidence.
