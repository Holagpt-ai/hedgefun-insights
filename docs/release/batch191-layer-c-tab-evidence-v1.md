# Batch 191 Layer C — per-generation tab evaluation evidence

**Issue:** ISS-024 Layer C  
**Migration:** `supabase/migrations/20261116153000_screener_sync_generation_tab_evidence_v1.sql`  
**NOT APPLIED in Cursor** — Lovable Cloud applies when owner approves.

## Problem

`screener_feed_state.tab_evaluation_evidence` reflects only the **current** generation. The publication ledger (`screener_sync_generation_jobs`) recorded publish counts and status but not the six-tab evidence payload, so a successful `published` job could not prove all tabs were evaluated for that `sync_run_id`.

## Solution

On **atomic staged publish** (`publish_screener_sync_staged_generation_v1`), persist the same `p_tab_evaluation_evidence` object (and `published_synced_at`, `published_nhl_baseline_status`) on the job row in the same transaction phase as `publish_rows_inserted`. `complete_screener_sync_publish_v1` requires job `tab_evaluation_evidence` before `status = published`. **No new evidence schema** — reuses existing tab JSON.

## Pre-implementation history

Jobs with `status = published` and `tab_evaluation_evidence IS NULL` were published before this migration. Layer C treats them as **unavailable** (do not infer tab evaluation from ledger counts alone).

## Verification after authorized SQL + Edge deploy

Service-role or Lovable read-only:

```sql
SELECT id,
       sync_run_id,
       status,
       publish_rows_inserted,
       published_synced_at,
       published_nhl_baseline_status,
       tab_evaluation_evidence IS NOT NULL AS has_layer_c_evidence,
       tab_evaluation_evidence -> 'gappers' ->> 'status' AS gappers_status,
       tab_evaluation_evidence -> 'new_highs_lows' ->> 'status' AS nhl_tab_status
FROM public.screener_sync_generation_jobs
WHERE status = 'published'
  AND created_at >= now() - interval '2 days'
ORDER BY created_at DESC
LIMIT 20;
```

**Pass (post-deploy generations):** `has_layer_c_evidence = true` for new `published` rows; six tabs present with expected statuses on successful evaluations; `sync_run_id` matches `screener_feed_state` when job is the live generation.

**Aborted / retained:** `tab_evaluation_evidence` remains **NULL**; `publish_rows_inserted` **NULL**.

## Tests

- **CI:** `batch191-layer-c-tab-evidence-postgres_test.ts` runs in `.github/workflows/screener-deno-regressions.yml` (Critical screener tests) against disposable Postgres 16 after bootstrap.
- Local: `SCREENER_SYNC_PG_TEST_URL=... node scripts/supabase/screener-sync-pg-test-setup.mjs` then Deno test file.
- `assert_screener_tab_evaluation_evidence_v1` requires all **six** tab keys and valid per-tab statuses (`evaluated` / `prerequisite_unavailable`, NHL `not_evaluated`); empty `{}` and partial payloads are rejected at publish.

## Production activation

1. Apply migration on Lovable Cloud Supabase.
2. Deploy `sync-screener-data` Edge (no ranking/threshold changes — RPC behavior only).
3. Verify SQL above on the next natural published generation.