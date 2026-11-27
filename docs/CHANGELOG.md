# Changelog

## 2026-11-27 — PR #283 follow-up (git only; same PR)

- Watchlist: separate `requestStatus` from `priorAnalysisAvailable` / `refreshFailedWithPriorAnalysis`; presentation stays `ready` when prior content survives failed refresh.
- Catalyst: opinion-editorial vs Reuters/Bloomberg factual reporting split; `classifyCatalystPrecedence` reconciles event types client + Edge.
- AI Analyst: explicit ticker switch in questions; `rankCurrentCatalysts` uses scored reconciliation; chat updates active symbol on explicit ticker change.
- AM/PM brief card: removed sessionStorage (auth bypass fix); user-scoped in-memory last-good + fetch-generation lifecycle (no scheduling/cron changes).
- Catalyst: opinion-editorial headlines cannot regain primary class via `detectPrimaryEventClass`; missing attribution defaults `unverified` / not ticker-specific.

## 2026-11-27 — Catalyst & AI intelligence completion (git only; pending PR)

- Catalyst: editorial publisher guard (Motley Fool / etc.) — merger/earnings keyword headlines demoted to `company_news` at classify + ingest + UI labels (AWK M&A editorial case).
- Watchlist V2: failed refresh no longer marks row failed when prior `analyzed_at` exists.
- Preserved: PR #275 provider containment, #270 attribution authority, #282 scanner, earnings ranking source (ISS-026), AI Analyst CURRENT_CATALYST / MRVL regressions.

## 2026-11-27 — PR #282 merged (`c6278fde`)

Scanner session-integrity corrections (evaluated-empty observation gate, PM workspace gate, historical enrichment guards). Production runtime acceptance open; standard-tab 5m RVOL via Radar overlay only (no Edge row writer).

## 2026-11-27 — PR #282: closed-market row preservation + evaluated-empty guards (git only)

- Session row filter applies only during live surveillance; closed/weekend/holiday snapshots preserved.
- Evaluated-empty session reference requires `tabEvidenceSupportsEvaluatedEmpty` (not publication-confirmed-only).
- PM copy: early-close callout only when unlock precedes 3 PM ET.

## 2026-11-27 — PR #282 follow-up: observation integrity + PM gate + historical guards (git only)

- Remove `synced_at` session override; evaluated-empty via current `provider_as_of_max` only; mixed-row filtering; generation row cache tied to validated `sync_run_id`/`synced_at`.
- PM workspace unlock: **3:00 PM ET** regular days, **min(3 PM, early close)** on early-close sessions; holidays/weekends not 3 PM-gated; live gate refresh on PM Inbox.
- Historical enrichment failures respect poll generation + do not clobber ready Repeat Movers state.

## 2026-11-27 — Scanner & market intelligence completion (git only; pending PR)

