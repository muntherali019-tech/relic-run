---
description: Shrink and split the frontend JS bundle without changing behavior
---

You are optimizing the Vite + React bundle of this education game (entry: src/main.jsx, main app: src/App.jsx).

1. Run `npm run build` and record every emitted chunk with raw + gzip sizes as the baseline.
2. Identify heavy code that is not needed on first paint: secondary screens (already lazy: GrownUps, Languages, Courses, Calculator), large data modules (src/data/bank.js, src/data/courses.js), and any lucide-react icons imported but unused.
3. Apply improvements in this order, rebuilding after each: (a) React.lazy + Suspense for screens rendered behind a user action, (b) dynamic `import()` for data only needed inside a lazy screen, (c) remove dead imports/exports.
4. Constraints: all three build modes must keep working (`build`, `build:app`, `build:onefile` — the onefile build inlines dynamic imports, so lazy code must not depend on network chunk loading semantics), and no user-visible behavior may change beyond a brief loading spinner.
5. Report a before/after table of chunk sizes and state the total gzip savings. Do not claim savings you did not measure.
