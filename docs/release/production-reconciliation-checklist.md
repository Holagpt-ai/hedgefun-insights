# Production reconciliation release checklist

Use after merging the recovery PR into `main`. Does **not** auto-run deploys.

## Git / Vercel (production frontend)

1. Merge recovery PR into `main` (no force-push).
2. Confirm Vercel **Production** tracks `main` and deploy completes.
3. Verify `https://stocksist.com/asset-manifest.json` JS hash changed from pre-merge `index-uwAfxBgI.js`.
4. Spot-check `/dashboard/catalyst` for SEC provenance (`sec-provenance-compact`) and `?symbol=` handoffs.

## Lovable (preview sync — not DNS)

1. Republish or sync Lovable from **`main`**, not from stale `cursor/chat-single-pass-v1`.
2. After merge, reset or fast-forward `cursor/chat-single-pass-v1` to `main` so preview matches production code.
3. Treat `*.lovable.app` as preview until Vercel production is verified.

## Backend (Lovable apply — out of band for this PR)

These ship in repo but require separate Lovable approval; **do not** apply from Cursor in this batch:

- `supabase/migrations/20261024153000_sec_edgar_ingestion_circuit_breaker_v1.sql` (Gate I.3)
- Redeploy `sync-sec-edgar-filings` when migration is applied

No SEC cron activation, write-gate changes, or jobs 50/36/37/52 in this checklist.

## Regression gates (CI / local)

- `npm run typecheck`
- `npm run build`
- Catalyst: `CatalystActivePage.v21`, `sec-edgar-events`, `enrichment`
- Radar: `radar-core`, `screener-trade-quality`
- Brand/SEO: `src/config/__tests__/seo.test.ts`, `brand.test.ts`
