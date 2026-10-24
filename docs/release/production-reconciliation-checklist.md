# Production reconciliation release checklist

Use after merging the recovery PR into `main`. Does **not** auto-run deploys.

## Git / Vercel (production frontend)

1. Merge recovery PR into `main` (no force-push).
2. Confirm Vercel **Production** tracks `main` and deploy completes.
3. Verify `https://stocksist.com/asset-manifest.json` JS hash changed from pre-merge `index-uwAfxBgI.js`.
4. Spot-check `/dashboard/catalyst` for SEC provenance (`sec-provenance-compact`) and `?symbol=` handoffs.

## Lovable (preview sync — not DNS)

1. Republish or sync Lovable from **`main`**, not from stale `cursor/chat-single-pass-v1`.
2. Align `cursor/chat-single-pass-v1` with `main` using a **non-destructive merge** (see PR #161 release gate — do not reset or force-push).
3. Treat `*.lovable.app` as preview until Vercel production is verified.

## Backend (Gate I.3 — already live)

Gate I.3 migration and `sync-sec-edgar-filings` Edge deployment are **already activated in production**. Merging PR #161 **does not** require reapplying that migration or redeploying that function.

This PR only **aligns `main` git history** with code that is already live on the integration/Lovable path for Gate I.3. Do **not** run duplicate apply or redeploy steps unless a separate ops audit shows drift.

No SEC cron activation, write-gate changes, or jobs 50/36/37/52 in this checklist.

## Regression gates (CI / local)

- `npm run typecheck`
- `npm run build`
- Catalyst: `CatalystActivePage.v21`, `sec-edgar-events`, `enrichment`
- Radar: `radar-core`, `screener-trade-quality`
- Brand/SEO: `src/config/__tests__/seo.test.ts`, `brand.test.ts`
