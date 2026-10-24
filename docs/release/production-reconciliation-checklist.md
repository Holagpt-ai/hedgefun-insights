# Production reconciliation release checklist

Use after merging the recovery PR into `main`. Does **not** auto-run deploys.

## Git / Vercel (production frontend)

1. Merge recovery PR into `main` (no force-push).
2. Confirm Vercel **Production** tracks `main` and deploy completes.
3. Verify `https://stocksist.com/asset-manifest.json` JS hash changed from pre-merge `index-uwAfxBgI.js`.
4. Spot-check `/dashboard/catalyst` for SEC provenance (`sec-provenance-compact`) and `?symbol=` handoffs.

## Lovable (preview sync — not DNS)

1. Republish or sync Lovable from **`main`**.
2. Active integration branch: `cursor/lovable-sync-from-main-20261024`. PR #162 merged to `main`, and this branch was merged forward with identical file contents.
3. `cursor/chat-single-pass-v1` is an archived recovery branch. Its historical divergence is not a current production synchronization task. Do not merge it to catch Lovable up.
4. Treat `*.lovable.app` as preview until Vercel production is verified.

## Backend (Gate I.3 — historical activation)

These production steps were completed before PR #163. This checklist does not re-run them:

- Circuit-breaker migration applied.
- `sync-sec-edgar-filings` Edge Function deployed.
- SEC scheduled ingestion activated through cron job 52.
- A subsequent scheduled run inserted 22 records and advanced the checkpoint.

That is historical verification. It is not a new live-state query. Do not reapply the migration, redeploy the function, or change cron job 52 from this checklist.

The sentences above replace the earlier note that this checklist itself performed no cron activation. Cron job 52 was activated in the later production step recorded here.

## Regression gates (CI / local)

- `npm run typecheck`
- `npm run build`
- Catalyst: `CatalystActivePage.v21`, `sec-edgar-events`, `enrichment`
- Radar: `radar-core`, `screener-trade-quality`
- Brand/SEO: `src/config/__tests__/seo.test.ts`, `brand.test.ts`
