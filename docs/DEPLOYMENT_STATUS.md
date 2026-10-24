# Deployment status

Checked 2026-10-24 from this workspace. Git SHAs below were read with `git rev-parse` after `git fetch origin`. Production Supabase is managed in **Lovable Cloud** (project `zcjptaolpumhtlwhlemq`). Edge deploy safety: `docs/release/edge-function-release-lovable.md`.

## AI Analyst V2 — `chat` Edge activation

| Field | Value |
| --- | --- |
| Result | **BLOCKED** — production `chat` not deployed from approved source |
| Approved source SHA | `1072343455023afc1cb1fbd9007258e80308dd75` (PR #164) |
| Previous production `chat` version id | **UNKNOWN** — not captured in Lovable Cloud this session |
| Rollback package | **Not established** — see edge release doc; deploy must not proceed without Lovable-recorded previous revision |
| Tracker | **ISS-015** remains open until Lovable deploy + verification |

## Lovable integration branch sync (2026-10-24)

| Field | Value |
| --- | --- |
| Branch | `cursor/lovable-sync-from-main-20261024` |
| Action | Non-destructive merge of `origin/main` (`10723434`) plus remote Lovable tip (`763abbe1`); preserved Lovable-generated `bun.lock` |
| AI Analyst V2 in branch | **Confirmed** — `analyst-intelligence-delivery.ts` and `_shared/ai-analyst` recovery modules present |
| Pending on `main` | PR #165 Lovable Cloud ownership docs (`b28aaaa2`) — merge to `main` then forward-merge into integration branch |

## Confirmed this session

| Surface | Observation |
| --- | --- |
| GitHub `main` | `1072343455023afc1cb1fbd9007258e80308dd75` — PR #164 AI Analyst catalyst recovery (merged 2026-10-24). Vercel Production succeeded for this SHA. |
| Repo | `https://github.com/Holagpt-ai/hedgefun-insights` |
| Vercel config in git | `vercel.json` installs with `npm ci`, redirects the legacy host and `www.stocksist.com` to `https://stocksist.com`, rewrites `/sitemap.xml` to the Supabase `sitemap` function, and SPA-falls back every other path |
| Production asset manifest | `{"js":"/assets/index-CpDXxxyv.js"}` style response; observed js `/assets/index-CpDXxxyv.js`. The manifest has no git SHA |
| Supabase project id in git | `zcjptaolpumhtlwhlemq` |
| Lovable project id | Not stored in the repo |

`docs/release/production-reconciliation-checklist.md` told operators to expect the production js hash to move off `index-uwAfxBgI.js` after the recovery merge. The live hash on 2026-10-24 is `index-CpDXxxyv.js`, so the frontend asset has changed since that note. Which commit produced `index-CpDXxxyv.js` was not verified.

A local `npm run build` of this tree also wrote `index-ACjVgNSC.js`. That hash differs from production `index-CpDXxxyv.js`. The difference does not identify the deployed git SHA: the manifest has no SHA, and Vercel can inline environment values that a local build does not have.

## Lovable branches

| Branch | Role |
| --- | --- |
| `cursor/lovable-sync-from-main-20261024` | Active integration branch. PR #162 is merged to `main`. This branch was merged forward afterward and its file contents match `main`. |
| `cursor/chat-single-pass-v1` | Archived recovery source for the analyst commits. Those commits are cherry-picked onto the catalyst evidence recovery. The branch itself was not merged. Its older divergence from `main` is not a current production or Lovable synchronization problem. |

Lovable was not opened in this session. Preview hosts remain preview.

## Gate I.3 — historical production activation

Previously completed, and recorded here without a new live query:

- Circuit-breaker migration applied.
- `sync-sec-edgar-filings` Edge Function deployed.
- SEC scheduled ingestion activated as cron job 52.
- A subsequent scheduled run inserted 22 records and advanced the checkpoint.

That record is historical verification. PR #163 did not re-read the live database, the Edge deployment, cron job 52, or the current checkpoint. Current pause flags and the latest run are therefore not re-verified here. Do not reapply the migration, redeploy the function, or change the schedule from this document.

`docs/sec-edgar/gate-i3-activation-readiness.md` still reads as a pre-activation procedure. `docs/sec-edgar/unapplied-cron.sql` remains a commented draft. Neither file is the live-state record.

## Reported, not rechecked

| Item | Where it was stated | This session |
| --- | --- | --- |
| Batch 34 migration and Edge deploy map unknown | `docs/release/batch34-production-release-manifest.md` | Not refreshed |
| Historical backfill image deployed, then scaled to 0 machines after checkpoint C3.5 | same manifest | Fly was not queried |
| Radar worker image versus `main` unknown | same manifest | Fly was not queried |

Treat those rows as operations memory, not as a fresh production audit.

## Other git branches

| Branch | Versus `origin/main` on 2026-10-24 |
| --- | --- |
| `origin/cursor/catalyst-evidence-depth-v2` | Two analyst/chat commits (`115329bb`, `c3bb034a`). Not contained in `main`. Smaller than the archived recovery branch's copies of the same feature. |

## Fly app names in git

`stocksist-radar-v22-worker`, `stocksist-historical-backfill-job`, `stocksist-sec-egress-gateway`, `stocksist-ai-trader-shadow-worker`. Image digests were not read.
