> **Current production snapshot (2026-10-31, Batch 190.8 Gate 4 then regression):** Gate 4 **passed 01:08 UTC** (three consecutive six-tab publications; that acceptance stands). Last successful publication **03:20:02 UTC**, 110 rows, six tabs. From **03:25 UTC** to about **21:35 UTC**: **164** `http_409` failed generations (7/7 chunks, no publication markers) and **54** `prior_generation_retained` aborts. Cron job 25 remained active. Weekend correction PR **#203** (`833d16e5`) is not merged and not deployed. ISS-034 P0 OPEN. The 23:55 UTC paragraph below is the pre-acceptance snapshot.

> **Pre-acceptance snapshot (2026-10-30 23:55:40 UTC, Batch 190.8):** Batch 190.8 PR #201 merged into GitHub main b720106771950b7ed90c81d53f3ce2f196e35c49; Lovable forward-sync f8e2fda698c473519d4ddb40f06f04ad6f13c4d6. Owner authorized Git-snapshot-only rollback exception (exact previous Edge revision unavailable). Lovable Cloud reported one successful sync-screener-data-only Edge deployment 2026-10-30 23:54:35–23:54:46 UTC, submitted source SHA-256 7bf8c45d9c26ff021693624f21f878e90c3193d4f16dbb92fd59123ae39c32d6; deployed revision ID unavailable. Rollback source: last approved Batch 190.7 Lovable integration commit 2691424bbfa89b4da9a3ca9a832c007606b5a582, requiring a new source deploy to restore (not exact binary). Read-only 23:55:40 UTC: cron 25 still active */5; old 23:45 job still finalizing with build_rows:internal_error, 23:55 cron DO not a new publish; current six-tab feed unchanged at 20:10:02 UTC / 108 rows / one run / zero duplicate symbols or missing provider timestamps. Gate 4 = PENDING 0/3 new naturally scheduled publications. ISS-034 remains P0 OPEN; no migrations/cron/secrets/frontend/other Edge touched.

> **Previous production snapshot (2026-10-30, Batch 190.7 Gate 4):** GitHub `main` **`07172bd65c385398f38cb736935c9c65896ce7d0`**. Lovable integration **`cursor/lovable-sync-from-main-20261024`** @ **`2691424bbfa89b4da9a3ca9a832c007606b5a582`**. Batch 190.7 CAS migration 67 applied; `sync-screener-data` deployed once before 21:00:50 UTC, submitted source SHA-256 `f96a2b79cf4d375766dfbed005f2adede394c0e1d41c00a819260b772950122e`, running revision unreported. **Gate 4 FAILED**: postdeploy generations 21:15, 21:45, 22:15, 22:45 UTC all completed 7/7 chunks then `finalize_failed:build_rows:internal_error`. Last good publish 20:10:02 UTC, 108 rows. Cron 25 active every five minutes. Draft PR #201 / Batch 190.8 is Git-only and NOT merged, forward-synced or deployed. ISS-034 P0 OPEN. Existing historical sections below remain historical; Vercel/Fly status not rechecked.

 > **Historical production snapshot (2026-10-28, Master Continuity Sync V4):** GitHub `main` **`1398d16ad0041c34661e4bc76487c5a3757c207e`**. Lovable integration **`cursor/lovable-sync-from-main-20261024`** @ **`04da6d7f87994c93a0c5fc64492654df2424fe0b`**. **`sync-screener-data`** PR **#194** deployed **2026-10-28 17:29:52 UTC**; publication **failed** at **17:30** and **17:35 UTC** (**CPU Time exceeded**). Latest confirmed DB generation **16:15:04.456 UTC** (`sync_run_id` **`d3b3cd1b-42de-4c93-8170-9fd036c41f4e`**, **108** rows). Vercel/Fly/live Edge revision matrix for every function **not fully re-queried** this cycle. Sections below marked **historical** are preserved records, not current state.

# Deployment status

**Supabase production is managed in Lovable Cloud** (project `zcjptaolpumhtlwhlemq`). Edge deploy safety: `docs/release/edge-function-release-lovable.md`. **Git SHA on `main` is not the live Supabase Edge revision** until Lovable Cloud records a deploy.

## Current — GitHub and Lovable integration (2026-10-28)

| Field | Value |
| --- | --- |
| GitHub `main` HEAD | **`1398d16ad0041c34661e4bc76487c5a3757c207e`** — PR **#194** merged |
| Lovable integration branch | `cursor/lovable-sync-from-main-20261024` |
| Lovable integration tip | **`04da6d7f87994c93a0c5fc64492654df2424fe0b`** |
| PR **#174** | **CLOSED** — not merged (superseded) |

## Current — `sync-screener-data` (Lovable Cloud, owner-reported)

