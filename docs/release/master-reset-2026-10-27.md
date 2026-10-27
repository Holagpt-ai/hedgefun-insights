# Stocksist — Master Reset V3 (2026-10-27)

**Evidence baseline:** GitHub `main` `e65746aba706e50ed0fec42a40f88140d99da0c2` (PR #184 merged); authenticated user mobile screenshots ~08:06–08:15 ET, 2026-10-27; prior handoff and October 25 Master Reset V2. **This is a triage and continuity record, not a claim of live backend acceptance.** Screenshots establish visible states; code inspection establishes implementations; Fly/Supabase/Vercel state requires a separately identified production check.

## Completed — archive, do not assign again

- SEC Gates B–I and Gate I.3 scheduled SEC ingestion activation previously recorded. Do not rerun or redeploy; catalyst *distribution* activation is different and still gated.
- Batches 171/172/173/176: security-performance, catalyst source coverage, watchlist/historical handoff, disabled-by-default catalyst bridge.
- Batch 177 PR #176 Lovable forward-sync/continuity alignment **merged**; subsequent PRs have advanced `main`, so integration branch is no longer current.
- Batch 178 PR #179 premarket session-integrity code **merged**; full premarket production-window acceptance not signed off.
- Batch 179 PR #177 public website/conversion V1 **merged**.
- Batch 180 PR #178 public navigation/UX V1 **merged**.
- Batch 181 PR #180 catalyst + Watchlist headline attribution correction **merged**; older persisted records not rewritten.
- Batch 182 PR #181 Five Pillars evidence presentation **merged**.
- Batch 183 PR #182 desktop Radar workspace tabs **merged**; unrelated mobile evidence issues remain.
- Batch 174/175 runbook PR #183 and Tuesday persistence-evidence PR #184 **merged**.
- Obsolete pre-session acceptance PR #174 **CLOSED, NOT MERGED**. No replacement PR for the old work.
- Fly worker v45 ranking parity previously checked; 5-minute history publish-blocking allegation disproven.
- AI Analyst/Catalyst regression, AI Trader, live feed upgrade, brokers and billing stay deferred.

## Production and acceptance truth

- **Batch 174: CONDITIONAL / NOT SIGNED OFF.** Timed live premarket/RTH/late-session matrix incomplete. Do not turn code-level passes into live-ops passes.
- **Batch 175: persistence PASS; authenticated Tuesday AM Inbox display NOT VERIFIED.** Monday 2026-10-26: 2,056 source rows, 827 distinct symbols; Tuesday active RPC 2,915 including 859 earlier carryovers. Reported category counts 351+412+482+805 = 2,050, **six fewer** than source-row total; reason not established. Actual AM UI screenshot shows `Late-Session Continuation` stuck on loading at ~08:07–08:09 ET; backend has data, but filter, loading, auth, entitlement, payload size, or response handling could be involved. **Do not mark Batch 175 PASS until resolved or reliably scoped.**
- Production Vercel asset-to-`main` commit parity, live Fly image source SHA, Edge revisions and Lovable Cloud source activation are independent, not inferred from Git merges.
- Lovable integration branch `cursor/lovable-sync-from-main-20261024` previously synced to `788b1b93`; as of 2026-10-27 it is **diverged** from current `main` (9 commits behind? GitHub compare showed integration base vs main `ahead_by: 9`, `behind_by: 11` in the `integration...main` direction). Cursor must perform non-destructive forward integration, preserving Lovable-only changes; do not merge archived `cursor/chat-single-pass-v1`.

## Newly reported / observed 2026-10-27 — not yet root-cause confirmed

| Track | Priority | Evidence | Target outcome |
| --- | --- | --- | --- |
| MOB-01 | P0 | Mobile taps on workflow links reportedly hang browser, requiring restart | Reproduce exact routes and resolve navigation/render/performance freeze; verify touch navigation |
| DATA-01 | P0 | Dashboard Gappers displays `Gap inputs unavailable`; Gainers/Losers and New Highs/Lows show `Evaluation evidence unavailable` | Determine provider/worker/evidence-persistence/generation gaps, check existing radar Gapper restoration and live input semantics; no invented rows |
| INBOX-01 | P0 | Tuesday AM Inbox Late-Session Continuation shows repeated loading despite Monday RPC persistence | Trace client response, date/session, cap/funnel, failure/timeouts, rendering; preserve volume-first priority and expiry |
| DATA-02 | P1 | Volume Leaders skeleton and Volume Spikes/Unusual Volume no matches while homepage populated with movers | Distinguish source universe, eligibility, fetch error and true zero-match; make truth states explicit |
| EARN-01 | P1 | Confirmed before-open cards emphasize AB, ABG, ACU; high-impact names not surfaced | Add deterministic **relevance ranking** on eligible verified earnings; distinguish calendar, actual results, timing unknown and related news. Confirm SOFI/SK Hynix coverage/reporting status rather than assume eligible |
| CAT-01 | P1 | TSLA card displays SpaceX headline under `Direct catalyst`; ORCL article also reviewed | Validate production Batch 181 issuer-match path, stored classification and deployment; avoid misattributing separate companies; no broad DB rewrite |
| UI-01 | P1 | Risk & Attention Flags huge blank region; continued skeletons and thin AI brief preview | Fix bounded loading/error/empty-state lifecycle and mobile layout; no fictitious data |
| UI-02 | P2 | Carryover Watch historical cards repeated unavailable evidence and lengthy Five Pillars text | Compact mobile summary with expandable details, maintain historical disclosure and full evidence |
| HOME-01 | P2 | Homepage still contains `AI Trader NOT ACTIVE / Watch AI Trader` despite approved removal | Remove from homepage only; no replacement module; product stays deferred |
| HOME-02 | P2 | `PRE-MARKET · OPENS IN · 8:14:48 AM EDT` mixes countdown and clock formatting | Render an actual duration or accurate absolute opening time |
| HOME-03 | P2 | Market Pulse repeats generic no-catalyst text on every mover | Compact, provenance-specific market movement, do not fabricate catalyst or AI causality |
| DESK-01 | P2 | Earlier desktop Radar History `Loading…`, duplicate AI Analyst action reported | Verify precisely in current build before correcting; do not reopen Batch 183 globally |

**Useful code anchors:** `src/pages/dashboard/AMInbox.tsx`, `src/lib/pre-market/builders.ts` (`selectDisplayEarnings` filters eligible and slices to 20; preserves server order), `src/lib/screeners/screener-truth-state.ts`, `src/lib/screeners/radar-gapper-restoration.ts`, `src/lib/markets/market-pulse-select.ts`, `supabase/functions/_shared/screeners/evaluation-evidence.ts`.

**Market Pulse is not a scanner qualification substitute.** Homepage provider top gainers/losers snapshots and authenticated Radar/Five Pillars use different universe and criteria. For example CLRO homepage ~08:15 ET $6.30/+26.69%/~7.28M volume versus **prior-session** Carryover Watch CLRO $4.76/83.0M are different sessions, not proven inconsistent same-time quotes. Test whether current-session qualified candidates are excluded for an explainable reason.

## Execution order (Cursor, substantial distinct batches)

1. **Batch 184 — Mobile navigation freeze + terminal loading states (P0).** Narrow reproduction of exact clicked links and unresolved UI requests on Android Chrome; fix infinite rerender, navigation loops, oversized requests, blocking UI work, or timeout handling only if reproduced. Ensure failures return bounded retry/error and do not strand the page. No AI Analyst Edge changes.
2. **Batch 185 — Scanner input/evaluation completeness (P0).** Use read-only current session snapshots / existing generation fields, `tab_evaluation_evidence`, prior-close source, worker publish timestamps, and the existing extended-session restoration helper. Repair verified missing data path without relaxing threshold or replacing provider data with homepage snapshot inference. Preserve 15-minute delay and volume-first ordering.
3. **Batch 186 — Tuesday continuation → AM Inbox visible handoff (P0/P1).** Resolve live loading/limiting/filters with Batch 175 read-only RPC and authentication. Record category counts, source/target session, timing, active/expired view, symbol-aware navigation. Mark Batch 175 fully accepted **only** with authenticated evidence; otherwise keep conditional.
4. **Batch 187 — Earnings + catalyst priority and issuer relevance (P1).** Confirm full provider coverage for 2026-10-27; classify earnings scheduled/confirmed/actual results, then implement deterministic market-impact ranking from available trustworthy data; retain traceable fallback and no invented surprise/guidance. Test SOFI/SK Hynix identity/calendar eligibility. Verify current Batch 181 guards on real TSLA/SpaceX examples; bounded reconciliation plan only if necessary.
5. **Batch 188 — AM Brief/UI density, skeleton & Carryover mobile design (P1/P2).** Fix brief truncation, skeleton termination, Risk Flags blank height, mobile carryover compact/expandable design, repetitive generic text. No backend changes unless proven dependency.
6. **Batch 189 — Homepage approved cleanup and market-pulse disclosures (P2).** Remove AI Trader from mobile/desktop homepage only; correct market-open countdown; compact repeated Market Pulse catalyst disclaimers while retaining per-symbol provenance. Preserve other homepage design and IPO/footer order.
7. **Operations / documentation closure (parallel, narrowly scoped).** Cursor syncs Lovable integration branch forward without wholesale branch merging into `main`; update `PROJECT_MEMORY`, `SESSION_HANDOFF`, `ISSUE_REGISTER`, `CHANGELOG`, `DEPLOYMENT_STATUS`, `next-approved-batches` after actual PR merges/deploy verifications. Preserve exact rollback SHA. Avoid production migrations / Edge / Fly operations without specific permission.

## Remaining separate gates / deferrals

- **ISS-006** Catalyst distribution: source bridge implemented; requires separately approved, server-only entry point, SEC accession provenance at boundary, per-row partial-write accounting, migrations and deployed version confirmation, source registry/flags and dry-run staged activation in Lovable Cloud. **Not an active SEC Gate I rerun.**
- Batch 174 full live scanner matrix; market-data quota/cache live sufficiency; radar persistence/migration state; watchdog recovery — validate only alongside relevant focused P0 correction or release acceptance, not a new broad audit.
- Batch 12 RVOL regression expectation (54/55 previously); desktop History Loading/duplicate AI Analyst; bounded old database catalyst classification reconciliation. Confirm before modification.
- Penny Continuation is **not** existing Penny Stocks; a dedicated sub-$1 continuation engine is **unapproved**, spec thresholds to be determined. Do not build by default.
- Deferred: ISS-015 chat rollback/Edge; MRVL AI Analyst V2.1/context regressions, AI Trader, real-time-feed/Cboe upgrade, brokers, newsletter/billing/payments, remaining noncritical npm advisories, middleware deprecation, full accessibility/security launch review.

## Guardrails

GitHub `main` is canonical code, not proof of Vercel/Lovable Cloud/Fly synchronization. Read the three mandatory continuity files at the start of each Cursor batch; use `docs/ARCHITECTURE.md`/`docs/DEPLOYMENT_STATUS.md` when relevant. Keep completed work in changelog and open work in the issue register. Every PR requires focused tests/typecheck/build and explicit approval before merge/deploy. Do not publish via Lovable or auto-deploy migrations/Edge functions. Do not reopen finished batches without fresh evidence.
