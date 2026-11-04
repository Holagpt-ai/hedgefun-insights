# Batch ISS-037 — Screener free float (display path)

**Issue:** ISS-037 (P2)  
**Base:** `2edaabfc`  
**PR:** #215  
**Scope:** Show verified **Free Float (shares)** in Scanner / Radar UI without blocking six-tab publication.

## Release safety

- **No** Polygon float lookup on the `sync-screener-data` publication critical path.
- **Cache freshness** (18h client TTL) applies to how recently Stocksist fetched the Edge float response.
- **Measurement date** uses Massive **`effective_date`** (then legacy `as_of` / `updated`). Reference float is not rejected for being older than 18h; missing/invalid/future dates stay unavailable. Market quote `provider_as_of` is **not** float proof.
- **Short Float (%)** stays on `evaluateScreenerShortFloat` only — never derived from free-float shares.
- Published `screener_results.float_shares` remain **null** (generation contract unchanged).

## UI

- `ScreenerTable` (desktop + mobile): `useRadarFloatForSymbols` for visible symbols; labels **Free Float** vs **Short Float**.
- Radar grid / mobile: same label separation; optional **Free Float** column unchanged in behavior, clearer labeling.

## Activation (owner)

1. Merge PR #215.
2. **Vercel frontend** plus owner-approved Lovable deploy of Edge **`market-data`** (float mapper / `effective_date`). No `sync-screener-data`, migration, cron, or Fly change.
3. Visual acceptance: free float appears for symbols Massive returns; short float still unavailable until short-interest evidence exists.

## Rollback

Redeploy prior Vercel production build.

## Tests

- `supabase/functions/sync-screener-data/handler_test.ts` — no `/float` calls; 429 float API cannot affect publish.
- `src/lib/market-data/__tests__/float-freshness.test.ts`
- `src/components/dashboard/__tests__/ScreenerTable.free-float.test.tsx`
