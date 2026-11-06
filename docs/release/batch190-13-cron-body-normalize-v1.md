# Batch 190.13 — Cron `{}` body normalization (ISS-034 P0)

**Issue:** Production pg_cron job 25 POSTs literal `{}`. `parseStagedSyncBody()` returned `{ action: undefined }`, so Batch **190.12** reconciliation preflight never ran and cron stayed on **409** `generation_in_progress`.

## Fix

- `normalizeStagedSyncRequest()`: `{}` → `{ action: "cron" }`; explicit `cron` / `continue` / `finalize` unchanged; malformed nonempty bodies → **400** (`invalid_json`, `missing_action`, `unsupported_action`, `missing_generation_id`).

## Activation (owner)

1. Merge PR on `main`.
2. **Deploy only** Lovable Cloud Edge function **`sync-screener-data`** (no migration, no cron edit, no SQL change).
3. Next cron tick should log `reconciled_stranded_publish` (if stranded job still present) and proceed to new generations.

## Rollback

Redeploy prior `sync-screener-data` bundle (pre-190.13). Migration **190.12** remains valid.

## Tests

`supabase/functions/sync-screener-data/batch190-13-cron-body-normalize_test.ts` (included in screener-deno-regressions workflow).
