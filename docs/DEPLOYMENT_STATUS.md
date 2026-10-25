# Deployment status

Checked **2026-10-25** (Batch 174 pre-session) from this workspace. Git SHAs below were read with `git rev-parse` after `git fetch origin main`. **Supabase production is managed in Lovable Cloud** (project `zcjptaolpumhtlwhlemq`). Edge deploy safety: `docs/release/edge-function-release-lovable.md`. **Git SHA on `main` is not the live Supabase Edge revision** until Lovable Cloud records a deploy.

## GitHub `main` (2026-10-25)

| Field | Value |
| --- | --- |
| HEAD | **`28cbcc9e788af9182627e36b6a7b346e003d4e03`** |
| Last merge | PR **#173** — Watchlist & historical handoff integrity V1 (**2026-10-25T16:09:45Z**) |

## Vercel SPA (2026-10-25)

| Field | Value |
| --- | --- |
| Production manifest | `{"js":"/assets/index-vzEEFfGK.js","css":"/assets/index-CqYGeua4.css"}` from `https://stocksist.com/asset-manifest.json` |
| Parity vs `main` `28cbcc9e` | **Unverified** — local `npm run build` at `28cbcc9e` produced **`index-hZRK9LjP.js`**; `npm run integrity -- --remote` reports deploy-sha mismatch |
| Notes | Manifest carries no git SHA; confirm Vercel production deploy for #173 separately |

## Fly `stocksist-radar-v22-worker` (read-only parity, 2026-10-24)

| Field | Value |
| --- | --- |
| Release | **v45** (complete, 2026-10-20T13:42:08Z) |
| Image tag | `registry.fly.io/stocksist-radar-v22-worker:deployment-01M5CRQST4MR22JBA8AJK972H2` |
| Digest | `sha256:47ff670c6cbefc43ff01cc87c2e1387f20f4c21a734b45558e7b4a35b901979e` |
| Git SHA in image | **Unverified** (Fly deployment tag only) |
| Parity vs `main` `b735073b` worker logic | **PASS** — no ranking / qualification behavior delta in the worker Docker COPY set; redeploy **not required** for scanner logic |

## Vercel SPA (2026-10-24)

| Field | Value |
| --- | --- |
| GitHub `main` | **`88de0ae8`** — PR **#171** (security V2 + continuity) **merged**; Vercel production deploy **succeeded** |
| Production manifest | `{"js":"/assets/index-Drz78K0e.js","css":"/assets/index-lw4f8LSH.css"}` (read from `https://stocksist.com/asset-manifest.json`) |
| Git SHA on manifest | **None** — hash change indicates deploy; does not prove commit alone |

## Open PR (GitHub)

| PR | Branch | State | Notes |
| --- | --- | --- | --- |
| Batch 171 | `cursor/batch171-security-performance-v2` | **OPEN** (after push) | Security V2 + public lazy routes + backlog reset docs |

## Scanner live-market acceptance V1

Contract report: `docs/release/scanner-live-market-acceptance-v1.md`. Polygon volume fix on **`main`** (`58aed1b1`, ISS-020). **Full RTH acceptance pending** Monday 2026-10-26 ET per `docs/release/monday-scanner-acceptance-2026-10-26.md`.

## Scanner + catalyst integration V1

Merged to `main` as **`ce68e0d8`** (PR #167).

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
| Tracker | **ISS-015** remains open until Lovable Cloud deploy and verification pass |

**Unblock (Lovable Cloud):** follow `docs/release/edge-function-release-lovable.md`. Record the current production `chat` **version id** (not git SHA alone) for rollback, confirm required secrets exist, then deploy **`chat` only** from approved source **`10723434`** with no source edits. Roll back by redeploying the saved previous revision through Lovable Cloud.

## Lovable integration branch sync (2026-10-24)

| Field | Value |
| --- | --- |
| Branch | `cursor/lovable-sync-from-main-20261024` |
| Integration tip (pre–forward merge) | `bf67bc38` — contains `main` through `10723434` plus Lovable-generated `bun.lock` |
| After PR #165 | `main` at `9e1a9538`; forward-merge `main` into the integration branch after continuity docs land |
| AI Analyst V2 in integration branch | **Confirmed** — `analyst-intelligence-delivery.ts` and `_shared/ai-analyst` recovery modules |

## Confirmed this session

| Surface | Observation |
| --- | --- |
| GitHub `main` | `9e1a95388557456f4ca33404bb53eced0cd6d9ae` — PR #165 Lovable Cloud Supabase ownership (merged 2026-10-24). Includes PR #164 AI Analyst catalyst recovery at `10723434`. |
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
| `cursor/lovable-sync-from-main-20261024` | Active integration branch. Forward-merge `main` after each ownership or continuity doc merge; carries Lovable-generated files (e.g. `bun.lock`) plus `main` application source. |
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
