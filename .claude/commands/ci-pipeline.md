---
description: CI for the main app — build all modes, audit, smoke-test the API
---

The repo has CI only for reelmint/ (.github/workflows/ci.yml). Add a workflow for the main app that fails fast on the things this repo has actually broken before: dependency vulnerabilities, build breakage across the three modes, and server boot errors.

Create .github/workflows/main-ci.yml that, on push/PR:
1. Sets up Node 22 with npm cache keyed to package-lock.json.
2. `npm ci`, then `npm audit --audit-level=high` (fail on high/critical).
3. Builds all three modes: `npm run build`, `npm run build:app`, `npm run build:onefile`.
4. `node --check` on every file in server/.
5. Boots the server on a spare port with no secrets set and curls /api/health until OK — the server must run in demo mode without any env vars.
6. Optional job: if a test script exists in package.json, run it.

Keep total runtime under ~3 minutes; no third-party actions beyond actions/checkout and actions/setup-node. Validate the YAML (e.g. with a YAML parser) before finishing.
