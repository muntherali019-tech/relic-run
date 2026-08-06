# Google Play Compliance — Education Academy

Because Education Academy is for children, it must meet Google Play's **Families / "Designed for Families"** policy on top of the normal rules. This file maps each requirement to its current status.

- **[CODE ✓]** — handled in the app code.
- **[YOU]** — needs your Play Console settings, hosting, legal text, or money.

| # | Requirement | Status | Where |
|---|---|---|---|
| 1 | **No third-party ads** in a child app | [CODE ✓] | App ships with no ad SDKs. Declare "no ads" in Play Console. |
| 2 | **No third-party analytics / tracking SDKs** in the child experience | [CODE ✓] | None included. Keep it that way. |
| 3 | **Parental gate before purchases** | [CODE ✓] | Buying a plan now requires passing the grown-up gate (`requestPurchase` → gate → `confirmPurchase`). |
| 4 | **Parental gate before links out** (e.g. privacy link in grown-up area) | [CODE ✓] | External links live in the grown-up/portal area. |
| 5 | **Disclosure & consent before sending a photo to AI** | [CODE ✓] | One-time consent card on the scan/mark screens. |
| 5b | **Grown-up gate before the microphone** (speaking practice) | [CODE ✓] | First mic use requires passing a parental check; remembered afterwards. |
| 6 | **Account creation by adults; child data managed by a grown-up** | [CODE ✓] | Accounts (parent/teacher) are created in the portal; child profiles are added by the adult. |
| 7 | **In-app account & data deletion** | [CODE ✓] | Portal → "Delete my account & data"; parents can also remove a single child. |
| 8 | **Web URL for deletion requests** | [YOU] | Publish a deletion request page and put its URL in your Play listing + privacy policy. |
| 9 | **Privacy policy (required)** | [CODE ✓ template] / [YOU host] | Use `marketing/privacy.html`; fill placeholders, host it, set `VITE_PRIVACY_URL`, and add the URL in Play Console. |
| 10 | **Use Google Play Billing for digital subscriptions** | [CODE ✓ RevenueCat] / [YOU] | `src/lib/billing.js` implements RevenueCat (purchase/restore/entitlements). Install the plugin, set `VITE_BILLING=revenuecat` + `VITE_REVENUECAT_KEY`, create products, map entitlements — see DEPLOYMENT.md. Mock must be off for release. |
| 11 | **Data safety form** completed honestly | [YOU] | Declare: collects email + child name + progress; no ad/analytics SDKs; data encrypted in transit; deletion available. |
| 11b | **Breached-password check calls a third party** (adults only) | [CODE ✓] | Signup checks Have I Been Pwned when `PWNED_PASSWORDS` is set (`render.yaml` turns it on). Server-to-server, on the **adult** portal signup only — never in the child experience, and not an ads or analytics SDK. k-anonymity means only the first 5 characters of the password's SHA-1 leave the server: no password, email or identifier is transmitted, and HIBP stores nothing for us. Mention it if your data-safety form asks about sub-processors. |
| 12 | **Content rating (IARC) questionnaire** | [YOU] | Complete in Play Console; educational kids content rates low. |
| 13 | **Target audience = children → Families program** | [YOU] | Set target age groups; this triggers Families requirements. |
| 14 | **Data minimisation & secure handling** (COPPA / UK Children's Code) | [CODE ✓ design] / [YOU verify] | We collect little; photos aren't stored. Replace the dev JSON store + HMAC auth with a managed DB/auth for production (DEPLOYMENT.md step 2). |
| 15 | **Permissions limited & explained** (camera only when used) | [CODE ✓] | Camera is used only on the scan/mark screens, behind consent. |
| 16 | **US state age-assurance signals** (Utah/Texas/Louisiana, 2026) | [YOU] | Handle Play's age-signal data for users in applicable states as the Console prompts. |
| 17 | **No misleading claims** — courses are revision aids, not accreditation | [CODE ✓ disclaimer] | The Courses page states it's exam‑prep, not certification. Don't market it as an accredited qualification, and add a free‑trial terms line if you run store trials. |

## What to do before submitting
1. Host `marketing/privacy.html` (filled in) and a deletion-request page; set `VITE_PRIVACY_URL` and rebuild.
2. In Play Console: set **Target audience = children**, complete **Data safety**, **content rating**, and **ads = none**.
3. Wire **Google Play Billing** (RevenueCat recommended) + **server-side purchase verification**, then set `VITE_BILLING=revenuecat`.
4. Replace the **dev data store + auth** with a managed database/auth provider.
5. Have a lawyer review the privacy policy and your COPPA/Children's Code obligations.

> This is an engineering checklist, not legal advice. Store policies change — confirm the current Families policy and Data safety requirements in the Play Console at submission time.

> **Voice & microphone:** the default mascot voice is on-device (no data sent). If you enable the **premium voice**, short text is sent to your voice provider; **speaking practice** uses the device/browser speech recognition (audio handled by that service). Disclose both in your Data safety form and privacy policy, and keep the microphone behind the child's explicit tap (it already is).
