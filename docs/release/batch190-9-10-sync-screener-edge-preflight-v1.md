# Batch 190.9 + 190.10 — Combined `sync-screener-data` Edge preflight (Lovable Cloud)

**Date:** 2026-11-01 (Sunday ET)  
**Issue:** ISS-034 (P0 OPEN)  
**Scope:** Git forward-sync + documentation only. **No Edge deploy, migration apply, cron, secrets, scanner invoke, or production writes from Cursor.**

## Git identity (verified)

| Item | SHA / state |
| --- | --- |
| GitHub `main` (authoritative application source) | **`ed4fbd8d7dc2722d89bc36320095ec87c31bc3e9`** (PR **#204** merge) |
| PR **#202** (continuity docs) | **MERGED** → **`56816bd54778541fff3ec5fb076f03cf5e73dd75`** |
| PR **#203** (Batch **190.9** weekend session) | **MERGED** → **`f74b7c83c332fad8e1109c69fe3f877b7a533ee1`** |
| PR **#204** (Batch **190.10** publication integrity) | **MERGED** → **`ed4fbd8d7dc2722d89bc36320095ec87c31bc3e9`** |
| Lovable integration `cursor/lovable-sync-from-main-20261024` (after forward-sync) | **`b7a76d9a34a9fc2418d3ec6e483945fe0745c9f7`** |
| Prior integration tip (Batch **190.8** deploy source) | **`f8e2fda698c473519d4ddb40f06f04ad6f13c4d6`** |

Forward-sync merge: **`f8e2fda6`…`b7a76d9a`** — merges `main` **`ed4fbd8d`** into integration while retaining Lovable-only artifacts (migrations **0058–0065**, `bun.lock`, generated `mcp/index.ts`, integration `handler_test.ts` deltas vs `main`). **Do not merge the integration branch into `main`.**

## Production Edge (unchanged this preflight)

| Item | Value |
| --- | --- |
| Live function | **`sync-screener-data` only** (Batch **190.8** behavior) |
| Deploy window (owner-reported) | **2026-10-30 23:54:35–23:54:46 UTC** |
| Integration source at deploy | **`f8e2fda698c473519d4ddb40f06f04ad6f13c4d6`** |
| Lovable submitted source SHA-256 | **`7bf8c45d9c26ff021693624f21f878e90c3193d4f16dbb92fd59123ae39c32d6`** |
| Platform Edge revision ID | **Unreported** — no exact previous revision or downloadable bundle from Lovable in repo records |
| Approved Git-snapshot rollback fallback (Batch **190.7**) | **`2691424bbfa89b4da9a3ca9a832c007606b5a582`** — redeploy from source, **not** binary-equivalent to live **190.8** |

**Rollback capability:** Per `docs/release/edge-function-release-lovable.md`, automated Cursor capture of a redeployable Edge revision is **unavailable**. The historical owner-approved Git-snapshot exception for **`2691424b…`** does **not** automatically authorize replacing live **190.8** with **190.9+190.10**. Owner must either capture Lovable “before replacement” revision metadata for **`7bf8c45d…`** / current live function, or explicitly accept Git-snapshot-only rollback risk for this release.

## Transitive runtime source (`sync-screener-data`)

Computed locally from `supabase/functions/sync-screener-data/index.ts` by BFS over relative imports under `supabase/functions/**` (see `scripts/ops/sync-screener-edge-fingerprint.mjs`). This is **git provenance**, not a guarantee of Lovable’s submitted-source hash algorithm.

| Integration tip | File count | Git transitive closure SHA-256 |
| --- | ---: | --- |
| **`b7a76d9a`** (190.9+190.10 forward-sync) | **53** | **`2fdfeaa5f8512cb9a06dd9568551c562edb75c0ce8b29414cc1f243a1998daed`** |
| **`f8e2fda6`** (live **190.8** deploy source) | **53** | **`05497eb285e1b088a8dadab8bfb1efad12ea1422c2027d5e3add487f2af07809`** |

**Do not conflate** the git closure SHA-256 with Lovable’s **`7bf8c45d…`** (190.8) or historical **37-file** closure from PR **#194**. After deploy, record whatever SHA-256 Lovable reports for the new submission.

## Operational context (ISS-034)

- **Gate 4** on Batch **190.8** Edge: **passed 2026-10-31 01:08 UTC** (three consecutive six-tab publications). That result stands.
- **Last successful publication:** **2026-10-31 03:20:02 UTC**, **110** rows, six tabs.
- **Regression:** From **03:25 UTC** through **~21:35 UTC** on **2026-10-31**: **164** `http_409` failed generations (7/7 chunks, no publication markers) and **54** `prior_generation_retained` aborts; null-calendar weekend misclassification documented in PR **#203**.
- **Sunday 2026-11-01:** Production Edge remains **190.8**; feed still stale relative to last success (**03:20:02 UTC**). No new production acceptance in this preflight (read-only; no live DB query this session). **Monday 2026-11-02** production acceptance is **pending** after an approved Lovable deploy of **190.9+190.10**.

## Lovable Cloud deploy instruction (owner executor — **NOT RUN**)

Follow `docs/release/edge-function-release-lovable.md` **Before replacement** first.

1. **Project:** Lovable Cloud managed Supabase **`zcjptaolpumhtlwhlemq`**.
2. **Git source:** Sync / publish from branch **`cursor/lovable-sync-from-main-20261024`** at commit **`b7a76d9a34a9fc2418d3ec6e483945fe0745c9f7`** (must contain **`ed4fbd8d`** application commits via forward-sync).
3. **Deploy scope:** **`sync-screener-data` ONLY**. Do not deploy other Edge functions, change secrets, cron job 25, or apply migrations unless a separate approved batch says so (staging RPC migrations on the integration branch are **not** part of this Edge-only instruction).
4. **Record after deploy:** Platform version id (if shown), deploy timestamp, Lovable-reported submitted source SHA-256, operator — append to `docs/DEPLOYMENT_STATUS.md`.
5. **Post-deploy acceptance (Monday 2026-11-02):** Runbook criteria in `docs/release/batch190-10-scanner-publish-integrity-v1.md` plus Gate 4-style naturally scheduled six-tab publications. Do **not** manually invoke the scanner from Cursor unless explicitly approved.

## Release-readiness decision (preflight)

| Gate | Result |
| --- | --- |
| Git: **#202**, **#203**, **#204** merged; corrections on `main` | **PASS** |
| Integration forward-sync includes full `sync-screener-data` transitive runtime | **PASS** @ **`b7a76d9a`** |
| Lovable exact previous revision / bundle recoverable | **FAIL** (unreported) |
| Historical **190.7** Git rollback auto-authorizes this release | **NO** |
| Production Edge updated | **NO** (still **190.8**) |

**Decision:** **READY FOR OWNER-EXECUTED LOVABLE DEPLOY** of **`sync-screener-data` only** from integration **`b7a76d9a`**, **conditional** on completing **Before replacement** in `edge-function-release-lovable.md` (capture live **190.8** rollback pointer or explicit owner acceptance of Git-snapshot-only rollback). **ISS-034** stays **P0 OPEN** until **Monday 2026-11-02** acceptance after deploy.
