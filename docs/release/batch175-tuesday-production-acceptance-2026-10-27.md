# Batch 175 — Tuesday production acceptance (2026-10-27 AM)

**Git `main`:** **`13a018a9`** (PR **#183** merged).  
**Evidence run:** 2026-10-26 ~17:12 ET (Monday late session; Tuesday premarket not yet observed in UI).  
**Production project:** Lovable Cloud `zcjptaolpumhtlwhlemq`.

## Evidence matrix

| Criterion | Result | Evidence |
| --- | --- | --- |
| Monday 2026-10-26 captures persisted | **PASS** | `late_session_handoff_list_active_v1('2026-10-27')` → **2,056** rows with `source_session_date = 2026-10-26` (**827** unique symbols) |
| Categories present | **PASS** | `POWER_HOUR_MOMENTUM` 351 · `STRONG_CLOSE_NEAR_HOD` 412 · `AFTER_HOURS_CONTINUATION` 482 · `DAY_TWO_WATCH` 805 |
| Eligible for AM **2026-10-27** | **PASS** | All **2,056** Monday rows have `valid_from_session_date = 2026-10-27`; **0** mismatches |
| Expiry / session-date gating | **PASS** | Same RPC for `p_am_session_date = 2026-10-26` returns **0** Monday-source rows (Monday captures not active on Monday AM date) |
| RPC vs persistence | **PASS (RPC path)** | Direct `SELECT` on `late_session_continuation_handoffs` denied to publishable key (expected RLS); RPC is the product read path and returned rows |
| Worker / upsert execution | **PASS (inferred)** | Sample `source_timestamp` cluster **`2026-10-26T21:11:34Z`** (~5:11 PM ET) on Monday rows — consistent with late-session bridge upsert, not manual backfill |
| Authenticated AM Inbox UI | **NOT VERIFIED** | `/dashboard/pre-market` redirects to login; no Pro session in this run |
| Category labels / prior-session copy / handoffs | **NOT VERIFIED (UI)** | Component contract unchanged; regression tests **PASS** |
| Empty / expired honest states | **NOT VERIFIED (UI)** | RPC shows **859** additional active rows from **`2026-10-23`** (Day-Two window) on AM **2026-10-27** — funnel/limit behavior not spot-checked in UI |

## Read-only probe

```sh
node scripts/ops/batch175-readonly-handoff-probe.mjs 2026-10-27
node scripts/ops/batch175-readonly-handoff-probe.mjs 2026-10-26
```

Uses local `.env` publishable key against production Supabase RPC only (no writes).

## PR #174

Superseded by merged runbooks on **`13a018a9`**. **Close #174 without merge**; preserve its 2026-10-25 pre-session Fly notes in git history only.

## Next actions

| Action | Owner |
| --- | --- |
| Authenticated AM Inbox spot-check on **2026-10-27** premarket (cards, categories, prior-session disclaimer, symbol actions) | Product / ops with Pro login |
| Optional Lovable SQL row count reconcile vs RPC totals | Lovable Cloud |
| Close PR **#174** | GitHub maintainer |

No implementation defect confirmed. **No scanner engine batch** required for Batch 175 persistence path.
