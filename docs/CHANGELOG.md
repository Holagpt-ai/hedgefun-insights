# Changelog

## 2026-11-12 (Batch 226 — Penny persistence review corrections, PR #244)

- Hardened pair-scoped read RPC (1–64 projections), fail-closed upsert validation, `live_market` + `next_session_carry` window parity, read-projection version gates, Postgres regressions + `deno.lock` refresh. **No production activation.**

## 2026-11-12 (Batch 226 — Penny persistence & read V1, PR pending)

- Migration `penny_continuation_workflow_handoffs` + idempotent service-role upsert with stale-generation fencing, revoke/expire RPCs, pair-scoped authenticated `list_active`. Capture + radar-bridge handlers + client read/map adapters. **No SQL apply, Edge deploy, publisher, or UI hook.**

## 2026-11-11 (Batch 225 — workflow handoff badge integrity, PR #242)

- Stale/session-conflict rejection in projection; badge symbol/date/model validation in matcher; Penny navigation without stale session-storage `securityId`. Deno 6 + Vitest 13.

## 2026-11-11 (Batch 225 — Penny Continuation workflow handoff V1)

- Versioned projection from Batch 224 integration → AM Inbox workflow handoffs (`penny_continuation_workflow_handoff_v1`); client `matchPennyContinuationBadgesToAmInbox`. **No persistence, UI wiring, or production activation.**

## 2026-11-11 (Batch 224 merged — Penny Continuation integration, PR #241)

- Merged at **`74960a51e590d2c363213cd806643783c873db4b`** on `main` **`8b7082e0a8bef24aa9ccdc5c6ca2fa70473042a2`**. Alignment + 10m velocity provenance; **not production-activated.**

## 2026-11-11 (Batch 224 — Penny Continuation integration corrections, PR #241)

- 10m velocity only via `verifiedSharesPerMinute10m`; Radar 5m diagnostic-only. Symbol/session alignment, Radar–Polygon observation sync, rejection of session-kind overrides. Deno **19** integration tests.

## 2026-11-11 (Batch 224 — Penny Continuation controlled backend integration V1)

- Bounded integration layer `penny_continuation_integration_v1`: Polygon + Radar V2.2 adapter, `evaluateBoundedPennyContinuationV1`, optional AM Inbox badges. Deno `batch224-penny-continuation-integration_test.ts`. Batch 223 PR **#240** on `main` — **no production activation, Edge, or SQL.**

## 2026-11-11 (Batch 223 — Penny Continuation safety corrections, PR #240)

- Removed qualification result cache; fresh evaluation every call; `publicationSuppressed` vs `continuationQualified`; CS1 requires verified `velocityWindows`; strict dual generation sync. Deno **26** tests.

## 2026-11-11 (Batch 223 — Penny Continuation backend engine V1, review corrections)

- Hardened lifecycle cache (expiry revalidation, session prune, bounded entries); publication cooldown separated from qualification; eligibility integrity (volume/move/dollar cross-check); freshness generation evidence + future skew; CS1 window session order + CS3 negative HOD. Deno **21** tests. **No live integration.**

## 2026-11-11 (Batch 223 — Penny Continuation backend engine V1)

- Shared evaluator `penny_continuation_v1`: eligibility, CS1–CS5 / 3-of-5, per-symbol freshness (Batch 222), volume-first ranking, cooldown/idempotency, AM Inbox badge payload type. Deno: `batch223-penny-continuation_test.ts`. **No live integration, SQL, or deploy.**

## 2026-11-11 (Batch 222 — Penny Continuation freshness contract correction, PR #239)

- §4.1: per-symbol freshness (no `max(symbol, generation)`); verified expected provider delay + 120s slack; live vs delayed policies; fixtures F16–F20.

## 2026-11-11 (Batch 222 — Penny Continuation eligibility and scoring contract V1, finalized)

