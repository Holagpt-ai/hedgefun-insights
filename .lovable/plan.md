# Batch 33 — radar-worker-bridge Edge-only deploy (read-only findings + plan)

## Findings (verified this turn, no changes made)
1. GitHub sync: the sandbox only shows Lovable's internal git remote; local HEAD is ec5c8b60 (Lovable internal commit, 22:45 UTC). The connection status and synced GitHub revision are not visible to the agent, so they are unverified. Local `actions.ts` does not contain `historical_rollout_symbols_current_through`, so Batch 33 has not reached this project.
2. Source access: the approved commit b499890f is publicly readable (raw `actions.ts` returned HTTP 200 and contains the new action).
3. Edge-only deploy: supported. The deploy tool publishes only the named function; frontend publishing is separate and untouched (same method as Batches 01–28.2).
4. Remaining blocker: none confirmed. The only risk is closure drift: shared modules in b499890f must be a superset of the newer worker functions deployed in 28.1 (8f354261) and 28.2.

## Plan (after approval)
1. Download the full radar-worker-bridge import closure (entry, handler, actions, all `../_shared` and relative imports) from b499890f.
2. Diff against project files; confirm b499890f contains the 8f354261/28.2 bridge changes (no regression). Stop if not.
3. Check for no `@/` aliases and no missing imports; type check (treat checker crashes as inconclusive).
4. Copy only changed closure files byte-for-byte; no other edits, no config changes.
5. Deploy only radar-worker-bridge; record fingerprint; keep 8f354261 as rollback reference.
6. Verify: 401 for missing/wrong key, clean startup, worker calls still 200. The new action is called only if a worker-key holder does it (agent cannot authenticate).

No database, frontend publish, Fly, secrets or other functions.
