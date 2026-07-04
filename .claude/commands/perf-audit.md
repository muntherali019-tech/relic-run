---
description: Runtime performance pass — re-renders, animation cost, startup time
---

Profile and fix runtime performance of the game UI (src/App.jsx is a single ~1300-line component managing all screens).

1. Find re-render hotspots: state updates in App.jsx that re-render the whole tree every second or on every keystroke (timers, chat input, speech animation state). Fix with component extraction, memo, or moving state down — smallest change first.
2. Audit animation cost: confetti (src/lib/celebrate.js), Mochi's animated mouth, and CSS animations in styles.css should use transform/opacity only and pause when the tab is hidden.
3. Audit startup: everything not needed to render the home screen should load lazily (screens are already code-split; check data modules and speech/recognition initialization).
4. Check localStorage churn: saveState frequency in src/lib/progress.js — debounce if it writes on every answer.
5. Measure before/after where possible (Playwright + performance.now() timings on the built app, React profiler reasoning otherwise). No behavior changes; all three builds must pass.

Report each hotspot found, the fix, and the measured or reasoned impact.
