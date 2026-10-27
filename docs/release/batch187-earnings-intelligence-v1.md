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

### Batch 187.1 (PR #190 amendment)

| Area | Change |
| --- | --- |
| Activity evidence | Symbol-targeted `screener_results` lookup across activity tabs (not top-24 Day Trade Radar slice); freshness gated by `SCREENER_STALE_MINUTES` during active sessions; **`activity_verified`** required before momentum scoring |
| Market cap | `ticker_search.market_cap` only (no `stocks` volume — not current-session evidence) |
| Scoring | Recalibrated surprise bands (`×1_000` not `×1_000_000`); minor surprises cannot beat mega-cap significance |
| Completeness | `earnings_calendar_source_truncated` + `earnings_calendar_fetch_limit` on workspace when bounded query hits cap |
| Dedup | `assessEarningsCalendarSource()` documents raw vs deduped counts |

**Oct 27 read-only:** 65 BMO symbols · 0 in top-24 radar · 0 anywhere on day_trade_radar tab · 3 on other screener tabs — ranking must use per-symbol screener hits, not radar leader slice.

## Oct 27 regression references (read-only prod)

- ~65 BMO / ~76 AMC / ~71 during-or-unspecified calendar rows observed; SOFI BMO with actual EPS should rank on evidence not ticker override.
- **SK Hynix:** Korean listing; no verified U.S. `earnings_calendar` row without provider symbol — not injected into U.S. AM calendar.
- **ISS-028 TSLA/SpaceX:** Existing Batch 181 `looksLikeMarketAttention` + precedence tests still classify comparison headlines as secondary; no new regression reproduced in attribution path.

## Production dependencies (distinct deploy responsibilities)

| Deployable | Required for | Live revision in Cursor |
| --- | --- | --- |
| **`get-pre-market-workspace`** | Dedicated calendar fetch, market-impact ranking, truncation flags, verified activity merge | **UNKNOWN** — deploy via Lovable after merge |
| **`sync-earnings-finnhub`** | Forward Finnhub unknown-hour → `NULL` in `earnings_calendar` | **UNKNOWN** — timing-activation sequence |
| **`sync-catalyst-events`** | Propagate `facts.timing_unspecified` on catalyst rows synced from calendar | **UNKNOWN** — timing-activation sequence |

Steps **2–3** are a **separately authorized timing-activation sequence**. Do not rewrite historical earnings rows or replay migrations. Confirm live Edge revision ids in Lovable before deploy.

**Vercel:** required for AM Inbox earnings card fields (`priority_reason`, scheduled/reported).

## Verification

```sh
npm run typecheck
npm run build
deno test supabase/functions/_shared/pre-market/earnings-market-impact_test.ts
deno test supabase/functions/_shared/pre-market/load-earnings-market-metadata_test.ts
deno test supabase/functions/_shared/pre-market/earnings-calendar-source_test.ts
deno test supabase/functions/_shared/pre-market/contract_test.ts
deno test supabase/functions/_shared/earnings/finnhub-calendar_test.ts
deno check supabase/functions/get-pre-market-workspace/index.ts
```

Authenticated AM Inbox earnings order after Vercel + Edge deploy: **NOT VERIFIED** in Cursor.
