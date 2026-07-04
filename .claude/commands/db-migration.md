---
description: Move persistence from JSON-file store to Postgres behind the existing store API
---

server/store.js persists everything (users, children, classes, goals) and the repo already lists `pg` as an optional dependency and deploys on Render (render.yaml). Migrate persistence to Postgres without changing any route handler.

1. Read server/store.js first and preserve its exact exported API (load, save, newId, newCode, overview, weakest, initStore) — handlers must not change in this pass.
2. Implement a Postgres backend selected by DATABASE_URL: simplest correct schema is a single JSONB document row (matching today's whole-DB load/save semantics) with optimistic locking; propose a normalized schema as a follow-up, don't build it now.
3. Keep the JSON-file backend as the no-DATABASE_URL fallback for local dev.
4. Write a one-shot migration path: on first boot with DATABASE_URL set, import server/data/*.json if present.
5. Handle pg being uninstalled (it's optional) with a clear startup error only when DATABASE_URL is set.
6. Test: boot with and without DATABASE_URL (use a throwaway Postgres via Docker if available, else mock), run the signup→child→goal→delete flow, and confirm identical behavior.

Report schema, locking strategy, and test evidence.
