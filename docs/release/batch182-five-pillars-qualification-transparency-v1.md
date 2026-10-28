# Batch 182 — Five Pillars Qualification Transparency V1

**Base:** `origin/main` `d4095c86`. **No migrations**, Edge deploy, or Fly changes.

## Problem

Day Trade Radar showed funnel counts and monitoring copy but did not expose each configured Five Pillars gate with observed values, thresholds, grace, or lifecycle state in the detail panel.

## Fix

| Area | Change |
| --- | --- |
| Read model | `src/lib/day-trade/five-pillars-transparency.ts` — PASS/FAIL/GRACE/MISSING from canonical row fields + persisted lifecycle |
| UI | `FivePillarsQualificationSection` in Radar detail drawer (compact summary, expandable pillar evidence) |
| Wiring | `DayTradeRadarV2` passes persisted qualification state and on-desk flag into `RadarDetailPanel` |
| Tests | `five-pillars-transparency.test.ts` — grace, expired, missing evidence, funnel alignment |

## Pillars (configured thresholds)

- Price `$2–$20` (`LEGACY_PRICE_MIN` / `LEGACY_PRICE_MAX`)
- Day move `≥ +10%` (`LEGACY_MOVE_MIN_PCT`)
- Float `≤ 10M sh` (`DAY_TRADE_FLOAT_MAX_SHARES`)
- Relative volume `≥ 5×` on any trusted RVOL signal (`DAY_TRADE_RVOL_MIN`)
- Desk freshness — existing `evaluateDayTradeFreshness` / `qualifiesDayTradeFreshness`

Grace policy copy references `DAY_TRADE_QUALIFICATION_GRACE_*` from `day-trade-qualification-lifecycle.config.ts`.

## Out of scope

- Desktop Radar tab restructuring (**Batch 183**)
- Scanner ranking or worker changes
- New qualification rules

## Deployment

Vercel SPA only after merge. No backend apply required for read-only UI; persisted lifecycle rows still come from existing `day_trade_qualification_list_v1` RPC.
