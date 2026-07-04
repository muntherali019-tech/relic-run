---
description: COPPA / UK Children's Code compliance review of data flows
---

This app targets children (KS1–KS3), so it falls under COPPA (US) and the UK Age-Appropriate Design Code. Review the actual data flows in code — not just the policy documents — and fix what code can fix. This is an engineering review, not legal advice; flag legal questions for a human.

1. Map every place child data leaves the device: /api/claude (homework photos, questions), /api/tts, cloud sync (server/store.js), weekly emails (server/email.js), Stripe metadata. Confirm each is disclosed in marketing/privacy.html; update the policy text where the code and the policy disagree.
2. Verify homework/scan photos are never persisted server-side and are held in memory only in the client (check src/lib/api.js and the upload paths); fix if they leak into localStorage or the store.
3. Data minimisation: child records should hold only name/key-stage/progress. Flag anything more.
4. Deletion rights: verify DELETE /api/children/:id and DELETE /api/me really remove all associated goals, class links, and state — write a quick test proving it.
5. Consent gates: camera use and account creation should have grown-up gates; the multiplication gate exists — check it guards every parent-portal entry point.
6. No third-party trackers/ads in index.html or marketing pages.

Deliver a table: data flow → destination → disclosed? → minimised? → fixed/flagged.
