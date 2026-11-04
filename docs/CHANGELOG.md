# Changelog

Application history below is a map of `main`, not a claim that each merge was deployed. Deploy facts belong in `docs/DEPLOYMENT_STATUS.md`.

## Documentation-only continuity reconciliation (2026-10-27)

- PR **#185** merged at **`4757b9de`**: Master Reset V3 + continuity (`master-reset-2026-10-27.md`). PR **#184** docs at **`e65746ab`**; PR **#174** closed without merge. October 27 observations in issue register; no production deploy implied.

## Unreleased

- **Batch 196.1** Scanner numerical integrity & volume provenance (PR **#209**): wall-clock velocity denominators; acceleration gated on observation span + feed leading silence (not per-minute bar counts); Fly worker Docker `session-volume.ts` closure; Vitest `AbortSignal.timeout` polyfill. Runbook `docs/release/batch196-1-scanner-numerical-integrity-v1.md`. **Fly worker deploy required;** Vercel optional (copy only). **Not merged; no Fly deploy.**

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
