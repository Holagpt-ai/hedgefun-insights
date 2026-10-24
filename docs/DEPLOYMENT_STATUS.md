# Deployment status

Checked 2026-10-24 from this workspace. Git SHAs below were read with `git rev-parse` after `git fetch origin main`. **Supabase production is managed in Lovable Cloud** (project `zcjptaolpumhtlwhlemq`). Cursor attempted local Supabase CLI calls without a personal access token; that path is not the default production operator model.

## AI Analyst V2 — `chat` Edge activation (2026-10-24)

Authorized scope: deploy **`chat` only** from **`1072343455023afc1cb1fbd9007258e80308dd75`** (PR #164) to project **`zcjptaolpumhtlwhlemq`**.

| Field | Value |
| --- | --- |
| Result | **BLOCKED** — deploy not executed |
| Source SHA (approved) | `1072343455023afc1cb1fbd9007258e80308dd75` |
| Source parity | **Confirmed** — `origin/main` matches approved SHA; `supabase/functions/chat` and required `supabase/functions/_shared/ai-analyst/*` present at that commit (includes `analyst-intelligence-delivery.ts` and recovery shared modules). Workspace chat paths match `origin/main`. Archived branch `cursor/chat-single-pass-v1` was not used. |
| Previous `chat` version / deploy id | **UNKNOWN** — not read from Lovable Cloud / managed Supabase; no rollback id captured |
| New `chat` version / deploy id | **N/A** — no deploy |
| Deployment timestamp | **N/A** |
| Secrets check | **Not verified in Lovable Cloud this session.** Required names for this function (no values read): `ANTHROPIC_API_KEY`, `BRAVE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`. |
| Auth / entitlements | **Unchanged in git** — `[functions.chat] verify_jwt = false`; handler auth and plan limits unchanged at `10723434`. |
| Pre-deploy tests (local, merge tree) | `deno check supabase/functions/chat/index.ts` at `10723434` — **pass** |
| Production smoke (pre-deploy) | `OPTIONS` `/functions/v1/chat` → **200**, CORS `Access-Control-Allow-Origin: *`, expected allow-headers |
| Post-deploy tests | **Not run** — no new revision deployed |
| Error logs | **Not queried** — use Lovable Cloud managed Supabase logs for production |

**Unblock (Lovable Cloud):** from Lovable Cloud, record the current production `chat` version or deploy id for rollback, confirm required secrets exist, then deploy **`chat` only** from git **`10723434`** with no source edits (standard Supabase bundle includes `_shared/ai-analyst` imports). Post-deploy validation per the activation runbook. Roll back by redeploying the saved previous `chat` revision through Lovable Cloud. Do not ask the user to obtain a personal Supabase access token unless Lovable Cloud explicitly cannot perform the step and the gap is documented.

## Confirmed this session

| Surface | Observation |
| --- | --- |
| GitHub `main` | `1072343455023afc1cb1fbd9007258e80308dd75` — PR #164 AI Analyst catalyst evidence recovery (merged 2026-10-24). Vercel Production deployment for this SHA succeeded earlier the same day. |
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
