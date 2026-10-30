# Batch 190.7 — Staged finalization exception recovery

**Issue:** ISS-034 (P0 open)  
**Scope:** Edge finalization diagnostics + lease recovery only — no scanner, chunk, or migration changes.

## Confirmed incident (2026-10-30 ~20:15 UTC)

| Field | Value |
| --- | --- |
| Job | `ce0593d4-9259-441b-adcd-91b484d432b9` |
| Sync run | `ac60e2a0-5bf7-430f-9a62-3deaa6c34570` |
| Chunks | 7/7 @ 2,200 |
| Status | `finalizing`, state_version **7** |
| Observed errors | Edge log `unexpected error` → continue dispatch **`http_500`** |
| Impact | ~12m finalize lease blocked cron resume until lease expiry; last verified publish **20:10 UTC** |

**Root cause in git (inference, not reproduced locally):** an **uncaught exception** inside `finalizeStagedScreenerGeneration` bubbled to `index.ts`, returning HTTP 500 without releasing the finalize lease. The background continue/finalize dispatch recorded `http_500`, while the job remained `finalizing` with an active finalize lease — so subsequent cron cycles could not reclaim finalize work until lease expiry.

This batch does **not** claim to identify the original thrown exception without production stack detail. It hardens the failure mode and cron recovery path.

## Implementation

1. **Structured finalize diagnostics** — stage + sanitized error class in logs and JSON (`finalize_failed` response).
2. **Safe lease release** — on uncaught finalize errors before publication, clear finalize/chunk leases when `publish_rows_inserted` is still NULL.
3. **Retry prep** — before reclaiming finalize work after `continue_last_error`, release stranded leases; reconcile `complete_publish` when RPC already recorded rows.
4. **Resume gating** — `stagedJobNeedsResume` avoids cron retry while a healthy finalize lease is active; still resumes after dispatch failures.
5. **Continue dispatch errors** — parse structured finalize failure bodies instead of bare `http_500` when available.

## Release

- **Edge deploy only** — deploy `sync-screener-data` from merge head.
- **No PostgreSQL migration** required for 190.7.
- Apply after merge; does not change `SCREENER_SYNC_STAGED`, cron, or secrets.

**ISS-034** stays **P0 OPEN** until a fresh publication is verified post-deploy.
