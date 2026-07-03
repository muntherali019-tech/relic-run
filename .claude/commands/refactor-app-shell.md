---
description: Break the 1300-line App.jsx into screen components without behavior change
---

src/App.jsx is a single ~1300-line component holding every screen (home, quiz, scan, mark, dashboard, leaderboard, chat, badges, shop, settings) plus global state. Refactor it mechanically and safely.

1. First map the state: list every useState/useRef in App.jsx and which screens read/write it. Anything used by one screen moves with that screen; truly global state (child profile, stars, subscriptions, language, screen router) stays in App.
2. Extract one screen at a time into src/components/screens/<Name>.jsx, passing state via props (no context or state library in this pass), building after each extraction. Start with the leaf screens (badges, shop, leaderboard) and leave the quiz engine for last — it has the most shared state.
3. Zero behavior change: same markup, same class names, same handlers. Diff the built CSS/JS behavior by running the app headlessly before and after (home screen renders, a quiz round completes against the offline bank).
4. Keep each extracted screen under ~300 lines; shared helpers go to src/lib/, not copied.
5. Keep the existing lazy-loading boundaries (GrownUps, Languages, Courses, Calculator) intact, and consider lazy-loading newly extracted heavy screens if the bundle report supports it.

Stop and report if any extraction forces a behavior-affecting change — do not improvise redesigns. Deliver: extraction list, final App.jsx line count, and build/verification evidence.