- NHL / session: tab-local `provider_as_of` session reference + evaluated-tab `synced_at` fallback; baseline-unavailable truth precedence over prior-session copy.
- Volume intelligence: Radar V2 intraday overlay extended to standard scanner tabs (gappers, NHL, volume_spikes, gainers_losers, unusual_volume); sort fix for acceleration/`rvol_5m` columns.
- PM Inbox: workspace unlock uses exchange early-close via `getRegularCloseMins` (not fixed 3:00 PM ET).
- Float (ISS-037): partial float-map failures no longer blank entire table; provenance prefers `providerAsOfMax` over `syncedAt`.
- Repeat Movers: explicit `service_http_error` / `enrichment_failed` terminal states on historical-context batch failures.
- Baseline `main` **`c921fae`** (PR **#281** merged). Not production-deployed until owner Vercel/Edge path.

## 2026-11-27 — Historical catch-up execution safety (PR #281; git only)

- Partial-window cursor: retry boundary before failing symbol; full-window advance only when resolution completes; partial resolved batch persisted before worker stop.
- Queue ordering: `compareEligibleSymbols` for normalize, sort, and cursor lookup (bridge eligible load aligned).
- Campaign: authoritative state reload after lock; terminal poll ignores diagnostic `catch_up_stop`; missing final summary → reconciliation exit + conservative provider reservation.
- Activation procedure: v57 `deployment-01M8CCYWZQZHBNJ9FDMAP6N2CK` vs recovery `deployment-01M5JGEZBCYDGE1KHFT8CRVS6Z`; preserved **16/20**, **7432+7500/50000**, cursor **BKH**.
- Tests: vitest queue/rollout + PowerShell orchestration (11 scenarios).

## 2026-11-27 — Historical Intelligence queue completion (git only)

- Fix v57 **BKH** starvation: exclusive queue advance past all-deferred windows, wrap-once `queue_cycle_exhausted`, empty-window bound **3**, bridge eligible normalize/sort, per-run Fly cursor secret refresh, campaign `stuck_queue_cursor` halt.
- Preserve campaign checkpoint **16/20**, provider **7432+7500/50000**, durable history totals; worker remains suspended.
- Episodes / Repeat Movers: classify remaining freshness as **activation** after catch-up (no client rebuild).
- Recurring activation procedure: `docs/historical-intelligence/historical-catchup-activation-procedure-v1.md` (not scheduled).
- Baseline `main` **`b0c6f46b`** (PR **#280**).

## 2026-11-27 — Homepage My Assets Watchlist fix + AI Trader nav shelve (git only)

- Baseline `main` **`56153eae`** (PR **#279** merged). Lovable source sync reportedly completed; calendar activation still blocked (migration execution safeguards + pending 28-table / TRUNCATE evidence).
- Homepage My Assets: reuse Watchlist V2 `added_at` symbol contract and cache; separate optional quote enrichment so saved symbols render without fabricated prices.
- AI Trader removed from customer `DashboardSidebar` menus; deferred until 2027; infrastructure and OFF safeguards preserved. AI Analyst unchanged.
- Not marked production-verified pending Vercel deploy + authenticated homepage check.

## 2026-11-26 — Catalyst Calendar V4 production activation recovery (post-merge `5d458699`)

- PR **#278** merged to `main`; Lovable activation stopped before SQL.
- Corrective migration `20261126250000_economic_calendar_service_role_grants_v1.sql`.
- Deterministic five-migration activation runbook + pgTAP privilege tests.
- Lovable 28-table RLS finding recorded; pending classification (no Fix All).

## 2026-11-26 — Catalyst Calendar V4 merged (PR #278 @ `5d458699`)

- Muse calendar V4, public catalyst RPC pagination, US government + gated Finnhub economic sync.

## 2026-11-26 — Catalyst Calendar V4 final economic ingestion (PR #278; git only)

- FOMC: Federal Reserve monthly newsevents pages; statement on announcement day (e.g. Dec 9 14:00 ET for Dec 8–9 meeting).
- BLS: `release-list` table parsing with official HTML fixtures; no cross-date name pairing.
- US government sync: `ok: false` when all sources fail; partial coverage metadata; no success stamp on total failure.
- Public catalyst RPC pagination: stable `ORDER BY … ce.id ASC`.

## 2026-11-26 — Catalyst Calendar V4 release gate (PR #278; git only)

- Economic GET: cached sync status only; entitlement via authorized POST `verify_only`.
- US government macro ingest (BLS + Fed schedules); Finnhub gated by `FINNHUB_ECONOMIC_ENABLED`.
- Paginated public catalyst RPC + evidence-based event status; sync status persist checks.

## 2026-11-26 — Catalyst Calendar V4 consolidated corrections (PR #278; git only)

- Secure public catalyst: `public_catalyst_calendar_range_v1` RPC; client `fetchPublicCatalystCalendarRange`.
- Economic: Finnhub ingest fixes, sync auth hardening, entitlement GET probe, `economic_sync_status`, `FINNHUB_ECONOMIC_ENABLED` gate, US catalog fallback metadata.
- Calendar AI: `useCalendarCachedIntelligence` (bounded); relevance guard; week-range query expansion.
- Muse: filter count badges, list-row cached AI take, chart stats/related chips, mobile sheet polish.
- Runbook: `docs/release/catalyst-calendar-v4-production-activation-v1.md`.

## 2026-11-26 — Catalyst Calendar V4 completion pass (PR #278; git only)

- Muse layout: navy day brief, toggleable legend, day view + persistent pinned ticker card, power-sources footer; customer-facing availability copy.
- **Economic:** Finnhub `calendar/economic` adapter (`sync-economic-calendar`, shared economic parsers, hardened `economic_events` migration).
- **AI:** Cached watchlist analysis in day brief; AI Analyst `symbol`+`prompt` handoff; journal `catalyst`/`researchDate` prefill.
- Homepage economic tab shares `economic_events` query when table exists.
- **Guest read:** migration `20261126220000_catalyst_events_public_calendar_read_v1.sql` — anon `provider_reported` catalyst rows (Lovable apply required for populated public grid).

## 2026-11-26 — Catalyst Calendar V4 foundation (PR #278; git only)

- Public `/calendar` shell: month/list, filters, chart preview, shared contract with homepage.
- **Merged baseline:** Homepage PR **#277** @ `a7ddec2`.

## 2026-11-26 — Homepage V21 merged to main (PR #277)

- Merge commit **`a7ddec2`** on GitHub `main` (Vercel production SHA verification separate).

## 2026-11-26 — Homepage V21 owner preview fixes (PR #277; git only)

- Header session pill (compact Muse styling), earnings Daily/Weekly views, homepage calendar outbound links, closed-session movers layout, footer width alignment.

## 2026-11-26 — Homepage Muse V21 design fidelity (PR #277; git only)

- Second pass on `cursor/homepage-v21-production-integration`: Muse layout bands, month calendar grid with `useHomepageCalendarMonth`, movers price filter, Muse six-card tools, editorial news, navy homepage footer, i18n copy bundle, removed duplicate Pro rail.
- **Still missing:** public economic calendar data feed; Earnings page does not yet consume `calDate`/`calTab` handoff params.
- **Not deployed** to production.

## 2026-11-26 — Homepage Muse V21 production integration (git only; PR pending)

- Rebuilt public homepage per approved design package `docs/design/homepage-v21/` (visual reference V21; controlling spec: owner assignment).
- Shared reuse: `useHomepagePublicMovers`, Market Pulse catalyst enrichment, `catalyst_events`, watchlist table, `ToolGrid`, IPO/news modules.
- **Gap documented:** verified macro **economic** calendar feed — Economic tab shows unavailable state until backend contract lands.
- **Not deployed** — Vercel preview from PR branch only.

## 2026-11-26 — Historical worker v57 deploy + catch-up halt (ops)

- PR **#276** merged `main` **`5c99f08a`**. Fly **`stocksist-historical-backfill-job` v57** `deployment-01M8CCYWZQZHBNJ9FDMAP6N2CK`. Preflight **PASS** (target **2026-11-25**, floor **2021-11-29**, caps **600/3/2500**, eligibility **200**).
- Writing: run 4 statement-timeout exit 1; runs 5–15 exit 0 empty windows (**0** new jobs; **~150** ambiguous / **~50** unsupported per 200-symbol scan); cursor stuck at **`BKH`**. Run 16 stopped for repeated lack of progress.
- Preserved durable totals: **599** securities, **340,797** daily rows, **32,939** episodes. Jobs: `d3e927ae-…`, `e644da93-…`, `c9f2bb21-…`, `d3abb1e8-…` (+ pilot `c35c4f06-…`). Worker **0** machines; preflight restored.

## 2026-11-26 — Historical catch-up queue starvation fix (git; PR pending)

- Symbol cursor `HISTORICAL_CATCHUP_QUEUE_AFTER_SYMBOL` (no numeric offset); provider outcome taxonomy; campaign state JSON + lock; recurring catch-up driver script (not scheduled).
- Recurring catch-up operations doc + `resolve-catchup-target.ts` (not activated). Vitest: `batch33-9-queue-starvation.test.ts`.
- Operational safeguards (same PR): one atomic lock owner (nested recurring does not steal/cleanup foreign locks); persist full per-run provider reservation before machine launch; Fly cleanup verifies exit codes, zero machines, and restored preflight; HTTP 200 missing/malformed reference payloads classify as `provider_invalid_response`. PowerShell orchestration tests: `scripts/historical/__tests__/catchup-orchestration.tests.ps1`.

## 2026-11-26 — Historical consolidated catch-up campaign (ops only; partial)

- Two successful Fly executions at **600/3/2500** caps (~**340.8k** rows, **~32.9k** episodes, **3010** provider calls); **`eligibleSymbolsRemaining` ~4735** after run 2.
- Job IDs: `d3e927ae-d1bd-461d-9cf7-8c986a9af0fe`, `e644da93-58f2-4d5f-ba84-5c4776a938d7`, `c9f2bb21-536b-4838-97bb-3a78bf65d12b`, `d3abb1e8-d9ff-4f5d-b597-e17afd95cb5b` (plus pilot `c35c4f06-d2f6-4219-a678-9e21d2f0bd04`).
- Run 3 halted: `batch_skipped` / `no_resolvable_identities`; worker **0**, preflight **on**.

## 2026-11-26 — Historical catch-up entitlement + bounded pilot (ops only; no git deploy)

- Verified Polygon entitlement earliest SPY daily session **2021-11-29**; Fly `HISTORICAL_PROVIDER_ENTITLEMENT_FLOOR_DATE` updated from failing **2021-10-25** (no subscription upgrade, no image rebuild — **v48** digest `deployment-01M5JGEZBCYDGE1KHFT8CRVS6Z`).
- Non-writing preflight **`catch_up_preflight_ok`** (target **2026-11-25**); authorized bounded pilot wrote **132** daily rows + **29** episodes (`jobId` `c35c4f06-d2f6-4219-a678-9e21d2f0bd04`); **5325** eligible symbols remain.
- Worker scaled to **0**; **`HISTORICAL_CATCHUP_PREFLIGHT_ONLY=1`** restored. Consolidated catch-up: adjust caps + scale-up loop (documented in `SESSION_HANDOFF.md`).

## 2026-11-25 — Authenticated launch defect correction (PR #275)

- **Watchlist + Brief:** surface-isolated model resolution (`resolveWatchlistAnthropicModelId` / `resolveDailyBriefAnthropicModelId`); permanent HTTP failures no longer exhaust transport retries; batch **provider-wide containment** in `run-watchlist-analysis-v2-batch` after confirmed auth/account/model signals (not ticker-scoped 400s); missing `ANTHROPIC_API_KEY` → `AI_AUTH`.
- **Screeners:** `resolveScreenerMarketDataTrust` generation-age fallback → **Delayed** (15-minute quote policy) when feed telemetry absent — Gappers/NHL parity with Radar tabs (ISS-024 freshness).
- **Repeat Movers:** Edge client sends publishable `apikey` separate from user JWT; backfill runbook only (no prod SQL).
- **Tests:** Deno `anthropic-config_test`, `normalized-failure_test`, `generation-state_test`; Vitest trust-states + historical-context client.
- **Deploy:** Vercel + Edge `analyze-watchlist-tickers-v2`, `generate-daily-brief`; owner Anthropic secret verification required.

## 2026-11-25 — Layer C + Option B reconcile (PR pending; SQL not applied)

- Forward migration `20261125203000`: `validate_screener_feed_reconcile_evidence_v1` + Option B–aware `reconcile_screener_sync_staged_publish_v1` (six-tab evaluated **or** canonical degraded Gappers with companion tabs evaluated and zero Gappers rows).
- Activation bundle `docs/release/batch191-layer-c-option-b-activation-bundle-v1.md`. Postgres integration tests `batch191-layer-c-option-b-reconcile-postgres_test.ts`. **No** production SQL from Cursor.

## 2026-11-25 — Production checkpoint (owner-verified; scanner v530)

- GitHub `main` `97c2eb03`; Edge v530 Nov 25; Option B **ON**; fingerprint `4956c836…`; recovery source `07dbdf5c`; Lovable editor `48dfe1b1`; eleven consecutive publications through **18:30 UTC** (107 rows, six evaluated tabs). PR #272 alert CHECK applied outside ledger (**18:26:38 UTC**). ISS-043 **CLOSED**. Layer C **unapplied** — activation awaits this bundle.

## 2026-11-25 — ISS-034 finalize merge/volume boundary diagnostics (#273 merged)

- **ISS-034 (diagnostic defect):** Durable `finalize_stage:merge_selections` was written at stage *enter* before CPU-heavy selection work; `load_volume_baselines` was not durable — Nov 24–25 opening-bell jobs dying in that window were ambiguous. **Runtime kill mechanism remains UNVERIFIED** (no http_546; stale abort ~30 min). Fix: persist `merge_selections` after selection completes; add durable `load_volume_baselines` after baseline load. Deno: `iss034-finalize-merge-volume-boundary_test.ts` + `batch216-finalize-stage-marker_test.ts`. **Not deployed.**
- **ISS-043:** Nov 23–25 read-only — generations within **04:00–19:55 ET**; closed-session cron classification **PASS** (no cron change).
- **Option B:** PR **#261** on `main`; compatible with pre–Layer C production DB; activation = Edge deploy (if not already at #261+) + owner secret `SCREENER_ALLOW_DEGRADED_GAPPERS_PUBLISH=true` + optional Vercel truth-state; **not authorized**.

## 2026-11-22 Launch Batch B — alert event-type constraint (PR pending; base `87f7fd81`)

- **ISS-034 (no source change):** Nov 20 RTH zero publications / retained generations match existing Gappers preserve with Option B **OFF** (SONN unresolved gap input at 09:15 ET). The 09:35 `merge_selections` stop has no recorded cause; not treated as a confirmed code defect. Option B stays off.
- **Alerts:** forward migration `20261122160000_scanner_intelligence_alerts_event_types_v1.sql` widens `scanner_intelligence_alerts_event_type_check` to the eight `SCANNER_EVENT_TYPES` (adds `HOD_BREAK`, `VWAP_RECLAIM`, `GAP_CONTINUATION`, `LATE_DAY_ACCELERATION`, `VWAP_LOSS`). Not applied. Deno contract test only.

## 2026-11-22 Group 4 — final development (PR #271 merged; `87f7fd81`)

- **ISS-038:** Shared `SUBSCRIPTION_MARKET_DATA_FEATURE` / `PRO_SUBSCRIPTION_FEATURE_BULLETS`; Billing, Disclaimer data-delays section, Admin Subscriptions Pro monthly plan — no unsupported real-time marketing. Vitest `batch202-public-launch-readiness` extended (9 tests).
- **ISS-027 / ISS-032:** **Preserved** — Batch 188 journal terminal loading and mobile Risk/AI Brief fixes unchanged; focused tests pass.
- **ISS-042:** **Preserved** — Admin Operations authorization + render tests pass; no production role grants from Git.
- **ISS-039 / ISS-040:** Release intent manifest `docs/release/manifests/group4-final-development-2026-11-22.v1.json` (Git `25b6c85d`, Lovable integration tip recorded); `npm run test:release-control` / `test:lovable-sync` pass.

## 2026-11-22 Group 3 — market intelligence & data quality (PR #270 merged; `25b6c85d`)

- **ISS-028 (Edge parity):** `supabase/functions/_shared/catalyst/precedence.ts` — `applyAttributionAuthority` matches client ranking demotion for `provider_associated` / sector / unverified rows; Deno test **18b**. `attribution.ts` — `reconcileAttributionWithLiveRules` + `headlineQualifiesForTickerScopedNews` for ingest/brief alignment with Batch 195.1 client rules.
- **ISS-026 / ISS-037:** **Preserved** — Batch 187 earnings ranking and PR #215 free-float provenance already on `main`; no new ranking or float logic. Edge earnings activation remains owner-gated (Lovable).
- **Vitest:** related-earnings precedence regression in `precedence.test.ts`. Focused catalyst/float/earnings suites pass locally.

## 2026-11-22 Group 2 — watchlist presentation (PR #269 merged; `e234b549`)

- **Watchlist V2:** `resolveWatchlistRowPresentation` + hook wiring so hydrating analysis shows **Loading analysis** instead of false **Data Unavailable**; `provider_unavailable` gates market-signal suppression. Vitest: `watchlist-row-presentation`, `WatchlistRowV2`, batch11/24/24-1/metrics, batch232 cache invalidation, batch233 workflow tiles, journal final verification.

## 2026-11-22 continuity closeout (completed actions Nov 18; docs-only record)

- **PR #264** merged at 47f2136b7cb35234cc85d23bccd090d202eea5e0. Worker-only checkpoint-aligned Radar V2 persistence-failure backoff shipped to **Fly v50**, Nov 18 ~18:06 UTC (image deployment-01M7QXBMQERTR1FCQZVCT4V00M); postdeploy healthy publish_candidates_v2 HTTP 200, timeout_ms=130000. Natural failure backoff and historical statement-cancel correction acceptance still ISS-049 OPEN.
- **ISS-034 Edge-only deployment** Nov 18 ~17:10 UTC completed with Option B OFF; submitted fingerprint e16fba307fd842e3df5984432153976286bca7221c77f6ac0f8dae820c0a21fd. Nov 18 17:15 UTC first natural job published 103 rows, 7/7, six tabs evaluated, Gappers unresolved 0. ISS-034 stays OPEN for Batch 191 session matrix.
- **PR #265** merged at be8659df81157a8964f709cce1d4a4caacf24243. Four Journal CI matrix jobs + new pgTAP ACL tests PASS after CI-only disposable bootstrap fix. **Production security correction applied through approved direct Lovable Cloud SQL outside migration ledger**: public.late_session_handoff_list_active_v1(date) anon EXECUTE revoked; authenticated/service_role retained; unchanged definer function hash df1282e91f6667bb2dd45c704abbfca6. No ledger entries edited; **do not label 20261118193000 ledger-applied**. AM Inbox authenticated UI ISS-025 remains OPEN.
- **Production verification, no changes:** market-data Batch 37 shared_cache=upstash, zero sample 429s; live Radar historical chunking <=20, continuation RVOL baseline and AM Inbox qualified fallback present. These are existing fixes; preserve live-acceptance gates. Lovable scanner_intelligence_alerts broad authenticated read was not proven to expose personal fields. Next isolated UX warning is transient Watchlist Data Unavailable before analysis loads.
- **Documentation snapshot:** docs/release/stocksist-session-handoff-2026-11-22.md.

## 2026-11-22 (Group 1 — ISS-024 Layer D session truth + ISS-044 acceptance prep)

- **ISS-024 Layer D:** `prior_surveillance_session_snapshot` copy when session gate withholds rows (`previous_during_live`); `screenerGenerationSessionAlignment` + `useScreenerData` wiring. Vitest `screener-truth-state`, `screener-session`.
- **ISS-044:** `docs/release/iss044-weekday-2000-et-acceptance-v1.md` — read-only 20:00 ET gates (Fly **v50** preserved).
- **ISS-024 Layer C:** `batch191-layer-c-production-activation-v1.md` Fly note → **v50**; SQL/Edge activation still owner **BLOCKED** until Lovable §1.

## 2026-11-17 (ISS-034 — full-universe replay gate; PR #260; not merged)

- Mandatory **13,240**-ticker replay **SATISFIED** on job `4ed4a4c7-…` (exit 0; counters **1302/1298/1/1/2**). Export not in git. **ISS-034 OPEN** until merge/deploy/acceptance.

## 2026-11-16 (ISS-034 — Option B release-gate reconciliation; PR #261; not merged)

- Row omission aligned with preserve companion-tab gate; retain incomplete Gappers when companions unverified (incl. session-boundary / repeat-gen paths). `iss034-option-b-release-gate_test.ts` in Critical screener CI. **No** production activation.

## 2026-11-16 (ISS-034 — Option B PR #261 review corrections; not merged/deployed)

- Strict eligibility: degraded Gappers publish only when companion tabs **evaluated** on the candidate (not merely unchanged from prior unavailability). Radar restoration blocked for `gap_input_coverage_incomplete`. Sync handler `tabs` counts reflect published payload (zero Gappers when omitted). Extended R2/R5/R7 Deno + Vitest. **No** production activation.

## 2026-11-16 (ISS-034 — Option B implementation; PR #261; not merged/deployed)

- `SCREENER_ALLOW_DEGRADED_GAPPERS_PUBLISH` (default off): gappers-only `gap_input_coverage_incomplete` may publish without Gappers rows when flag true. Frontend honesty + R1–R7 / RG Deno/Vitest. Stacked on PR **#260**. **No** production activation.

## 2026-11-16 (ISS-034 — full-job Gappers replay readiness; PR #260; not merged)

- `iss034-job-gappers-replay.ts` rebuilds historical coverage from frozen `nhl_baseline_snapshot`; replay CLI rejects missing job clock/baseline. Lovable export runbook `iss034-nov16-full-job-replay-export-v1.md`. **No** deploy.

## 2026-11-16 (ISS-034 — ASBPW/ASPCR + Option B design; PR #260; not merged)

- Owner-identified unresolved: **ASBPW**, **ASPCR** (`missing_prior_close`, not missing open). Subset replay matches job accum **1302/1298/1/1/2**. Option B publication-policy design doc; preserve gate unchanged. Vitest ISS-034 truth-state regression; Deno production replay + Option B contract tests. **No** policy deploy.

## 2026-11-16 (ISS-034 — PR #260 production-evidence correction; not merged)

- Owner read-only replay on job `4ed4a4c7-…`: `gapSuppressedByCloseVersusPriorWithoutOpen` matches **0** symbols; `unresolved_gap_input_count` stays **2**. Removed helper from publish accounting; added `gappers-gap-input-accounting` replay + `scripts/ops/iss034-gappers-replay.deno.ts`; `abort_evidence.candidate_gappers`; bounded staged `unresolvedGapSymbols`. Publication policy options documented — fail-closed default preserved. **No** deploy.

## 2026-11-16 (ISS-024 Layer C — production activation prep; PR #259 merged)

- **GitHub `main` `15aef76e`** — PR **#259** merged. Lovable activation runbook `docs/release/batch191-layer-c-production-activation-v1.md` (pre-flight, safe window, SQL→Edge order, rollback provenance `53a0ee4c`, forward SQL recovery). **Production BLOCKED** until owner pre-flight; **no** SQL/Edge/Fly from Cursor. Fly **v49** / ISS-044 unchanged.

## 2026-11-16 (ISS-024 Layer C — per-generation tab evaluation evidence; PR #259 review)

- Migration `20261116153000`: durable six-tab `tab_evaluation_evidence` on `screener_sync_generation_jobs` at atomic staged publish; `assert_screener_tab_evaluation_evidence_v1` requires all six tabs (rejects `{}`/partial); complete gate; reconcile alignment. Pre-migration published jobs remain Layer C **unavailable**. Layer C Deno tests in Critical screener CI. Runbook `docs/release/batch191-layer-c-tab-evidence-v1.md`. **Not applied** (Lovable SQL + Edge deploy pending).

## 2026-11-16 (Batch 196 — Radar acceleration display parity)

- Radar detail drawer aligned to `volume_acceleration_pct` (matches grid Acceleration column and Screeners). Disclosure `VOLUME_ACCELERATION_HEADER`. Vitest `batch196-2`, `trader-lens-ui`. Frontend only — **no** Fly/SQL/Edge.

## 2026-11-16 (ISS-044 — closed-session park retry-safety; PR #257; no new batch)

- Radar worker: `ClosedParkRecovery` pins stable flush/closed generation ids and synced_at; **15s** `RADAR_V2_PARK_RETRY_INTERVAL_MS` backoff so 5s eval cycles cannot spam V2/V1; two-stage checkpoint (`flush` → `closed`) with flush `shouldWrite` enforced and no AH replay after closed stage; `pendingClosedPark` retries use `published: false` / `persistEmpty: false`. Ack only via `isClosedParkFullyCommitted`. Deno: **89** focused (`iss044-closed-park-retry_test.ts`, `session_test.ts`, `persist_v2_test.ts` park regressions). Typecheck/build **PASS**. **No** SQL/Fly/deploy. Cold-start park rehydrate **not** added. Nov 12 prod root cause **not** claimed solved.

## 2026-11-16 (Earnings Top-3 test harness; no new batch)

- `EarningsHeadlinesReveal.test.tsx` mocks `useAuth` so `EarningsList` → `PreMarketSymbolActions` mounts under test (Group 3 regression). **No** production/UI behavior change.

## 2026-11-15 (ISS-041 — market-session fallback; no new batch)

- `scheduleOrFallback` in `src/lib/market-session.ts` uses `resolveSessionSchedule(etDate, null)` instead of bare `fallbackOpenSchedule`, so `resolveMarketSessionAt(ms)` without an explicit schedule mirrors the exchange-calendar weekend closure path. Affects `resolveConsumerSessionKind` and `movers-observation` callers indirectly. **No** scanner ranking, threshold, Edge, Fly, SQL, or deploy changes. **Checked:** Vitest `equities-session-calendar.test.ts` (16), `npm run typecheck`, `npm run build`.

## 2026-11-15 (Batch 202 — public launch readiness / ISS-038)

- Public marketing aligned to **15-minute delayed** quotes (hero i18n, FAQ, download, stock lists, ETF SEO, methodology); homepage **23×5** session positioning without overnight-scan claims; header/footer `auth_handoff` analytics; homepage grid `min-w-0`. Vitest `batch202-public-launch-readiness.test.ts`. **No deploy.** Runbook `docs/release/batch202-public-launch-readiness-v1.md`.

## 2026-11-14 (ISS-034 — November 13 opening-bell evidence; no new batch)

- Recorded Friday **Nov 13 09:30 ET**: 7/7 chunks, no publish RPC, **`prior_generation_retained`**, last durable **`finalize_stage:build_evidence`**, Gappers **`prerequisite_unavailable`**, NHL **`not_evaluated`**. **09:25** **88** / **09:50** **101** / **10:05** **102** rows. Batch **228** lease path advanced; fail-closed RTH gap/`day.o` and NHL day-range at the open; same-date 09:25 retained. **No** scanner behavior change. Deno: `iss034-opening-bell-evidence_test.ts`. Continuity: Batch **233** PR **#251** merged `72c1a57c`; ISS-048 acceptance-only; sync run **`43319836884`** succeeded (editor/runtime identity unverified); ISS-044 Nov **12 20:00 ET** closed-park miss. Runbook `docs/release/iss034-nov13-opening-bell-evidence-v1.md`.

## 2026-11-12 (Batch 233 — Journal & Action Center workflow, PR #251)

- `actionCenterWorkflowTileHref` keeps ticker (and session `securityId`) on Continue Workflow tiles and Catalyst header when Action Center opens with `?symbol=`.
- `JournalTradeWorkflowLinks` Screeners uses `workflowSymbolRoutes.screeners`. Journal batch **188** + handoff batch **173** regressions **pass**. Authenticated UI **NOT VERIFIED**.

## 2026-11-12 (Batch 232 — Watchlist V2 reliability, PR #250)

- Shared `invalidateWatchlistClientCaches` after watchlist inserts from `useAddToWatchlist`, `StockCtaButtons`, and `useWatchlistV2` mutations so **watchlist-v2** refetches without full page reload.
- `WatchlistRowV2` workflow actions use `workflowSymbolRoutes` / `touchWorkflowHandoff` (optional `securityId`); Action Center link added. Recorded Batch **231** scanner ledger **502** jobs Nov 10–12. Authenticated Watchlist checklist **NOT VERIFIED**.

## 2026-11-12 (Batch 230 — AM Inbox continuation, PR pending)

- Bounded `get-pre-market-workspace` fetch (**25 s**); `amInboxNavigatePath` symbol-aware Screeners/Action Center. ISS-025 **OPEN** pending authenticated AM Inbox checklist. Recorded Batch **229** Catalyst UI **821** / **791**.

## 2026-11-12 (Batch 229 — Catalyst upcoming earnings counter, PR #248 review corrections)

- `time_of_day` / explicit `event_time` reporting-window classification; ET calendar horizon; stable `event_date`+`id` pagination; Last 24h `published_at` upper bound; summary loading/unavailable UI.

## 2026-11-12 (Batch 229 — Catalyst upcoming earnings counter, PR pending)

- Dedicated summary queries for **Upcoming Earnings** and **Reported in Last 24h** (no longer derived from 500-row asc feed). ET date/time rules, `provider_reported` only. **ISS-046** opened. **Vercel** deploy required for production fix; no backend changes.

## 2026-11-12 (Batch 228 — controlled Lovable Edge deployment)

- Owner explicitly approved **one-time Git-snapshot-only rollback exception** because previous Edge revision/rollback pointer unavailable. Git source fallback: `e7a3eaeeceec1310e941d263dd5df63fd3b76998` (new deploy needed; **not exact previous binary**).
- Lovable Cloud reported **successful one-function** `sync-screener-data` deploy at 12:18:24–12:18:34 PM ET. Approved GitHub main `caefbe6b5e5d83582d0a69c8cf6f74bf3b0d0def`, editor source `09266183e352b6a21f61acbd10d23ce91b2016f8`, submitted source/settings fingerprint `07656eebf28569838df72838ea1f5c2026344167eb157b2728b25291bcbe3e29`. OPTIONS HTTP 200; platform Edge version IDs before/after unavailable. No cross-function, DB, Fly, cron, secrets, frontend publish or activation changes.
- Read-only 12:19 ET: feed available with 107 rows; last natural publish 12:15 ET **predated deployment**. **ISS-034 still OPEN**, Nov 13 09:30 ET acceptance pending. Auto-regenerated Lovable Penny DB typings/preview type mismatch tracked separately; Penny remains inactive.

## 2026-11-12 (Batch 228 — opening-bell finalize reliability, PR #246)

- Edge: release expired finalize leases before stale-job abort; resume gating; marker after CAS claim. **StagingTableClient** PostgREST filter typing (`.is`/`.not`/`.lt`). CI: `batch228-*_test.ts` (memory, supabase mock, postgres). **Nov 10 AH** ledger **48/0**. **Requires** Lovable deploy `sync-screener-data`. **ISS-034 OPEN.**

## 2026-11-12 (Batch 227 — final documentation correction, PR #245)

- Record owner-verified **Nov 11–12** read-only Lovable evidence (ledger, feed, Radar checkpoint); fix runbook Query **A** (ET date bounds, 04:00–20:00 session buckets) and Query **D** (`captured_at`, `count(*)`). Preserve Nov **10** Batch **191** attestation. **Vercel prod identity unverified.** **No scanner code.**

## 2026-11-12 (Batch 227 — P0 scanner acceptance reconciliation, PR #245 initial)

- Read-only ISS-034/024/044/045 matrix; Lovable query pack; Batch **226** merge recorded; **PR #243** superseded in docs (PR left OPEN). **No scanner code.**

## 2026-11-12 (Batch 226 — merged, PR #244)

- Penny persistence/read integration merged at **`6a969e9457909444adce6f582172e40e3f9eee0e`**. Files only — **no production activation.**

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
