# Batch 190.11 — Staged publish RPC diagnostics (ISS-034)

**Issue:** ISS-034 (P0 OPEN until post-deploy acceptance)  
**PR:** #206  
**Scope:** Git-only Edge diagnostics — **no SQL migration**, no production deploy.

## Problem

Production finalize reached `atomic_publish` with seven completed chunks, then failed with opaque `staged_publish_failed`. PostgREST already returns `code`, `message`, and `details` on RPC failures from `replace_screener_results_generation_v1`; the Edge staging client discarded them.

Batch **190.10** (PR **#204**, on `main`) fixes the dominant **selection** defect: Day Trade Radar top-20 could rank on regular-session `day.v` while rows persisted observation-session volume.

## Correction (this batch)

- **`formatStagedPublishRpcTransportFailure`** — sanitize PostgREST `details` / `message` / `code` into bounded `continue_last_error` tokens (e.g. `nonpositive_volume`).
- **`SupabaseSyncStagingStore.publishStagedGeneration`** — use the formatter instead of bare `staged_publish_failed`.

**Explicitly out of scope:** Rewriting `publish_screener_sync_staged_generation_v1` to catch replace exceptions and return JSON. That pattern can leave feed mutations visible while the job row stays unpublished if replace succeeds and a later guard fails (e.g. count mismatch). Existing **RAISE** behavior preserves full transaction rollback.

## Production acceptance (Edge deploy only)

1. Apply/deploy **`sync-screener-data`** from merged `main` (**190.10** + **190.11**; **190.9** weekend fix recommended in same deploy).
2. Failed generations record specific slugs from PostgREST (`nonpositive_volume`, etc.) instead of bare `staged_publish_failed`.
3. Gate 4: at least one fresh six-tab publication without ratio-tab validation failures on Day Trade Radar.

**No Lovable migration** required for 190.11.

## Tests

- `sync-publish-rpc-error_test.ts` — slugging rules.
- `sync-staging-supabase-publish-error_test.ts` — mocked PostgREST error → store reason.
- Postgres gate **replace failure rolls back publish record** — still `assertRejects`; asserts zero `screener_results` rows for the sync run (rollback atomicity unchanged).
