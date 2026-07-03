---
description: Complete UI translation coverage via the i18n layer
---

The app localizes UI text through src/lib/i18n.js (batched, on-device-cached translations keyed by English source strings via `t()`/`useT`). The README notes the grown-ups portal and the language module still contain untranslated English strings.

1. Enumerate hard-coded user-visible strings in src/components/GrownUps.jsx, src/components/Languages.jsx, src/components/Courses.jsx, and any missed in src/App.jsx — including aria-labels, placeholders, alert()/confirm() text, and button titles. Ignore developer-facing strings (console, errors sent to logs).
2. Wrap each in the existing `t()` mechanism, following the exact patterns already used in App.jsx (including `tf` for strings with interpolation).
3. Do not translate: brand names (Mochi), currency amounts that come from billing, ISO codes, or strings that the AI already generates in-language.
4. Sanity-check that string keys stay stable (the translation cache is keyed by source text), the RTL Arabic layout still renders, and `npm run build` passes.

Report the count of strings converted per file and any strings intentionally left in English with reasons.
