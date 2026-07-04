---
description: Find and fix npm vulnerabilities in the main project and reelmint/
---

Run a dependency security pass over both package roots: the repo root and reelmint/.

1. `npm install && npm audit` in each root. Record every finding with severity and advisory link.
2. For each vulnerability, prefer the smallest fix that reaches a patched version: a semver-compatible bump first, then a major upgrade of the direct dependency (checking peer-dependency compatibility of vite plugins before bumping vite), and an `overrides` entry only for transitive deps that can't otherwise move.
3. After every change, prove nothing broke: `npm run build`, `npm run build:app`, and `npm run build:onefile` must all succeed, and the server must boot (`node server/index.js` with a spare PORT and respond on /api/health).
4. Finish with `npm audit` showing 0 vulnerabilities in both roots, or an explicit list of what remains and why it can't be fixed yet.
