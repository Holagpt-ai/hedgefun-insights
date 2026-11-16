# ISS-034 — Option B: degraded Gappers publication (design only)

**Status:** **IMPLEMENTED** (tests only) on branch `cursor/iss034-option-b-degraded-gappers-publish` — **NOT deployed**; flag default **off**.  
**Depends on:** PR **#260** (diagnostics + replay).  
**Intent:** Let independently **evaluated** tabs publish while Gappers remains honestly **`prerequisite_unavailable`** when gap-input coverage is incomplete.

## Problem (Nov 16)

- Candidate generations reach `build_evidence` with G/L + NHL **evaluated**, Gappers **`gap_input_coverage_incomplete`** (`unresolved_gap_input_count=2`, ASBPW + ASPCR, `missing_prior_close`).
- `shouldPreservePriorScreenerGeneration` blocks **entire** publication when any preservation tab degrades evaluated → prerequisite_unavailable.
- Feed frozen at **9:25 AM**; Gappers UI still shows **`evaluated`** rows from that generation (not afternoon candidate).

## Option B principles

1. **No false Gappers evaluated** — Gappers tab evidence must stay `prerequisite_unavailable` with reason `gap_input_coverage_incomplete` (or stricter) when unresolved > 0.
2. **No unverified Gappers rows** — do not publish new Gappers qualifying rows from a generation that failed Gappers accounting; either **retain prior Gappers rows** with explicit cross-generation disclosure, or publish **zero** Gappers rows with honest empty state.
3. **No misleading freshness** — `screener_feed_state.synced_at` advances only on **successful atomic publish**; Gappers-specific UI must not imply a fresh full-universe Gappers evaluation when evidence says unavailable (fix client truth-state / freshness coupling).
4. **Atomic generation consistency** — keep single `replace_screener_results_generation_v1` transaction; all six tab evidence objects present for Layer C `assert_screener_tab_evaluation_evidence_v1`.
5. **Fail-closed default off** — Option B is **opt-in** via owner flag / env (not enabled in production until approved).

## Proposed source diff (approval gating)

| Area | Current | Option B (proposed) |
| --- | --- | --- |
| `generation-preserve.ts` | Block publish if Gappers (or G/L, NHL) degrades | **Split policy:** `shouldPreservePriorScreenerGeneration` unchanged for G/L + NHL; add `shouldBlockAtomicPublicationForGappersOnlyDegrade` → when **only** Gappers degrades and flag set → **do not** retain entire generation |
| `handler.ts` finalize | `preserve_check` → abort job, no RPC | On approved flag: build **composite rows** — candidate rows for evaluated tabs; Gappers rows **empty** or **carry forward** prior feed Gappers slice with metadata |
| Gappers row builder | `gapperSelected` from live universe | If Gappers evidence not `evaluated`, **omit** new Gappers rows from candidate payload (or merge prior rows server-side) |
| `tab_evaluation_evidence` | All six tabs from candidate | Gappers: honest `prerequisite_unavailable`; other tabs: candidate `evaluated` |
| Layer C job column | Same payload at publish | **No SQL shape change** — `prerequisite_unavailable` already valid in assert |
| Client `screener-truth-state.ts` | 9:25 `evaluated` Gappers → `evaluated_with_results` + `showFreshness` | When feed `synced_at` advances but Gappers evidence unavailable: **`prerequisite_unavailable`** copy, `showRows: false` or stale-row mode with **generation_stale** advisory |
| `useScreenerData.ts` | Radar intraday overlay on Gappers rows | Do not overlay metrics that imply fresh Gappers qualification when Gappers evidence ≠ `evaluated` |

## Layer C / ISS-024 compatibility