- Design contract `docs/release/batch222-penny-continuation-eligibility-scoring-v1.md`: sub-$1 momentum-continuation engine (`penny_continuation_v1`) distinct from penny Radar panel and price-agnostic Continuation V1; provider-watermark freshness (120s) and honest delay labels; reconciled price band; CS1–CS5 **3-of-5** continuation counting; long-bias move gate; spread-unknown behavior; reproducible fixtures; AM Inbox badge recommendation; Five Pillars auto-inclusion disabled. All thresholds **PROPOSED — NOT APPROVED**. Documentation only — **no implementation or deploy** (PR **#239**).

## 2026-11-11 (Batch 221 — Overnight scanner backend pipeline V1)

- Backend overnight observation/volume semantics for 23×5-ready scanner (`session-volume.ts`, `session-sync-context.ts`, `resolveOvernightCycleAt`, handler observation gate). Qualification gates overnight stamps behind pipeline readiness and sync-window boundaries; `OVERNIGHT_PROVIDER_SESSION_VOLUME_VERIFIED` stays **false**. `OVERNIGHT_SCANNER_PIPELINE_READY` remains **false**. Runbook `docs/release/batch221-overnight-scanner-pipeline-v1.md`. **Not deployed.**

## 2026-11-11 (Batch 220 — Catalyst + Watchlist loading performance V1)

- Watchlist: decouple symbol-list loading from analysis and request-status queries (`isListLoading`); rows render with honest per-row pending/failure states.
- Catalyst: initial feed spinner only on first `catalyst_events` fetch (no cross-ticker `placeholderData`); symbol-scoped feed guard on `?symbol=` navigation; stable historical-enrichment cache key (sorted symbol set, 24-cap unchanged); in-flight enrichment cleared on cancel so symbols are not stuck loading; minute-bucket `sessionNowMs` for sort/session labels.
- Vitest: `watchlist-loading-state`, `batch220-loading-performance`. Frontend only — **not deployed**.

## 2026-11-11 (Batch 219.3B — NHL baseline UI truth-state, ISS-045)

- Stop mapping NHL `generation_unavailable` to **Baseline unavailable** when feed `nhl_baseline_status` is still `available` (session gate / validation failures).
- Vitest: `screener-truth-state`, `screener-session`. Frontend only — **not deployed**. ISS-045 **OPEN** until Vercel acceptance.

## 2026-11-11 (Batch 219.3A — Fly worker deploy, ISS-044)

- Owner-authorized Fly deploy: `stocksist-radar-v22-worker` **v48** from `main` **`dc9305f`** (closed-session park flush worker fix). Rollback **v47** `deployment-01M73Z9VFR2SQ97S92HS9B06XX`. Post-deploy V2 `publish_candidates_v2` advancing in sampled logs. **ISS-044 OPEN** pending weekday 20:00 ET closed-snapshot acceptance.

## 2026-11-11 (Batch 219.3A — closed-session snapshot recovery, ISS-044)

- Worker: capture last live V2 view as `preParkFlush` on `park_closed`; `publishRadarV2ClosedParkIfNeeded` flushes then empty closed with a newer generation/`synced_at` fence; skip empty `soft_rth_ah` candidate wipes (pending non-session events still flush).
- Deno regressions in `persist_v2_test.ts`. No SQL/cron/deploy. ISS-044 remains **OPEN** until production closed-session acceptance. Runbook `docs/release/batch219-radar-v2-recovery-v1.md`.

## 2026-11-10 (Batch 219.2 — Radar V2 closed-session snapshot integrity, ISS-044)

- Same pending RPC `20261110193000`: closed-session snapshot copy uses **named columns** instead of `SELECT c.*`. Production physical order diverges (candidates col 48 `promotion_reason` vs snapshot col 48 `snapshot_kind`); positional insert aborted closed/carryover copies (both tables empty). Cross-date 219.1 delete-before-insert preserved.
- Postgres tests: AH → closed park, participation field copy, `snapshot_kind`/`captured_at`, V2 timestamp/session transition, next-date carryover archive, failed-tx retention. **Not applied.**

## 2026-11-10 (Batch 219.1 — Radar V2 cross-date candidate replace, ISS-044)

- Migration `20261110193000_radar_v22_cross_date_candidate_delete_v1.sql`: delete prior `trading_date` rows **before** INSERT under global `(symbol)` PK (fixes 23505 class failures on surveillance date advance).
- Postgres regression `batch219-cross-date-replace-postgres_test.ts`; CI bootstrap `scripts/supabase/radar-v22-pg-test-setup.mjs`. **Not applied** to production.

## 2026-11-10 (Batch 219 — Radar V2 publication recovery, ISS-044)

- **Fly worker:** any RPC `applied: false` fails closed; churn **`skipped`** no longer clears persist-failure telemetry when V2 is enabled.
- **Operations:** V2 freshness uses **~120 s** publication cadence (no 15-minute provider allowance on `v2_synced_at`); session alignment checks unchanged.
- **Production (read-only Fly):** V2 attempts active; sample failures **`23505`** / 502 — **`stale_generation` not observed in logs**; worker **v46** predates PR. Runbook updated.
- Tests: Deno `persist_v2_test` / `run-health_test`; Vitest ops control center. Runbook `docs/release/batch219-radar-v2-recovery-v1.md`. **No deploy.** ISS-044 **OPEN** until Fly + Vercel acceptance.

## 2026-11-10 (Batch 191 — scanner acceptance, ledger attestation update on PR #233)

- **Documentation-only** (PR **#233** revision): owner-verified **`screener_sync_generation_jobs`** via **read-only Lovable Cloud** (not anon REST). ET session publication/abort totals Nov **6/9/10**; Nov **10** RTH-to-1:30 **43** pubs, all **7/7** + publish RPC; feed **107** rows, tabs **`evaluated`**. Distinct layers: ledger vs per-job tab evidence vs UI. **Nov 10 AH not accepted.** **ISS-034** / **ISS-024** **OPEN**. Runbook `docs/release/batch191-scanner-acceptance-v1.md`.

## 2026-11-10 (Batch 218 — ISS-034 root-cause verification & closure gate)

- **Documentation-only** reconciliation for **ISS-034** (evidence corrected on PR #232). Nov 9 **09:30 `http_546`:** resource limit confirmed; finalize **stage** / **CPU** **NOT VERIFIED**. Nov 10 **09:30:** aborted — **mechanism NOT conclusively established** (null `abort_reason` / `abort_evidence`; last `finalize_stage:claim_finalize_lease`). **09:45–09:55:** **confirmed `prior_generation_retained`**. Gappers unresolved **3→0** supports transient incomplete gap inputs without symbol-level provider proof; **09:45** Gainers/Losers prerequisite status in abort evidence **≠** verified provider failure. Nov 10 **10:00–12:35:** **32** consecutive publications, **106** rows. **ISS-034 OPEN**; **ISS-044** follow-up only. Runbook `docs/release/batch218-iss034-root-cause-closure-gate-v1.md`. **No** Edge/SQL/cron/deploy.

## 2026-11-09 (Batch 217 — AM Inbox production readiness)

- ISS-025 gate for the November 9 production load: 3,776 active late-session rows / 1,525 symbols (~4.1 MB). Synthetic fixture reproduces map+build in **~424 ms** under the existing 8 s bound. Adds missing symbol-aware **Screeners** handoff on continuation cards (Catalyst / Watchlist / AI Analyst / Journal / Action Center already present). Ranking, qualification, RPCs, and candidate limits unchanged. Runbook `docs/release/batch217-am-inbox-production-readiness-v1.md`. Authenticated UI acceptance still **NOT VERIFIED**.
- Continuity: owner-reported **Batches 215 and 216 Lovable Cloud Edge deployment completed** after PR #227 / #229 merge. Closed-session observation for ISS-043 and finalize-stage production correlation for ISS-034 remain open.

## 2026-11-09 (Batch 216.2 — operations marker compatibility)

- Operations Control Center treats standalone `finalize_stage:<stage>` as diagnostic progress, not a runtime failure. `http_546:finalize_stage:<stage>` remains an HTTP 546 Edge resource-limit failure with the stage kept in the message. Frontend classification only. Merged with Batch 216 as PR #229 → `17a31da8`; Edge deploy later owner-reported complete.

## 2026-11-09 (Batch 216.1 — finalize stage marker safety)

- Hardens PR #229: `noteFinalizeStage` is one conditional PostgREST UPDATE (`status` + null/marker `or` filter), so a concurrent real error cannot be overwritten by a stale read. Durable markers are limited to six kill-relevant stages (about six round trips, down from ~18). Successful publication still clears `continue_last_error` only via existing `complete_screener_sync_publish_v1`. Root cause of HTTP 546 remains **NOT YET VERIFIED**. Not deployed.

## 2026-11-09 (Batch 216 — scanner finalization stage marker)

- **ROOT CAUSE NOT YET VERIFIED.** 09:30 ET HTTP 546 killed the finalize isolate before a stage was retained; the parent then stored only `http_546`. Batch 216 writes a bounded `finalize_stage:<stage>` marker and keeps it on that status (`http_546:finalize_stage:<stage>`). Publishing, leases, and session control are unchanged. Not deployed. One-time Lovable source sync to `fee9ab51` succeeded with activation returned to false; automatic sync is not active.

## 2026-11-07 (Batch 215 — unified scanner session control, PR #227)

- **Landed on branch (not merged):** the staged `sync-screener-data` cron no longer starts new generations on weekends, calendar holidays, or weekday nights. Cleanup, reconcile, and in-flight resume are preserved, and `continue`/`finalize` are never gated. The new `_shared/markets/equity-session-control.ts` models the 23×5 schedule (overnight Sun–Thu 21:00–04:00 for the next trading day, the maintenance pause, the weekend) behind disabled-by-default env flags and an overnight-pipeline guard. Futures hours are not used. PR https://github.com/Holagpt-ai/hedgefun-insights/pull/227, code head `01a8d7e3`. **Deployment state checked:** none. **Open:** Lovable Cloud deploy and weekend observation (ISS-043); 23×5 activation prerequisites per the runbook `docs/release/batch215-unified-scanner-session-control-v1.md`.

## 2026-11-07 (Batch 214 — admin access states, PR #226)

- **Landed on branch (not merged):** `AdminGuard` now distinguishes four cases and fails closed in each: no session goes to `/login?next=`; a non-admin sees Access Denied (email and user id); an RPC error shows "Could not verify" with retry; only `true` grants admin. Production bundle verified to include `/admin/operations`. The owner's role is **not verified**. PR https://github.com/Holagpt-ai/hedgefun-insights/pull/226, code head `b9844bf1`. **Deployment state checked:** public production assets only. **Open:** owner role check and grant via Lovable Cloud (`docs/release/batch214-admin-access-states-v1.md`), ISS-042.

## 2026-11-06 (Batch 213 — secure scanner diagnostics RPC, PR #225)

- **Landed on branch (stacked on #224, not merged):** the admin-only, read-only RPC `get_ops_scanner_diagnostics_v1` (migration `supabase/migrations/20261106200000_ops_scanner_diagnostics_read_v1.sql`, **not applied**), wired into `/admin/operations` through `src/lib/ops/diagnostics.ts` and `readScannerDiagnostics`. A Deno Postgres integration test was added to the CI job `Screener Deno regressions`, with simulated Supabase default grants. PR https://github.com/Holagpt-ai/hedgefun-insights/pull/225, code head `ed69dae3`. **Deployment state checked:** none. **Open:** first real-database run is CI on #225; Lovable Cloud apply needs separate approval. Runbook `docs/release/batch213-secure-scanner-diagnostics-v1.md`.

## 2026-11-06 (Batch 212 — Operations Control Center V1, PR #224)

- **Landed on branch (not merged):** `/admin/operations` is a read-only, admin-guarded page. Typed source adapters live in `src/lib/ops/sources.ts` and never throw. Pure classifiers cover status roll-up, session-aware freshness, the scanner tab matrix, job outcomes, CPU vs ordinary runtime failures, the worker checkpoint, source parity vs runtime identity, and redaction. PR https://github.com/Holagpt-ai/hedgefun-insights/pull/224, code head `836bc07c`. **Deployment state checked:** none (local checks only). **Open:** job, lease, and Edge log visibility needs an approved admin read RPC (proposed Batch 213). ISS-041 recorded. Pre-existing MCP bundle drift on `main` noted. Runbook `docs/release/batch212-operations-control-center-v1.md`.

## 2026-11-06 (Batch 211 — continuity + monitoring docs, PR #223)

- **Docs only (no activation / no deploy):** `docs/PROJECT_MEMORY.md` adds **GitHub ↔ Lovable Source Synchronization** (controller, separation from Vercel/Fly/Edge/SQL, recovery, editor SHA independence, monitoring expectations). `docs/DEPLOYMENT_STATUS.md` adds Batch **211** verified-baseline table; per-run history via **GitHub Actions artifacts**. `docs/release/batch211-lovable-source-forward-sync-v1.md` adds **Acceptance criteria**. `docs/ISSUE_REGISTER.md` and `docs/SESSION_HANDOFF.md` align **ISS-040** (open until automatic source sync verified end-to-end).

## 2026-11-06 (Batch 211 — PR #223 security closeout, not activated)

- **PR #223 (branch `cursor/batch211-lovable-forward-sync-v1`):** apply authorization is enforced inside exported `synchronize()` (production pair requires `STOCKSIST_LOVABLE_SYNC_ACTIVATED=true`; disposable `cursor/_batch211_e2e_*` pair requires `STOCKSIST_LOVABLE_SYNC_TEST_MODE=true`). `batch211-github-e2e.mjs` aborts if disposable refs already exist on `origin`, uses a second pair (`*_main_b` / `*_integration_b`) for idempotency so mid-run deletes are not required, deletes only refs this run created, and TEST_4/TEST_6 matrix lines label unit/static vs remote GitHub evidence (workflow text via `git show` from `origin/cursor/batch211-lovable-forward-sync-v1` when the checkout is a disposable main tip; override `STOCKSIST_BATCH211_WORKFLOW_REF`). No activation variable change, no merge, no deploy.

## 2026-11-06 (Batch 211 — source-sync controller PR, not activated)

- **Proposed, not merged/activated:** `.github/workflows/lovable-source-forward-sync.yml` and `scripts/lovable-sync/` add a read-only default GitHub `main` → Lovable integration-branch health check, gated ordinary fast-forward source merge after **separate owner activation**, known-overlay preservation, fail-closed conflict/drift handling, bounded races, and disposable Git fixtures. Output artifacts under `.lovable-sync-verify/`. No production backend, deployment, SQL, cron, Vercel or Fly changes. Runbook `docs/release/batch211-lovable-source-forward-sync-v1.md`; tracking **ISS-040**. Current main `88de3533` includes merged PR #222; integration `3ec5f7cd` contains it. Git sync alone does not close ISS-028/ISS-039.


## 2026-11-06 (Batch 195.1 — issuer headline attribution)

- **Catalyst cards** (PR **#222**, badge **`dad9afac`**, trust-safety **`4f699897`**, not merged): a headline is a direct issuer event only when that company or ticker is the opening subject. Later mentions, including ACAD versus Recursion/Viatris earnings and ORCL versus Arm, stay related-symbol evidence and are not ranked or labeled as that symbol's earnings. Generic tokens such as "pharmaceuticals" and "holdings" no longer match by themselves. The Polygon source badge and the event-category label now share one rule: GlobeNewswire, Business Wire, and the other verified wires display as **Press Release** only for a direct issuer row; Motley Fool, Zacks, and other editorial `company_news` stay **News**. A related or unverified association does not receive those direct-issuer labels. **Trust-safety follow-up:** for non-authoritative providers, missing attribution no longer maps a wire-style source to **Press Release** by default; `CatalystDetailPanel` omits issuer EPS and surprise Market Facts when the row is a related or unverified issuer association. Client and Deno attribution/precedence mirrors updated. The label change is the Vercel frontend bundle. Edge Functions that import the shared attribution code are listed in the runbook and are not deployed from this PR. No migration, production row edit, feed change, cron, Fly, or Vercel operation. Runbook `docs/release/batch195-1-issuer-headline-attribution-v1.md`. **ISS-028** stays **OPEN**.

## 2026-11-06 (Batch 191.1 — Gappers split-scale evidence)

- **Gappers tab evaluation:** **`split_scale_suppressed_count`** accounts for symbols whose gap is **null only** because **`impliesSplitScale(regular, reference)`** fired — no longer inflates **`unresolved_gap_input_count`** or blocks **`evaluated`** when that is the sole remaining class. Helper **`gapSuppressedOnlyBySplitScaleGuard`** in shared `selection.ts`. Staged **`gappersAccum`** + **`deserializeMergedArtifacts`** compatibility (defaults missing counter to 0). Client parser / validated-zero helper updated. Runbook `docs/release/batch191-1-gappers-split-scale-evidence-v1.md`. **Deploy:** **`sync-screener-data`** Edge after merge (**Lovable Cloud**). **ISS-024** / **ISS-034** remain **OPEN**.

## 2026-11-06 (Batch 210 — PR #220 CI dependency fix)

- **`.github/workflows/unified-release-control-verify.yml`:** `actions/setup-node@v4` (Node **24**, npm cache) and **`npm ci --ignore-scripts`** before `ci-verify.mjs` so locked `ajv` deps resolve on a clean checkout.

## 2026-11-06 (Batch 210 — Unified Release Control V1, git-only)

- **Unified Release Control V1** (Batch **210**): JSON Schemas for **release_intent** and append-only **deployment_attestation** (validated with **Ajv** in `scripts/release-control/validate-release-manifest.mjs`); example historical manifest for **Batch 190.16** — **Nov 6 reported** owner checkpoint (**`sync-screener-data`** Edge **v516**, six consecutive natural premarket runs) under `historical_evidence.production_checkpoint_2026_11_06` (`batch210.example.190.16.historical.v1.json`); deterministic Edge import-closure SHA-256 from **git objects only**; `workflow_dispatch` workflow passes **`URC_MANIFEST_PATH`** via `env` with **`permissions: contents: read`** (no shell interpolation of workflow inputs); `ci-verify.mjs` path allowlist; runtime verification stays **UNKNOWN** for manual attestations; append-only integrity check (`git rev-list --count` per file). Node tests `npm run test:release-control`. Runbook `docs/release/batch210-unified-release-control-v1.md`. **ISS-039** tracks gap between git provenance and live platform digests. **ISS-034 OPEN** / **Batch 191** unchanged. **Does not** merge or deploy production.

- **Session recovery note:** uncommitted `src/lib/screeners/screener-radar-intraday-overlay.ts` changes were **reverted** to match `main` — **unrelated** to Batch 210; do not restore without separate review.

## 2026-11-05 (Batch 190.15 documentation closeout)

- **Docs-only continuity** (PR **#218**): records reported **Batch 190.15** production activation (PR **#217** → **`3c810c4b`**), dual migration-ledger facts (Git `supabase/migrations/`, Lovable Drizzle **idx 68**, no `schema_migrations` row), Nov **5** screenshot observations, **ISS-034 OPEN**, PR **#212** / **#215** merged with verification outstanding. No application or deploy changes.

## 2026-11-04 (Batch 190.15 — merged and reported activated)

- **Batch 190.15 / slim staging RPC payloads** (PR **#217** → **`3c810c4b`**, base **`1b7d86d6`**): advance, atomic publish, and publish-record return `control` instead of the full job JSON (~2.35 MB `all_tickers` in staging; ~**8.60 MB** full RPC response reported in production). Claim stays full. Finalize baseline drift reads state identity only. **Reported activation:** Lovable Cloud **`sync-screener-data`** Edge **2026-11-04**; canonical SQL `supabase/migrations/20261104230000_screener_sync_slim_control_json_v1.sql` applied via Lovable Drizzle **ledger idx 68**; **`supabase_migrations.schema_migrations`** has **no** matching version row (record only — do not backfill ledgers). Compact **`control`** ~**407 bytes**. First natural post-migration generation **85** rows, six tabs, **7/7** chunks. Runbook `docs/release/batch190-15-slim-staging-payload-v1.md`. **ISS-034 remains OPEN** pending **Batch 191** RTH/AH acceptance — one successful generation is not permanent CPU proof.

- **Batch 195** Catalyst / Watchlist / Radar issuer-trust acceptance (PR **#212** → **`5d6399de`** merged): Radar recent-news headline gate tightening; runbook `docs/release/batch195-issuer-trust-acceptance-v1.md`. **ISS-028** not closed — authenticated prod **NOT VERIFIED**.

- **ISS-037 / screener free float** (PR **#215** → **`3bd3ee68`** merged): verified free-float display path; runbook `docs/release/batch-iss037-screener-float-enrich-v1.md`. **Production verification NOT VERIFIED** — do not assume Vercel or Edge deploy.

## 2026-11-04 (Batch 190.14 — release-safety revision, in review)

- **Batch 190.14 / CPU-safe staged finalize** (PR **#216**, base **`3bd3ee68`**): Nov **4** production **HTTP 546** on finalize before publish (`sync-screener-data` v506). Release-safety pass: G/L qualify fast-path + chunk `volumeActive` for extended evidence; `build_evidence` stage; finalize stage **enter/exit** logs; **await** day-trade qualification capture after `completePublish`. Final corrections: session fixtures 07:35 / 12:45 / 16:20 ET asserted with `resolveSyncSessionKind`; RPC timing serializes representative rows and evidence; rollback source is git **`3bd3ee68`** (not a promised Edge revision id). Lovable Edge CPU constraint and post-launch Fly contingency recorded in `docs/PROJECT_MEMORY.md`. **190.12 SQL and 190.13 cron normalization already deployed — do not reapply.** Runbook `docs/release/batch190-14-cpu-safe-finalize-v1.md`. Merged as **`1b7d86d6`**. Edge deploy of that revision is separate from Batch 190.15.

Application history below is a map of `main`, not a claim that each merge was deployed. Deploy facts belong in `docs/DEPLOYMENT_STATUS.md`.

## Documentation-only continuity reconciliation (2026-10-27)

- PR **#185** merged at **`4757b9de`**: Master Reset V3 + continuity (`master-reset-2026-10-27.md`). PR **#184** docs at **`e65746ab`**; PR **#174** closed without merge. October 27 observations in issue register; no production deploy implied.

## Unreleased

- **Batch 190.13** Cron `{}` body normalization (PR **#214** → **`2edaabfc`** merged): production pg_cron `{}` normalized to `{ action: "cron" }`. Runbook `docs/release/batch190-13-cron-body-normalize-v1.md`. **Reported deployed** with Batch **190.12** — do not reapply.

- **Batch 190.12** Stale finalizing recovery (PR **#213** → **`fce9b95b`** merged): migration `20261104120000` + `reconcile_screener_sync_staged_publish_v1`. Runbook `docs/release/batch190-12-stale-finalizing-recovery-v1.md`. **Reported deployed** Lovable Cloud — do not reapply.

- **Batch 196.2** Day Trade / scanner presentation parity (PR **#211** → **`0db6063f`** merged): status rail reports distinct momentum-qualified vs full Five Pillars (freshness-inclusive) counts; Unusual Volume row evidence names prior-session ≥4× vs time-adjusted RVOL ≥2× without mislabeling; focused Vitest regressions; **ISS-037** (screener free-float **NOT VERIFIED**).

- **Batch 196.1** Scanner numerical integrity & volume provenance (PR **#209** → **`797cc615`** merged). Fly `stocksist-radar-v22-worker` **v46** deployed 2026-11-04 (`deployment-01M6K5GH34NZCA1C5Y45AWPVHZ`, digest `sha256:9f29e7cd2c13b6acb306b153e3468f86edf348794e492c5e4d7dad17abfbee47`). Rollback image remains v45 `deployment-01M5CRQST4MR22JBA8AJK972H2`. Runbook `docs/release/batch196-1-scanner-numerical-integrity-v1.md`. Live acceleration-value acceptance **NOT VERIFIED**. **ISS-034** unchanged.

- **Batch 192** AM Inbox metadata + AI Brief evidence cutoff (PR **#208** → **`f1f0121b`** merged): strip internal `__RVOL_*` labels from continuation UI; bound AM headline/direct-catalyst evidence to `source_checked_at` (missing or invalid `published_at` fail closed for direct catalysts; before-open earnings unchanged); tighten initial late-session loading gate. Cached AM brief rows are served unchanged until material regeneration — no production data reset. Runbook `docs/release/batch192-am-inbox-ai-brief-integrity-v1.md`. **Vercel production and Lovable Cloud `generate-daily-brief` Edge deploy reported complete** for Batch 192 scope. **ISS-025** visual acceptance still **NOT VERIFIED**.

- **Batch 191** Scanner release acceptance + continuity synchronization (docs-only, PR **#207** → **`a5df10d8`**): continuity docs and master backlog synchronized to GitHub `main` `7e456ace`, reported Nov 1 deployment/integration source `ccb4055b3f8b84c46fa38529844150c140638705`, and Nov 2 naturally scheduled premarket PASS evidence (seven consecutive successful publications; latest row counts 60/62/63; no new recorded `http_409` in that window). **ISS-034 remains OPEN** pending regular-session and after-hours acceptance.

- **Batch 190.11** Staged publish RPC diagnostics (PR **#206**, branch `cursor/iss-034-publish-error-surface-19c6`): Edge `formatStagedPublishRpcTransportFailure` sanitizes PostgREST `code` / `message` / `details` into bounded `failJob` reasons; **no SQL migration** (preserves publish RPC transaction rollback). Stacks on Batch **190.10**. **Merged on `main`; November 1 `sync-screener-data` deployment is reported complete** (deployment source `ccb4055b3f8b84c46fa38529844150c140638705`). **ISS-034 P0 OPEN.**

- **Batch 190.10** Scanner publication integrity + HTTP 409 root-cause preservation (PR **#204** → **`ed4fbd8d`**): Day Trade Radar publish-eligible volume/ratio filter before volume-first top-20; continuation error overwrite fix. Runbook `docs/release/batch190-10-scanner-publish-integrity-v1.md`. **Merged to `main`; included in the reported November 1 `sync-screener-data` deployment source** (`ccb4055b3f8b84c46fa38529844150c140638705`). **ISS-034 P0 OPEN.**

- **Batch 190.7** Staged finalization exception recovery (PR **#200**): allowlisted finalize diagnostics, atomic CAS lease release RPC **`20261030220000`**, uncertain `http_*` dispatch preserves leases, reconciliation for recorded publish rows. Documents 2026-10-30 ~20:15 UTC incident; root throw not reproduced. **190.6** applied/deployed Lovable; **190.7** migration/Edge deployed, Gate 4 FAILED at `build_rows`. **ISS-034** OPEN.
- **Batch 190.6** Staged finalization abort diagnostics (PR pending): migration `20261030210000_screener_sync_abort_diagnostics_v1.sql`; persist `prior_generation_retained` / `newer_generation_live` on staged abort without changing scanner or publish decisions. Gate C observations documented; historical aborts remain NULL. **ISS-034** unchanged.
- **Batch 190.5** Staging RPC ACL hardening (PR pending): migration `20261030193000_screener_sync_staging_rpc_acl_hardening_v1.sql` revokes anon/authenticated EXECUTE on five remaining staging RPCs; disposable PG bootstrap simulates Lovable direct grants. **ISS-034** unchanged.
- **Batch 190.4** Staging advance RPC ACL correction (PR pending): migration `20261030183000_screener_sync_staging_advance_acl_v1.sql` revokes PUBLIC/anon/authenticated EXECUTE on six-arg `advance_screener_sync_chunk_v1`; **service_role** only. Lovable apply required before Gate B; **ISS-034** unchanged.
- **Batch 190 release gate** CPU-safe staged screener sync (PR **#196**, branch `cursor/batch190-cpu-safe-screener-sync`): Architecture A — chunked Edge + CAS staging RPCs; atomic `publish_screener_sync_staged_generation_v1` with **fail-closed** staged handler (no replace+record fallback); **Postgres 16 mandatory CI** (`screener-deno-regressions.yml` + `screener-sync-pg-test-setup.mjs` + 11 integration tests). Migrations **not applied**; **ISS-034** remains open until production publish verified.
- **Master Continuity Sync V4** (PR **#195** → **`4eaa8504`** / doc head **`b98e2724`**): master backlog `docs/release/STOCKSIST_MASTER_PENDING_BACKLOG_2026-10-28.md`.

## 2026-10-31

- **Batch 190.9** Weekend session classification (PR **#203** → **`f74b7c83c332fad8e1109c69fe3f877b7a533ee1`**): `resolveSessionSchedule(null)` closes Saturday and Sunday before the weekday open fallback; invalid matching weekend exception rows stay closed. Valid exceptions still win; invalid weekdays keep the historical open fallback. Not a 23×5 open. **Merged to `main`; Lovable Edge NOT deployed.** CAS and freshness checks unchanged. **ISS-034 P0 OPEN.**

- **Batch 190.8** observation-session guard (PR **#201** → **`b720106771950b7ed90c81d53f3ce2f196e35c49`**): Day Trade Radar rejects unresolved observation sessions before volume-first top-N. **Deployed Lovable `sync-screener-data` 2026-10-30 23:54:35–23:54:46 UTC** (source SHA-256 `7bf8c45d…c32d6`). **Gate 4 passed 2026-10-31 01:08 UTC** (three consecutive six-tab publications). Last success **03:20:02 UTC**, 110 rows.

- **Batch 190.8 Gate 4 pass and Saturday regression (continuity docs):** PR **#202** → **`56816bd54778541fff3ec5fb076f03cf5e73dd75`**. Records Gate 4 pass, last success **03:20:02 UTC**, and subsequent **`http_409`** / **`prior_generation_retained`** regression through ~**21:35 UTC**. Pre-pass **23:55 UTC** snapshot preserved in `docs/DEPLOYMENT_STATUS.md`. No application or Edge deploy.

## 2026-10-28

- **P0 CPU mitigation** merged (PR **#194** → **`1398d16a`**; implementation core **`268ffabc`**, PR branch head **`f3a2d23e`**): bound session-volume cache, `selectMainUniverseTabs`, staged benchmark, parity tests. Runbook `docs/release/p0-screener-cpu-publication-v1.md`. **Deployed Lovable `sync-screener-data` 17:29:52 UTC** — submitted source SHA-256 `cfd9032b…cc3af`, 37-file closure SHA-256 `c3a70628…8a167`. **Publication failed** — **17:30 / 17:35 UTC** **CPU Time exceeded**; **ISS-034** **open**.
- **P0 D1** Extended-hours screener volume integrity merged (PR **#193** → **`4f7c10db`**). **Lovable Edge deployed** (fingerprint SHA-256 `23980c312052a4cb5de5be12e3a32b178e1d1fa8104c39f384e02f13845e6f03`). **Premarket live acceptance pending.**
- Batch **189** Homepage final cleanup merged (PR **#192** → **`68092518`**): AI Trader off homepage, market clocks, live session countdown, Market Pulse disclosures.

## 2026-10-27 (Batch 188)

- Batch **188** Mobile dashboard & Journal reliability merged (PR **#191** → **`dc965d2d`**): Journal loading/error/stale recovery (incl. 188.1 hydration fix), AI Brief mobile preview, Risk skeleton guard, Carryover progressive disclosure. Runbook `docs/release/batch188-mobile-dashboard-journal-reliability-v1.md`. Authenticated Android acceptance **NOT VERIFIED**.

## 2026-10-27 (continued)

- Batch **187** Earnings intelligence merged (PR **#190** → **`d86e0c69`**): dedicated calendar fetch, market-impact ranking, truncation disclosure, timing ingestion; Vercel deploy **SUCCESS**. Edge activation sequence in `docs/release/batch187-earnings-intelligence-v1.md` — **NOT APPLIED** in Cursor; revision ids **UNKNOWN**.
- Batch **186** AM Inbox continuation merged (PR **#189** → **`d3cec11f`**): parallel handoff RPC, refresh-failure UX, workspace decouple; 3,131-row tests. Authenticated UI **NOT VERIFIED**.

## 2026-10-27 (integration)

- Lovable preview Edge type parity merged (PR **#188** → **`b69d7444`**). Integration branch forward-sync **`a03407c2`**.

## 2026-10-27 (continued)

- Batch **185 / 185.1** Scanner evidence & input reliability merged (PR **#187** → **`e662c928`**): honest `publication_confirmed` reconcile, partial evidence parse, guarded legacy evidence PATCH + persistence telemetry. Runbooks `batch185-scanner-evidence-v1.md`, `batch185-lovable-production-verification-checklist.md`. Lovable read-only Oct 27: **115 rows**, six tabs evaluated, 5-arg RPC + evidence **PASS**; migration ledger / Edge revision **UNKNOWN**.
- Batch **184 / 184.1** Mobile navigation stability merged (PR **#186** → **`0fa177dd`**): late-session sessionStorage batch/skip; bounded RPC/Radar timeouts; deferred handoffs + same-destination nav guard; `buildLateSessionPriorityEvaluation` (850-pool regression); expanded handoff pagination. Runbook `docs/release/batch184-mobile-navigation-stability-v1.md`. Authenticated mobile acceptance **NOT VERIFIED**.
- Batch 174/175 Monday scanner + Inbox continuation merged (PR **#183** → **`13a018a9`**): acceptance matrix, Batch **175** criteria, Penny Continuation classification.
- Batch 175 Tuesday production acceptance (docs): production RPC verified Monday **2026-10-26** handoffs for AM **2026-10-27** — `batch175-tuesday-production-acceptance-2026-10-27.md`; read-only probe `scripts/ops/batch175-readonly-handoff-probe.mjs`.
- Batch 183 Desktop Day Trade Radar workspace tabs V1 merged (PR **#182** → **`3ef97ee1`**): desktop tabbed workspace (Live Radar, Momentum, Historical, Signals, Settings); mobile behavior unchanged.
- Batch 182 Five Pillars Qualification Transparency V1 merged (PR **#181** → **`0542ee10`**): per-pillar evidence in Radar detail, lifecycle from persisted qualification state, `five-pillars-transparency.test.ts`. No migrations or Edge deploy.
- Batch 181 Catalyst + Watchlist Source Integrity V1 merged (PR **#180** → **`aae43f98`**): live attribution reconciliation on hydrate, shared tier/source presentation, Radar recent-news headline gate, watchlist company_event mismatch labeling, regression suite `batch181-catalyst-watchlist-source-integrity.test.ts`. No ISS-006 activation, no Edge deploy.
- Batch 178 Scanner session integrity V1 merged (PR **#179** → **`7c2bf094`**): premarket and after-hours mover rows require a timestamp inside that session; extended volume uses minute accumulation and stays blank when missing; regular `day.v = 0` remains missing. Runbook `docs/release/batch178-scanner-session-integrity-v1.md`.
- Batch 180 Public navigation & UX integrity V1 merged (PR **#178** → **`d4095c86`**): trending, heatmap, IPO screener, and symbol lookup canonical nav, watchlist auth handoffs, delayed-data copy, heatmap export/timeframe honesty; trending volume-only ranking (no fabricated views/SEED), heatmap universe label; tests in `batch180-public-nav-ux.test.ts`.
- Batch 179 Public website & conversion V1 merged (PR **#177** → **`dc42cfe5`**): canonical stock detail links, auth-gated historical Radar and watchlist handoffs, delayed-data copy on homepage/stock SEO; Vercel deploy SUCCESS.
- Batch 177 Lovable forward-sync & continuity alignment: integration branch forward-merge to `e4801e81`; PR **#176** merged at **`1002c682`**; no Lovable publish from Cursor.

## 2026-10-25

- Batch 176 Catalyst intelligence distribution bridge V1 merged (PR **#175** → **`788b1b93`**): eligibility, projection, collision-safe dedupe, disabled-by-default dry-run writer. **ISS-006** production activation still pending.
- Batch 173 Watchlist & Historical Handoff Integrity V1 merged (PR #173 → `28cbcc9e`): symbol/securityId handoff guards; regression tests. Supersedes the earlier Batch 177 watchlist-only plan.
- Batch 172 Catalyst Source Coverage V1 merged (PR #172 → `93a3c35d`): IR/events metadata, source-evidence contract, intel-layer metadata persistence/projection; public `catalyst_events` upsert still deferred. No Edge deploy or source activation in git.
- Batch 171 continuity correction: original ten Lovable scanner warnings restored in `docs/release/lovable-scanner-reliability-warnings.md`. npm and deploy findings stay on ISS-015 through ISS-019. npm override `tinypool@2.2.0` (0 critical advisories), vite/vitest/@vercel/functions pins, additional public-route code splitting, Lovable October 24 warning register, next-batch register 172–175.
- Security, performance & Monday readiness V1 (PR #170, merged `dd490ae5`): npm audit 42→21 without `--force`, `react-router-dom@6.30.6`, route lazy loading (~2,656 kB entry vs ~3,461 kB baseline), Browserslist DB refresh, middleware investigation deferred (ISS-018), Monday scanner runbook + read-only ops script. **ISS-015** open.
- Scanner live-market acceptance V1 (PR #169, `58aed1b1`): reconcile Polygon `day.v=0` as missing volume (`polygonSnapshotVolume`); acceptance report `docs/release/scanner-live-market-acceptance-v1.md`; ISS-020. Live RTH sign-off deferred.
- Momentum Radar + Catalyst Discovery V2 (PR #168, `b735073b`): market-moving Catalyst filters and priority sort, Radar catalyst association labels, momentum workflow routes. Vercel production js **`index-Drz78K0e.js`** observed 2026-10-24. **ISS-015** open.
- Scanner + catalyst intelligence integration V1: SEC taxonomy labels on Screeners and Radar, Catalyst tab **SEC EDGAR** filter and `matchesCatalystFeedCategoryFilter`, verified zero volume preserved in market-mover ordering, Radar/Action Center symbol handoffs, and documented worker/client catalyst boundary. Vercel SPA deploy pending; Fly worker image unchanged. **ISS-015** remains open.
- Edge Function release and rollback procedure for Lovable Cloud (`docs/release/edge-function-release-lovable.md`); git SHA on `main` is distinguished from live Supabase Edge revision. **ISS-015** remains open.
- Recover AI Analyst Catalyst Evidence Depth V2, bounded chat catalyst delivery, and financial-fact extraction from `68c88114`, `2f22387b`, and `ed75aa71`. Official attribution now requires the asked symbol, events older than 45 days stay historical context, and priority facts need a source URL. Closes ISS-001 in git. `chat` is not deployed (ISS-015).
- Record October 24 Vercel findings as reported investigation items: 42 npm vulnerabilities (3 critical, 25 high, 13 moderate, 1 low), a production JS bundle of about 3.45 MB, a deprecated Vercel Edge middleware runtime, and outdated Browserslist data (ISS-016 through ISS-019). These are not confirmed production exploits.

## main through 9e1a9538 (2026-10-24)

| SHA | What landed |
| --- | --- |
| `9e1a9538` | PR #165. Lovable Cloud as managed Supabase operator; platform ownership in project memory and agent instructions. |
| `10723434` | PR #164. AI Analyst catalyst evidence depth V2 and bounded chat delivery. |
| `03449198` | PR #163. Project memory, architecture docs, issue register, session handoff, integrity checks, Lovable branch roles, and the historical Gate I.3 activation record. |
| `63957b31` | PR #162. Lovable-generated MCP artifacts aligned with the reviewed integration tip. |
| `ed3a3728` | PR #161. `main` reconciled with Catalyst V2.1 and Gate I.3 integration, including SEC circuit-breaker migration `20261024153000`. |
| `d835f704` | PR #156. Gate I SEC EDGAR recurring ingestion lease, telemetry, and dedupe. |
| `8d9232fd` | PR #155. Gate H.1 SEC remediation RPC privilege hotfix. |
| `56f6a057` | PR #154. Gate H SEC V1C historical misattribution remediation. |
| `9243c603` | SEC filing attribution integrity V1. |
| `d8d68231` | PR #152. Batch 37.1 cache-before-quota ordering. |
| `e22a8361` | PR #151. Batch 37 shared live market-data cache. |
| `3e730139` | PR #150. Batch 36 SEC activation readiness and verification tooling. |
