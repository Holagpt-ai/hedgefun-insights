# Batch ISS-037 — Screener free-float enrichment

**Issue:** ISS-037 (P2)  
**Base:** `2edaabfc`  
**Scope:** Populate `screener_results.float_shares` at publish time for **selected row symbols only**.

## Source contract

- Massive/Polygon **`/stocks/vX/float`** (same as `market-data` Edge `type=float` and Radar `getFloat`).
- Mapping: `float` → `free_float` → `float_shares` only (`mapMassiveFloat` / `mapFloatPayload`).
- **Never** uses `outstanding_shares` or short-interest fields.

## Bounded integration

1. After tab row selection (~≤120 rows / ~80–100 unique symbols), `enrichPublishedRowsWithVerifiedFloat`:
   - Reuses **fresh** (`≤12h`) floats from `screener_results` via `loadLatestScreenerFloatSharesBySymbol`.
   - Uses Edge-isolate cache (`FLOAT_CACHE_TTL_MS`).
   - Fetches missing symbols from Polygon at concurrency **6** (not the 13k universe).
2. Failures per symbol → `float_shares: null` (publish continues).

## Activation (owner)

1. Merge PR.
2. Deploy Lovable Cloud Edge **`sync-screener-data`** only (no migration, cron, or Fly change).
3. Read-only: sample published rows for non-null `float_shares` where Massive has data.

## Rollback

Redeploy prior `sync-screener-data` bundle; rows revert to null on next generation (no schema rollback).

## Tests

`supabase/functions/_shared/screeners/screener-float-enrich_test.ts`