- Migration `20261116153000` already allows per-tab `prerequisite_unavailable` in `assert_screener_tab_evaluation_evidence_v1`.
- Published job row stores **candidate** evidence at atomic publish — Option B publishes **mixed-status** six-tab map (legal today).
- **Recovery / reconcile:** `complete_screener_sync_publish_v1` idempotent replay must accept same mixed evidence; no migration change required if row merge is handler-only before RPC.
- **Risk:** prior carry-forward Gappers rows may reference **older** `sync_run_id` symbols — document in `tab_evaluation_evidence.gappers` with optional `carried_from_sync_run_id` (new optional field — **requires owner approval** for schema/evidence contract).

## Frontend freshness reconciliation (Nov 16 symptom)

| Layer | 5:05 PM ET behavior |
| --- | --- |
| `screener_feed_state` | Last publish **9:25 AM** — `synced_at` and `provider_as_of_max` reflect **morning** generation only |
| Aborted jobs | Carry afternoon `tab_evaluation_evidence` in job rows (post–Layer C deploy) but **do not** update feed |
| Gappers UI | Reads **published** generation where Gappers was **`evaluated`** at 9:25 → truth state `evaluated_with_results`, `showFreshness: true` |
| Row `provider_as_of` | Per-row observation timestamps from **published** rows (9:25 scan), not afternoon candidate |
| Radar overlay (`overlayCanonicalIntradayMetrics`) | May refresh **intraday metrics** on existing Gappers rows when Radar V2 loads — **does not** update feed `synced_at`; can make prices/metrics look newer while generation metadata stays 9:25 |

**Conclusion:** Observed “recent provider observation” is likely **row-level metrics / provider_as_of from overlay or per-symbol fields**, while **generation freshness** (`synced_at`) correctly remains 9:25 AM until a publish succeeds. Option B must tighten Gappers truth-state so users are not told “Results available” when afternoon accounting failed.

## Regression plan (post-approval implementation)

| # | Scenario | Assert |
| --- | --- | --- |
| R1 | Same-day retention (flag off) | Gappers degrade → `prior_generation_retained` (unchanged) |
| R2 | Option B publish (flag on) | G/L + NHL rows update; Gappers evidence `prerequisite_unavailable`; no Gappers rows with gap % from failed generation |
| R3 | ASBPW / ASPCR | `missing_prior_close`, not `no_prior_session` when baseline/exclusion present |
| R4 | Later Gappers recovery | Afternoon job with `unresolved=0` → full six-tab `evaluated` publish; feed `synced_at` advances |
| R5 | Job evidence | Layer C column matches feed evidence; abort jobs retain `candidate_gappers` |
| R6 | Client truth | After Option B publish: Gappers tab not `evaluated_with_results` when evidence unavailable |
| R7 | Atomic RPC | Single `replace_screener_results_generation_v1`; row count matches payload; no partial feed |

## Compatibility risks

| Risk | Mitigation |
| --- | --- |
| Mixed-generation Gappers rows | Explicit carry-forward metadata; client stale disclosure |
| Ops false “published” signal | Job ledger `published` only when RPC succeeds; Gappers status in evidence |
| Preserve policy drift | Keep G/L + NHL retain rules; flag scoped to Gappers-only degrade |
| Layer C audit confusion | Job row shows mixed tab statuses — document in runbook |
| MCP / client parsers | `tab-evaluation-evidence.ts` already parses `prerequisite_unavailable` |

## Release dependencies (if approved)

1. **Owner approval** of Option B policy + carry-forward vs empty Gappers rows.
2. **Edge:** `sync-screener-data` only (handler + preserve policy + row merge).
3. **Optional client:** truth-state + freshness (Vercel frontend) — can ship with or immediately after Edge.
4. **Layer C SQL:** apply `20261116153000` before relying on per-job historical evidence (orthogonal but recommended for abort audit).
5. **No Fly / cron / secrets** change required for Option B core.

## Explicit non-goals (this design)

- Synthesizing `prevDay.c` or opens for ASBPW/ASPCR.
- Weakening `unresolved_gap_input_count` accounting.
- Merging PR #260 Option B without a separate approval ticket.