| Field | Value |
| --- | --- |
| Function | `sync-screener-data` |
| Cron job **25** | Active (`*/5 * * * *`) — invoke ≠ successful publish |
| **PR #193** D1 deploy | Source fingerprint SHA-256 **`23980c312052a4cb5de5be12e3a32b178e1d1fa8104c39f384e02f13845e6f03`** |
| **PR #194** deploy time | **2026-10-28 17:29:52 UTC** (only this function redeployed in this step) |
| PR **#194** submitted source SHA-256 | **`cfd9032b5d8c724bea5889a0e9888395219e0815626c2895bf1cdc705a2cc3af`** |
| PR **#194** 37-file runtime closure SHA-256 | **`c3a70628e6af107d10c73026b79e21850bf21f2b03427e700c859cdfcdb8a167`** |
| Edge function revision id (post-#194) | **Not reported** — do not invent |
| Post-deploy failures | **17:30 UTC** — 13,262 evaluated, 10 qualified, **CPU Time exceeded** ~17:30:07; **17:35 UTC** — 13,262 / 9 qualified, **CPU Time exceeded** ~17:35:05 |
| Last **confirmed** DB publication | `synced_at` **2026-10-28T16:15:04.456Z**; `sync_run_id` **`d3b3cd1b-42de-4c93-8170-9fd036c41f4e`**; **108** rows; six tab counts consistent with persisted generation |
| D1 premarket live acceptance | **Pending** — deploy ≠ timed ET window sign-off |
| Emergency rollback candidate (pre-D1 git) | `680925181d1f7ea768ccc5f5b3201fde10c7b411` — **not** exact deployed-version restore; reintroduces ISS-033; not default for Batch **190** rollout |

**Do not conflate** the two PR #194 SHA-256 values (submitted source vs 37-file closure) with each other or with git merge commit `1398d16a`.

## Current — other surfaces (partially unknown)

| Surface | Status |
| --- | --- |
| Vercel SPA @ Batch **189** merge `68092518` | Deploy **SUCCESS** reported; manifest **no git SHA** — not re-probed for `1398d16a` |
| Batch **187** earnings Edge functions | Activation **NOT APPLIED** — revision ids **UNKNOWN** (master batch **194**) |
| **`chat` Edge (ISS-015)** | **BLOCKED** — rollback revision **UNKNOWN** (master batch **204**) |
| Fly `stocksist-radar-v22-worker` v45 | Historical parity **PASS** (2026-10-24) — see historical section |

---

## Historical — GitHub `main` (2026-10-26)

| Field | Value |
| --- | --- |
| HEAD | **`13a018a9eab70d0a8f75d51bce790b94ebd8e98f`** |
| Last merge | PR **#183** — Batch 174/175 Monday acceptance docs |

## Historical — Open PR snapshot (2026-10-26)

| PR | Branch | State | Notes |
| --- | --- | --- | --- |
| **#174** | `cursor/batch174-monday-scanner-acceptance` | Was **OPEN**, **CONFLICTING** | **Superseded — closed without merge** as of Master Reset V3 |

## Historical — Vercel SPA (2026-10-26 ~17:00 ET)

| Field | Value |
| --- | --- |
| Production manifest js | **`/assets/index-BD3GjFFl.js`** |
| Git SHA on manifest | **None** — parity by hash only |

## Historical — Fly `stocksist-radar-v22-worker` (read-only parity, 2026-10-24)

| Field | Value |
| --- | --- |
| Release | **v45** (complete, 2026-10-20T13:42:08Z) |
| Image tag | `registry.fly.io/stocksist-radar-v22-worker:deployment-01M5CRQST4MR22JBA8AJK972H2` |
| Digest | `sha256:47ff670c6cbefc43ff01cc87c2e1387f20f4c21a734b45558e7b4a35b901979e` |
| Git SHA in image | **Unverified** (Fly deployment tag only) |
| Parity vs `main` `b735073b` worker logic | **PASS** — no ranking / qualification behavior delta in the worker Docker COPY set; redeploy **not required** for scanner logic |

## Historical — Vercel SPA (2026-10-24)

| Field | Value |
| --- | --- |
| GitHub `main` | **`88de0ae8`** — PR **#171** (security V2 + continuity) **merged**; Vercel production deploy **succeeded** |
| Production manifest | `{"js":"/assets/index-Drz78K0e.js","css":"/assets/index-lw4f8LSH.css"}` (read from `https://stocksist.com/asset-manifest.json`) |
| Git SHA on manifest | **None** — hash change indicates deploy; does not prove commit alone |

## Historical — Scanner live-market acceptance V1

Contract report: `docs/release/scanner-live-market-acceptance-v1.md`. Polygon volume fix on **`main`** (`58aed1b1`, ISS-020). **Full RTH acceptance pending** Monday 2026-10-26 ET per `docs/release/monday-scanner-acceptance-2026-10-26.md`.

## Historical — Scanner + catalyst integration V1

Merged to `main` as **`ce68e0d8`** (PR #167).

## Historical — AI Analyst V2 — `chat` Edge activation (2026-10-24)

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

## Historical — Lovable integration branch sync (2026-10-25)

| Field | Value |
| --- | --- |
| Branch | `cursor/lovable-sync-from-main-20261024` |
| Tip (after Batch 177 forward-merge) | **`e4801e81cd963ec89a9d5dabd5d3058e01ef7f8d`** — merges `main` **`788b1b93`** into prior **`0ec161bd`** |
| Parity vs `main` | **PASS** — only `bun.lock` differs (Lovable-generated) |
| Publish | **Not performed** from Cursor |

## Historical — Confirmed session (2026-10-24)

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
| `cursor/lovable-sync-from-main-20261024` | Active integration branch. Forward-merge `main` after each ownership or continuity doc merge; carries Lovable-generated files (e.g. `bun.lock`) plus `main` application source. **Current tip:** **`04da6d7f`** (2026-10-28). |
| `cursor/chat-single-pass-v1` | Archived recovery source for the analyst commits. Those commits are cherry-picked onto the catalyst evidence recovery. The branch itself was not merged. Its older divergence from `main` is not a current production or Lovable synchronization problem. |

Lovable was not opened in the Oct 28 docs sync session. Preview hosts remain preview.

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
