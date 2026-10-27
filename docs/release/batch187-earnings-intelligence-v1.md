# Batch 187 — Earnings intelligence & market-impact prioritization V1

**Issues:** ISS-026 (primary), ISS-028 (targeted catalyst verify)  
**Base:** `main` `d3cec11f` (PR **#189** Batch 186 merged)

## Root causes

1. **Source completeness** — Before-open earnings were derived from the same `catalyst_events` query capped at **400** rows across three ET days mixed with Polygon news, so many authoritative `earnings_calendar` rows for today could be omitted while unrelated news consumed the cap.
2. **Ordering** — `selectBeforeOpenEarnings` used watchlist-first then **alphabetical** ticker order (`AB`, `ABG`, …) with no market-impact signal.
3. **Timing ingestion** — Finnhub missing/unknown `hour` mapped to **`during`**, implying intraday reporting without provider evidence.

## Fixes (source)

| Area | Change |
| --- | --- |
| Workspace IO | Dedicated today ET `earnings_calendar` catalyst query (`EARNINGS_CALENDAR_FETCH_LIMIT` 320); general catalyst query excludes `earnings_calendar` provider |
| Ranking | `earnings-market-impact.ts` — surprise, activity, cap significance, watchlist; deterministic tie-break |
| Selection | Rank **before** `EARNINGS_DISPLAY_LIMIT` (20); AM Inbox still Top 3 via `TopNReveal` |
| Timing | `mapFinnhubTimeOfDay` unknown → `null`; sync sets `facts.timing_unspecified`; unconfirmed bucket includes flagged `during` |
| UI | Company name, scheduled vs reported, priority reason line |

## Oct 27 regression references (read-only prod)

- ~65 BMO / ~76 AMC / ~71 during-or-unspecified calendar rows observed; SOFI BMO with actual EPS should rank on evidence not ticker override.
- **SK Hynix:** Korean listing; no verified U.S. `earnings_calendar` row without provider symbol — not injected into U.S. AM calendar.
- **ISS-028 TSLA/SpaceX:** Existing Batch 181 `looksLikeMarketAttention` + precedence tests still classify comparison headlines as secondary; no new regression reproduced in attribution path.

## Production dependencies

- **Edge deploy:** `get-pre-market-workspace` (required for ranking + separate earnings fetch).
- **Optional:** `sync-catalyst-events` / `sync-earnings` deploy for forward `timing_unspecified` facts on new ingests (existing `during` rows without flag unchanged).
- **No migration apply** from Cursor; forward-only note: `earnings_calendar.time_of_day` already allows NULL in schema.

## Verification

```sh
npm run typecheck
npm run build
deno test supabase/functions/_shared/pre-market/earnings-market-impact_test.ts
deno test supabase/functions/_shared/pre-market/contract_test.ts
deno test supabase/functions/_shared/earnings/finnhub-calendar_test.ts
```

Authenticated AM Inbox earnings order after Vercel + Edge deploy: **NOT VERIFIED** in Cursor.
