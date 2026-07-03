---
description: WCAG 2.1 AA accessibility pass over the game UI
---

Audit src/App.jsx, src/components/*, and src/styles.css against WCAG 2.1 AA, keeping in mind two key audiences: young children (large targets, spoken feedback) and screen-reader users (the app advertises a read-aloud mode for blind learners).

Check and fix:
1. Every interactive element has an accessible name (aria-label on icon-only buttons), and decorative icons are aria-hidden.
2. Quiz state changes (correct/incorrect, round complete) are announced via aria-live regions.
3. Focus management: moving between screens sends focus to the new screen's heading; modals trap focus; focus-visible styles have ≥3:1 contrast.
4. Color contrast ≥4.5:1 for text on the cream/orange theme, and correctness is never conveyed by color alone.
5. `prefers-reduced-motion` disables confetti and the wiggle/bounce animations.
6. Touch targets ≥44×44 px on answer buttons and nav icons.
7. RTL layout still works for Arabic after any markup changes.

Verify with the built app in a headless Chromium pass (Playwright is preinstalled) where feasible; otherwise justify each fix from the code. List every issue found → fixed, and anything deferred.
