# Self-hosted webfonts

Fredoka and Nunito, served from our own origin instead of Google's CDN.

## Why these are here

`src/styles.css` used to start with:

```css
@import url('https://fonts.googleapis.com/css2?family=Fredoka:...&family=Nunito:...');
```

That had three problems for a children's app:

1. **Privacy.** Every page load sent each child's IP address and User-Agent to a
   third party. `COMPLIANCE.md` claims "No third-party analytics / tracking SDKs
   in the child experience" — a font CDN request undercuts that claim, and the
   Play Families policy and UK Children's Code both care about it.
2. **Offline.** The service worker (`public/sw.js`) precaches our own origin so
   quizzes work with no connection. A cross-origin `@import` could never be part
   of that, so an offline learner lost the typeface.
3. **Render-blocking.** A CSS `@import` of a remote stylesheet blocks rendering
   on a DNS lookup, TLS handshake and round trip to a host we don't control. It
   fails badly on a flaky connection.

## What is here

Eight `.woff2` files — **variable** fonts, so one file per subset covers every
weight the app uses (Fredoka 400–700, Nunito 400–800):

| Family  | Subsets |
|---------|---------|
| Fredoka | latin, latin-ext, hebrew |
| Nunito  | latin, latin-ext, cyrillic, cyrillic-ext, vietnamese |

The `@font-face` blocks in `src/styles.css` keep Google's original
`unicode-range` values, so a browser still downloads **only** the subsets it
needs — a UK visitor fetches `fredoka-latin` + `nunito-latin` (~69 KB), exactly
what it fetched from Google before.

These families cover Latin, Cyrillic, Greek, Hebrew and Vietnamese. The app's
other UI languages (Arabic, Mandarin, …) fall back to system fonts, which is
what happened with the CDN too.

## Licence

Both are **SIL Open Font License 1.1**, which permits self-hosting and
redistribution. The full licences ship next to the fonts as `OFL-Fredoka.txt`
and `OFL-Nunito.txt` — keep them here; the OFL requires the notice to travel
with the font.

## Updating

Fetch the CSS the same way a browser would, then repoint `src:` at these paths:

```
https://fonts.googleapis.com/css2?family=Fredoka:wght@400..700&family=Nunito:wght@400..800&display=swap
```

Download each `fonts.gstatic.com` URL to `<family>-<subset>.woff2` and copy the
`unicode-range` lines across unchanged.
