# Deployment status

Checked 2026-10-24 from this workspace. Git SHAs below were read with `git rev-parse` after `git fetch origin main`. The production asset hash was read with `npm run integrity -- --remote` (`GET https://stocksist.com/asset-manifest.json`). No Vercel, Supabase, Fly, or Lovable API was called. No authenticated deploy screen was opened.

## Confirmed this session

| Surface | Observation |
| --- | --- |
| GitHub `main` | `63957b319be959888af59410bd36c58cce45fb6d` — `63957b31` Sync Lovable-generated artifacts (#162), parent `ed3a3728` Catalyst V2.1 and Gate I.3 reconcile (#161) |
| Repo | `https://github.com/Holagpt-ai/hedgefun-insights` |
| Vercel config in git | `vercel.json` installs with `npm ci`, redirects the legacy host and `www.stocksist.com` to `https://stocksist.com`, rewrites `/sitemap.xml` to the Supabase `sitemap` function, and SPA-falls back every other path |
| Production asset manifest | `{"js":"/assets/index-CpDXxxyv.js"}` style response; observed js `/assets/index-CpDXxxyv.js`. The manifest has no git SHA |
| Supabase project id in git | `zcjptaolpumhtlwhlemq` |
| Lovable project id | Not stored in the repo |

`docs/release/production-reconciliation-checklist.md` told operators to expect the production js hash to move off `index-uwAfxBgI.js` after the recovery merge. The live hash on 2026-10-24 is `index-CpDXxxyv.js`, so the frontend asset has changed since that note. Which commit produced `index-CpDXxxyv.js` was not verified.

A local `npm run build` of this tree also wrote `index-ACjVgNSC.js`. That hash differs from production `index-CpDXxxyv.js`. The difference does not identify the deployed git SHA: the manifest has no SHA, and Vercel can inline environment values that a local build does not have.

## Reported, not rechecked

| Item | Where it was stated | This session |
| --- | --- | --- |
| Gate I.3 migration and `sync-sec-edgar-filings` already live; PR #161 does not require a redeploy | `docs/release/production-reconciliation-checklist.md` | Not queried in Supabase |
| Gate I.3 circuit breaker still needs an activation procedure; writes and cron were not enabled from Cursor | `docs/sec-edgar/gate-i3-activation-readiness.md` | The migration file `20261024153000_sec_edgar_ingestion_circuit_breaker_v1.sql` is on `main`. Live pause flags, write flag, and cron were not read |
| Batch 34 migration and Edge deploy map unknown | `docs/release/batch34-production-release-manifest.md` | Not refreshed |
| Historical backfill image deployed, then scaled to 0 machines after checkpoint C3.5 | same manifest | Fly was not queried |
| Radar worker image versus `main` unknown | same manifest | Fly was not queried |
| Lovable should sync from `main`, not `cursor/chat-single-pass-v1` | production reconciliation checklist | Lovable was not opened |

Treat those rows as operations memory, not as a fresh production audit.

## Branch divergence confirmed in git

| Branch | Versus `origin/main` on 2026-10-24 |
| --- | --- |
| `origin/cursor/chat-single-pass-v1` | 83 commits not in `main`, 160 commits from `main` missing on the branch. Tree diff is large and deletes current `main` work. Do not merge. |
| `origin/cursor/catalyst-evidence-depth-v2` | Two analyst/chat commits (`115329bb`, `c3bb034a`). Not contained in `main`. Smaller than the Lovable-branch copies of the same feature. |

## Fly app names in git

`stocksist-radar-v22-worker`, `stocksist-historical-backfill-job`, `stocksist-sec-egress-gateway`, `stocksist-ai-trader-shadow-worker`. Image digests were not read.
