# Stocksist — Master pending work register and batch roadmap

**Approved:** October 28, 2026 (ET) — Master Continuity Sync V4 (PR **#195**).  
**Scope:** Stocksist.com / `Holagpt-ai/hedgefun-insights` only. Reconciles October 27 handoff, October 28 production evidence, GitHub `main`, runbooks, and read-only Lovable Cloud observations.  
**Canonical link:** `docs/PROJECT_MEMORY.md`, `docs/SESSION_HANDOFF.md`, `docs/ISSUE_REGISTER.md`.

This register replaces the **active implementation queue** in `docs/release/next-approved-batches.md` for batches **190+**. Historical batches **171–189** remain in `docs/CHANGELOG.md` and named runbooks — **do not reissue**.

## 1. Verified baseline — use these facts, not older summaries

| Surface | Latest confirmed evidence | Implication |
| --- | --- | --- |
| GitHub `main` | `1398d16ad0041c34661e4bc76487c5a3757c207e` — PR **#194** merged | Approved app source contains D1 and CPU optimization. |
| Lovable integration | `cursor/lovable-sync-from-main-20261024` @ `04da6d7f87994c93a0c5fc64492654df2424fe0b` | Intentionally separate branch; contains approved `main`, plus protected Lovable-only `bun.lock`, `deno.lock`, `mcp/index.ts`, `handler_test.ts`. **Do not switch or reconnect.** |
| Lovable Cloud project | `zcjptaolpumhtlwhlemq` | Production Supabase, database, auth, Edge Functions and logs; distinct from GitHub/Vercel/Fly. |
| Production `sync-screener-data` | PR **#194** deployed **2026-10-28 17:29:52 UTC**. Reported submitted source SHA-256 `cfd9032b5d8c724bea5889a0e9888395219e0815626c2895bf1cdc705a2cc3af`; 37-file runtime closure fingerprint `c3a70628e6af107d10c73026b79e21850bf21f2b03427e700c859cdfcdb8a167`. Function revision number **not reported**. | **Deployment succeeded; publication FAILED**. Do not treat deployment as scanner acceptance. |
| Observed post-PR #194 Edge runtime | 17:30 and 17:35 UTC: 13,262 evaluated; 10/9 qualified; both **CPU Time exceeded** (~5–6s after boot), before atomic publication. | **ISS-034 is confirmed P0, still blocking live scanner freshness.** Avoid further micro-optimization loops; prefer bounded split/offloaded architecture. |
| Database feed at latest read-only check | `screener_feed_state.synced_at = 2026-10-28 16:15:04.456 UTC`; `sync_run_id = d3b3cd1b-42de-4c93-8170-9fd036c41f4e`; 108 persisted screener rows. | Stale generation; cron job 25 firing every 5 minutes does **not** prove the Edge request publishes. |
| D1 extended-session fix / ISS-033 | PR **#193** merged `4f7c10db`, Edge D1 deployed earlier; after correction minimum-volume rejections ~1,775 rather than all ~13,262 in observed run. Deployed fingerprint `23980c312052a4cb5de5be12e3a32b178e1d1fa8104c39f384e02f13845e6f03`. | D1 correctness is supported by processing evidence; **next true premarket-window and persistence acceptance still pending**. |
| Emergency recovery | Pre-D1 source candidate `680925181d1f7ea768ccc5f5b3201fde10c7b411`; runbook `docs/release/p0d1-emergency-rollback-sync-screener-data.md`. | Source-staging rollback planned/tested partly (138 Deno tests, `--no-check`), but **not instantaneous, not exact deployed-version restoration, not exercised end-to-end**; reintroduces ISS-033. Do not initiate without approval. |
| GitHub checks for #194 | Screener Deno CI and Vercel checks passed; local representative benchmark ~3.0–4.5s elapsed (not Edge CPU). | Tests cannot override observed production failure. |
| October 29 premarket window | Planned 08:00–09:15 ET observation, **not scheduled or completed** in the evidence. | Must not be counted as PASS. If publication is not fixed, rescope to next available live market session. |

**Key separation:** D1 volume data correction is **deployed**; PR #194 performance mitigation is **deployed**; scanner data publication remains **blocked**. All three statements can be true at once.

## 2. Hard priorities and execution policy

- **P0 recovery first:** reliable full-universe processing and one atomic fresh six-tab publication. No new scanner functionality until that acceptance gate clears.
- **No silent scope creep:** preserve 13,262-symbol eligible universe (or actual provider universe), six tabs, `Volume is king`, true Five Pillars, D1 observation-session semantics, delayed-data/provenance honesty, and actual eligibility conditions.
- **Do not redo merged batches:** 171–173, 176–189 and PRs **#193/#194** are implemented/merged, notwithstanding separate production acceptance gates. PR **#174** is obsolete and closed unmerged.
- **Production truth over CI:** `main` is code truth; Vercel frontend, Lovable Cloud Edge/database, and Fly are distinct production surfaces.
- **Tool ownership:** Cursor designs/codes/tests/Git; Lovable handles managed Supabase operations and authenticated UI checks; Vercel deploys frontend via GitHub; never publish production frontend through Lovable.
- **No automatic operations:** do not merge a PR, deploy Edge Functions/Fly, apply migrations, change cron/secrets, or change production without explicit batch-specific approval.
- **Canonical continuity:** before substantial work read `docs/PROJECT_MEMORY.md`, `docs/SESSION_HANDOFF.md`, `docs/ISSUE_REGISTER.md`; consult `ARCHITECTURE.md`, `DEPLOYMENT_STATUS.md` and task runbooks. Completed implementation belongs in `CHANGELOG`; only unfinished work belongs in active issue register.
- **Statuses below:** `ACTIVE P0`, `PENDING ACCEPTANCE`, `CONDITIONAL`, `DEFERRED`, `PARKED`. Master batch numbers are **not** GitHub PR numbers. **Batch 190** is the first authorized implementation candidate after PR **#195** merge; other batches remain sequenced but not automatically authorized.

## 3. Master batch execution order

### Phase A — production recovery (execute before new features)

#### Batch 190 — P0 CPU-safe screener execution and atomic publisher

**Priority:** P0 · **Owner:** Cursor design/code/tests; Lovable Cloud only for separately approved deployment/migration.  
**Status:** **FIRST ACTIVE IMPLEMENTATION CANDIDATE — requires owner scope approval before coding.**  
**Evidence:** ISS-034. PR #194's ~5× local speedup still exceeded Edge CPU during actual 17:30/17:35 runs; 108-row old generation served.

**Work:** Build a bounded, CPU-compliant execution plan, ideally separating expensive full-universe evaluation from the 2-second Edge request budget (chunked/idempotent staged jobs, an approved existing worker, or a measured alternative). Preserve one consistent provider-snapshot observation context, exact six-tab/global volume-first ranking and evaluation evidence, NHL baselines, session volume, diagnostics, and **single atomic final `replace_screener_results_generation_v1` publication**. Engineer job leases, idempotency, expiry, retry/recovery, concurrency, stale-generation prevention, partial-work isolation, 5-minute cron overlap behavior, metrics, and a rollback plan. **For new CPU architecture changes, prefer a verified PR #194 or D1 source recovery reference; do not default to the old pre-D1 `68092518` candidate, which reintroduces ISS-033 and also did not resolve CPU failure.** Do not simply trim the symbol universe or split selection in a way that changes global top-20 winners. Evaluate infrastructure/migration tradeoffs in the implementation proposal before changes.

**Acceptance gate:** at least one observed full-universe production sync **after an authorized deployment** with a new `sync_run_id`, `synced_at`, matching six-tab rows/evidence, no CPU overrun, and no regressions on D1. Protect against repeated stale-publication claims. **ISS-034 remains open until verified.**

#### Batch 191 — P0 market-session scanner acceptance (completes old Batch 174; ISS-033 / ISS-024 / ISS-031)

**Owner:** Lovable read-only live evidence + owner authenticated screenshots; Cursor narrowly corrects only reproduced defects. **Blocked by Batch 190 publisher acceptance.**

**Work:** Timed premarket (04:00–09:30 ET, especially 08:00–09:15), regular (09:30–16:00 ET), late/after-hours (15:00–20:00 ET) evidence. Verify D1 `min.av` when `day.v=0`, observation timestamps at 09:30/16:00 handoffs, Gappers/gainers/losers, Volume Spikes/Unusual Volume, NHL baselines, Morning Opportunity/Five Pillars, 5-minute RVOL availability disclosures, Float Turnover, delayed-provider freshness, live vs persisted generations and no stale trigger/cooling mislabel. Distinguish homepage snapshot movers from authenticated scanner data. Check quiet-feed watchdog state at session change and honest unavailable/zero-match states; compare provider evidence and tab-evaluation metadata. Confirm actual Fly/Radar source identity only when needed for a specific acceptance row.

**Acceptance gate:** signed live ET matrix; true success for each claimed pass and explicit NOT VERIFIED for missing windows. Original October 26 Batch 174 remains conditional until this closes.

#### Batch 192 — P0 AM Inbox continuation visible acceptance (completes old Batches 175 and 186; ISS-025)

**Owner:** Lovable authenticated UI verification + Cursor scoped follow-up. **Can proceed in parallel with Batch 190 only if no file ownership/deployment collision; must use a working source or clearly labeled stale data.**

**Work:** `/dashboard/pre-market` renders Late-Session Continuation without indefinite loading, correctly consumes supported `list_active` RPC, honors source/target trading day, category order, session expiry, eligible fallback, pagination/funnel limits and mobile performance. Verify Power Hour, Strong Close/HOD, After-Hours, Day-Two, ticker-aware handoffs to Screeners, Catalyst, AI Analyst, Watchlist, Journal and Action Center. Preserve truthful historical/expired disclosures. Reference October 26 persisted 2,056 Monday-source records, 827 distinct symbols, 2,915 October 27 active rows (incl. 859 earlier carryovers); the four category counts (351+412+482+805=2,050) are **six below** reported 2,056: **unreconciled**, not automatically a defect. A later separate Oct 27 check cited 3,131 handoff rows; confirm time/scope before comparing.

**Acceptance gate:** authenticated screenshot/video plus matching RPC evidence, no stranded loading, correct categories/handoffs and honest empty/expired states. Existing persistence PASS is not full UI PASS.

### Phase B — verify already-merged functionality, correct only proven regressions

#### Batch 193 — Mobile workflow and Journal acceptance (old Batches 184/188; ISS-023 / 027 / 030 / 032)

**Priority:** P1 (raise if reproduced freeze) · **Owner:** Lovable Android authenticated verification; Cursor bounded code fix only on reproduced issue.  
**Work:** Test `/dashboard/pre-market`, Screeners, Carryover Watch, Journal, AI Brief, Risk Flags, link taps, back/forward navigation, retry/error termination, oversized continuation data, card expansion, hydration and drawer/selection state. Old P0 mobile-navigation fixes and P1/P2 UI fixes are already merged. Do **not** rebuild them.  
**Gate:** no browser freeze/infinite skeleton/stale state, consistent mobile displays, screenshots and exact commit/deploy evidence.

#### Batch 194 — Earnings impact production activation and acceptance (old Batch 187; ISS-026)

**Priority:** P1 · **Owner:** Lovable Cloud deployment ops only after explicit approval; Cursor bounded tests if discrepancies.  
**Work:** Read-only confirm current versions of `get-pre-market-workspace`, `sync-earnings-finnhub`, `sync-catalyst-events`, and authenticated earnings ordering. Source changes merged (GitHub PR **#190**, product Batch **187**); Vercel success reported. The three Edge activations remain **separately gated**, in the documented order, only if source is not yet active and owner authorizes each operation. Confirm eligibility of specific examples, source/issuer match, actual vs scheduled/confirmed earnings, unknown-hour handling, truncation, market-impact prioritization, and no fabricated results.  
**Gate:** current live Edge versions verified, authentic AM Inbox ranking and timestamp/source correctness; no implicit activation.

#### Batch 195 — Catalyst/Watchlist/Radar issuer-trust acceptance (old Batch 181; ISS-028)

**Priority:** P1 · **Owner:** Lovable authenticated verification, Cursor narrow correction only if proven.  
**Work:** Verify TSLA/SpaceX and ORCL-like attribution on deployed UI with current event evidence; direct vs related vs historical vs unverified classification, SEC/IR/earnings exceptions, publisher/source and per-ticker headline gates; reconcile old persisted attribution only if a concrete exposure survives Batch 181 client guards. Preserve no invented price causation and no new distribution activation.  
**Gate:** scoped production fixtures/symbol UI match; ISS-022 code remains completed; no broad DB rewrite.

#### Batch 196 — Live Fly Radar/Five Pillars and late-session continuation acceptance

**Priority:** P1 · **Owner:** Lovable read-only observations + Cursor/Fly only on specific reproducible defects. **After Batch 191 stable publication.**  
**Work:** Verify real Fly candidate discovery, Stage-2 admission/cap starvation **D2 hypothesis** (not yet proven), live vs delayed sessions, volume-first selection, 5 Pillars/PASS/GRACE/expiry, VWAP/momentum/cooling, late-session Power Hour/After-Hours/Strong Close/Day-Two and next-session watchlists. Resolve only verified Stage-2 under-promotion, missing baseline, or source mismatch; **do not automatically replace Fly worker or change screening thresholds**.  
**Gate:** reconciled telemetry/symbol history/persistence and a bounded issue if any real defect is proven.

#### Batch 197 — Desktop Radar historical and workflow UX cleanup

**Priority:** P2 · **Owner:** Lovable UI evidence first, Cursor isolated fix only if confirmed.  
**Work:** Check History cells stuck `Loading…`, Historical tab content, duplicate AI Analyst action in ticker rail, Signals/tab preferences, selected-ticker persistence, >20-symbol historical progressive loading, historical detail/ticker handoffs, real versus prior-session and expiry labels. Preserve Batch 183's five-tab desktop design and mobile navigation.  
**Gate:** exact screenshot/reproduction; no speculative redesign or completed Batch 183 rerun.

#### Batch 198 — Bounded market-data/operations reliability disposition

**Priority:** P1 conditional · **Owner:** Cursor + Lovable read-only checks. **Tie evidence collection to Batches 190–196; no standalone broad audit.**  
**Work:** Close or narrow remaining operational uncertainty: market-data quota/shared-cache effectiveness, actual statement-timeout migration ledger (previous 99 failed saves report), watchdog session recovery, Fly image/source parity, production Vercel-to-Git source/asset attestation when material, `deno.lock` frozen-build divergence (Lovable-specific lock preserved), and the one old Batch 12 RVOL ranking test expectation (54/55). Record facts; create separate correction only when a failure is reproduced.  
**Gate:** evidence-based disposition (PASS, mitigated, blocked, deferred) with no re-opening disproven 5-minute RVOL-download publish-blocker.

### Phase C — selective new capabilities, after the P0 recovery and live-trust baseline

#### Batch 199 — Penny Continuation V1 specification only

**Priority:** P2 / future enhancement · **Owner:** Cursor produces design contract; owner signs off thresholds.  
**Work:** Differentiate existing Penny Stocks price-band (including under $1) from **new sub-$1 continuation-momentum eligibility and scoring**, relative/session volume, price/freshness, liquidity, floats where proven, prior-day/after-hours context, stage transition, scanner tab presentation and Inbox/ticker handoffs. Inventory overlap with current price-agnostic continuation. **Thresholds, scoring and exact UI are not yet established; no implementation during spec.**  
**Gate:** explicit product approval of requirements.

#### Batch 200 — Penny Continuation V1 implementation (CONDITIONAL)

**Priority:** Future P2 · **Owner:** Cursor coding/tests/PR; Lovable UI acceptance later. **Blocked until Batch 199 approved.**  
**Work:** implement only unique continuation engine/display and handoffs; no duplicate generic penny scanner; preserve volume-first ranking and market-data honesty.  
**Gate:** focused tests, scoped PR, separate production activation approval and live validation.

#### Batch 201 — Historical intelligence and momentum event refinements (CONDITIONAL)

**Priority:** Future core product · **Owner:** Cursor.  
**Work:** After scanner Phase 1 stable acceptance, selectively consider DAS-style *event-driven* Running Up/HOD/VWAP reclaim/volume acceleration/short-window 5-minute RVOL and historical episode reconstruction/match intelligence. Preserve Stocksist cleaner SaaS UI and catalyst-verified event context; **do not clone DAS or turn on feeds**. First inspect already implemented engines so no duplicate builds.  
**Gate:** distinct requirements and separate owner approval; no automatic scanner Phase 2 work.

#### Batch 202 — Final product/launch stabilization and technical debt

**Priority:** Pre-launch conditional · **Owner:** Cursor backend/security/CI; Lovable visual acceptance; Vercel deploy via GitHub.  
**Work:** End-to-end symbol-aware Screeners → Catalyst → Watchlist → AI Analyst → Journal → Action Center → Inbox integrity; live data/time/provenance honesty; performance/accessibility, navigation/auth gates, SEO/public surface checks, remaining npm advisories (ISS-016), large JS entry (ISS-017), Vercel middleware deprecation (ISS-018), any still-open Browserslist issue (ISS-019), source/deploy parity and incident rollback/runbook hygiene. Do not reopen completed work without fresh evidence.  
**Gate:** launch readiness matrix and verified release state.

### Phase D — explicitly deferred until separately reopened, approved, or near launch

#### Batch 203 — Catalyst source distribution activation (ISS-006) — DEFERRED

Source bridge already merged (Batch 176). Later validate SEC accession identity/provenance, source registry, partial-write accounting and dry-run; approve migrations/Edge flags and controlled roll-out separately. **Not** a rerun of already-completed SEC Gate I.3 activation.

#### Batch 204 — AI Analyst/Catalyst V2.1 and `chat` Edge regression cleanup (ISS-007 / ISS-015) — DEFERRED

Later: MRVL Oct 6 investor-day response, one-pass chat continuation, provider full-source retrieval, wrong catalyst / insufficient evidence, malformed empty chat HTTP 500, AI Analyst losing ticker context, Watchlist AI analysis failures, premarket AI brief generation, version/rollback identity for `chat`. **No current chat PR, Edge deploy, or prompt tweaking.**

#### Batch 205 — Market-data real-time feed activation/upgrade — DEFERRED UNTIL PRE-LAUNCH

15-minute-delayed labeled data is acceptable now. Later assess provider contract, throughput, quotas, migration plan and Fly/UI synchronization. No upgrade today.

#### Batch 206 — Newsletter, account and provider-neutral billing foundation — END-STAGE DEFERRED

Previously deferred Batch 6: newsletter/account/billing foundation; payment provider decision, entitlements, monetization, terms and payments after core scanner reliability. Do not hard-code an unselected payment provider.

#### Batch 207 — Broker connectivity — END-STAGE DEFERRED

Separate authorization and architecture, legal/compliance, provider risk and credential controls. No broker integration now.

#### Batch 208 — AI Trader shadow/paper/product lifecycle — LAST-STAGE DEFERRED

Operating mode OFF; no homepage promotion, no live/paper trading activation, no performance redesign until owner explicitly reopens after core product work.

#### Batch 209 — Optional community/content/market-alert distribution — PARKED / NOT APPROVED

Stocksist TV/YouTube (separate content-launch blueprint), community/waitlist, homepage AI-informed significant price-movement alerts and promotion concepts are ideas, **not verified active engineering batches**. Re-scope and approve separately; avoid claimed real-time/AI attribution without data evidence.

## 4. Pending acceptance and issue crosswalk — nothing silently closed

| Existing item | Disposition as of Oct 28 | New owner batch |
| --- | --- | --- |
| **ISS-034** CPU Time exceeded; stale screener publication | **Confirmed, P0 BLOCKED**, even after deployed PR #194 | **190** |
| **ISS-033** premarket `day.v=0` vs `min.av` | Code & Edge D1 deployed; true timed premarket acceptance **PENDING** | 191 |
| **Batch 174** (old) scanner live ET matrix | **CONDITIONAL**; superseded PR #174 closed unmerged | 191 / 196 |
| **ISS-024 / DATA-01 / DATA-02 / ISS-031** tab evidence, Gappers/Movers blank states, homepage vs scanner | Batch 185 code merged; persisted metadata confirmed in older 108-row generation; fresh production acceptance **PENDING** | 191 |
| **Batch 175 / ISS-025 / INBOX-01** continuation AM Inbox | RPC persistence PASS; authenticated visual loading/handoff **NOT VERIFIED** | 192 |
| **MOB-01 / ISS-023** navigation freeze | Batch 184 code merged; authenticated Android acceptance **PENDING** | 193 |
| **UI-01/02 / ISS-027 / ISS-030 / ISS-032** Risk, AI Brief, Carryover, Journal | Batch 188 code merged; mobile production acceptance **PENDING** | 193 |
| **ISS-026 / EARN-01 / Batch 187** earnings ranking | Git merged, Vercel passed; Edge activation/version and authenticated ranking **UNVERIFIED** | 194 |
| **ISS-028 / CAT-01** TSLA–SpaceX/ORCL issuer attribution | Batch 181 guards merged; live UI/status **NOT VERIFIED** | 195 |
| **Quiet-feed watchdog, Fly D2 cap, RVOL**, late continuation, Five Pillars | Source fixes merged where documented; live session integrity and Stage-2 cap **UNVERIFIED** | 196 / 198 |
| **DESK-01** History Loading / duplicate AI button | Reported observation; not proven current defect | 197 |
| **Ten original Lovable scanner warnings** | 2,4,6,8,9,10 fixed/disproven in code; 5 pending live acceptance; 1/3 mitigated; 7 AI deferred. Do not reassign all 10 | 191, 192, 198, 204 only if needed |
| **Batch 12** RVOL expectation mismatch | One pre-existing failing test (54/55), separate non-P0 test debt | 198 |
| **ISS-016/017/018** npm, JS bundle, middleware | Partially mitigated / deferred as documented | 202 |
| **ISS-019** Browserslist | Previously mitigated; no new work without regression | 202 conditional |
| **ISS-006** Catalyst distribution | Source built, activation deferred | 203 |
| **ISS-015 / ISS-007** chat / AI Analyst | Deferred final cleanup | 204 |
| **ISS-008/009/010/011** live feed/AI Trader/broker/billing | Deferred product work | 205–208 |
| **ISS-012 / historical Gate I.3** SEC | Historical activation recorded; no rerun, no active migration request | No new batch unless new evidence |
| **ISS-013** community | Parked | 209 |
| **ISS-014** sitemap | Previously integrity informational; only if fresh launch audit flags issue | 202 |
| **Penny Continuation** | Separate concept; spec thresholds TBD | 199–200 conditional |

## 5. Archived completion register (do NOT reissue as active batches)

| Completed code/PR | Archive note |
| --- | --- |
| Batch 171 security mitigation, 172 catalyst source coverage, 173 Watchlist/Historical handoff | Merged; follow only outstanding production/activation evidence. |
| Batch 176 distribution bridge; 177 integration; 178 session-integrity; 179 public website; 180 public nav | Merged; source activation is separate. |
| Batch 181 issuer/source integrity **PR #180**; 182 Five Pillars **#181**; 183 desktop Radar **#182** | Merged; only bounded live acceptance or specifically reported defects remain. |
| Batches 184 navigation **PR #186**, 185 screener evidence **#187**, 186 Inbox **#189**, 187 earnings **#190**, 188 mobile/Journal **#191**, 189 homepage **#192** | **Merged**. Do not rewrite these features; production gates remain open where noted. |
| P0 D1 **PR #193 → `4f7c10db`** | Deployed in Lovable Cloud; pending live premarket acceptance. |
| CPU mitigation **PR #194 → `1398d16a`** | Merged and deployed Oct 28; **not a successful publication fix**. |
| Superseded PR #174 | Closed **without** merge. Historical docs preserved. |
| SEC Gate E / Gate I.3 historical activations | Previously completed; avoid repeating controlled writes or schedules. |

## 6. Continuity synchronization (PR #195)

Canonical GitHub docs updated by PR **#195** to reflect this register and Oct 28 deployment evidence. **Do not merge PR #195 automatically.** After merge, GitHub `main` becomes authoritative for the roadmap; forward-sync Lovable integration only when a later deployment is approved.

## 7. Recommended decision at owner review

**Approve Batch 190 only** as the next architecture/implementation assignment. Make CPU-safe publication the explicit P0 gate. Keep other batches sequenced but **not automatically authorized**. Once 190 publishes reliably, run 191 market acceptance and 192 Inbox/UI checks; split work only where ownership does not collide.

**Guardrails:** no backend migrations/Edge deploy/cron/Fly changes without independent approval, no Lovable frontend publishing, no browser-fabricated market data, no AI Trader, broker, billing or live feed upgrade now. Live auth/UI claims require actual authenticated evidence.

---

### Evidence sources

- GitHub `main`: `1398d16ad0041c34661e4bc76487c5a3757c207e`.
- Continuity docs, `docs/release/master-reset-2026-10-27.md`, scanner/inbox acceptance runbooks, Lovable Oct 28 release report (deploy 17:29:52 UTC; CPU errors 17:30/17:35; read-only `screener_feed_state` and cron through 17:45 UTC).
