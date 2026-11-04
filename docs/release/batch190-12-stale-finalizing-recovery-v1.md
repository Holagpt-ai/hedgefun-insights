# Batch 190.12 — Stale finalizing recovery (ISS-034 P0)

**Issue:** ISS-034 — production publication deadlock (Nov 4, 2026 evidence)  
**GitHub base:** `5d6399de`  
**Scope:** Post-publication reconciliation only — no ranking, tab logic, or republish.

## Confirmed production failure (read-only)

| Field | Value |
| --- | --- |
| Blocking `sync_run_id` | `09346799-d722-437a-bebf-2eea7a6b5cd7` |
| Job id | `2fe9fca8-a9e3-4db5-ab02-25a6dfe7534e` |
| Status | `finalizing` (7/7 chunks) |
| `publish_rows_inserted` | 65 (matches live rows + feed) |
| `publish_rpc_recorded_at` | set |
| Finalize lease | expired **2026-11-02T10:52:26Z** |
| Symptom | Cron active; `sync-screener-data` → **409** `generation_in_progress`; no new generations since Nov 2 |

**Root cause:** Atomic replace + publish record succeeded, but `complete_screener_sync_publish_v1` requires an **unexpired** finalize lease. Expiry RPC preserves jobs with a publish record. After the **25-minute job TTL**, `stagedJobNeedsResume` stops retrying, while the unique active-generation index still blocks new jobs.

## Fix summary

1. **Migration** `20261104120000_screener_sync_stale_finalizing_reconcile_v1.sql` — `reconcile_screener_sync_staged_publish_v1(job_id, expected_state_version, now)`:
   - Fail-closed checks: chunks complete, publish record present, **non-null expired** finalize lease timestamp, feed `sync_run_id` + row counts match job, six-tab `evaluated` evidence, persisted `screener_results` count. NULL lease expiry does **not** qualify.
   - CAS transition `finalizing` → `published` (no republish, no blind delete).
2. **Edge** — cron preflight + finalize retry call reconciliation when lease-bound complete cannot run.
3. **Resume** — post-publish stranded jobs remain resumable beyond TTL when finalize lease expired.

## Activation (Lovable Cloud — owner)

1. Merge PR (do **not** skip review).
2. **Apply migration** `20261104120000_screener_sync_stale_finalizing_reconcile_v1.sql` on production Supabase (`zcjptaolpumhtlwhlemq`).
3. **Deploy** `sync-screener-data` Edge from merged `main` (same commit as migration approval).
4. **Wait for next cron** (job 25, 5-minute) — do **not** manually UPDATE the stranded job row.
5. **Verify (read-only):**
   - Job `2fe9fca8-a9e3-4db5-ab02-25a6dfe7534e` → `published`.
   - No `finalizing`/`chunking` row blocking unique index.
   - Subsequent cron creates a new generation; feed `synced_at` advances.
   - Edge logs: `reconciled_stranded_publish job_id=…` once.

## Rollback

1. **Edge rollback:** Redeploy prior `sync-screener-data` bundle (pre-190.12). Reconciliation calls become no-ops (`staging_rpc_missing` path) if RPC remains.
2. **SQL rollback (optional):** `DROP FUNCTION IF EXISTS public.reconcile_screener_sync_staged_publish_v1(uuid, integer, timestamptz);`  
   Does **not** revert a job already marked `published` (safe). If deadlock reappears, forward-fix only — do not hand-edit production job rows.

## Tests

```sh
deno test supabase/functions/_shared/screeners/batch190-12-stale-finalizing-reconcile_test.ts
deno test supabase/functions/_shared/screeners/sync-staging-resume_test.ts
# With SCREENER_SYNC_PG_TEST_URL (Postgres 16 bootstrap):
deno test supabase/functions/_shared/screeners/batch190-12-stale-finalizing-reconcile-postgres_test.ts
```

## ISS-034 note

This batch **unblocks the publication slot**; full Batch **191** session acceptance (Nov 4+ RTH/AH) remains required after recovery.
