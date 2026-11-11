# Batch 215 — 23×5-ready unified scanner session control

**Scope:** `sync-screener-data` staged cron path plus one shared schedule module. It does not change production configuration, cron job 25, migrations, Edge deployment, or GitHub/Lovable sync.

## Problem

The staged `cron` action started a new generation every five minutes, around the clock. `resolveSyncSessionKind` already classified weekends and weekday nights as `closed` (Batch 190.9), but nothing on the cron path checked it. Closed-session generations do no useful work. On the Oct 31 Saturday, false-open runs produced 164 `http_409` failures and 54 `prior_generation_retained` aborts (see the Batch 190.9 entries in `docs/CHANGELOG.md`). Weekday market holidays were also treated as open, because the scanner passed no exception calendar.

## Change

- **`supabase/functions/_shared/markets/equity-session-control.ts`** (new) is the single U.S.-equities schedule contract: `resolveEquitySession({ nowMs, exceptions, activation })`.
  - **Phases:** `pre-market`, `market`, `after-hours`, `overnight`, `maintenance_pause`, `weekend_closure`, `holiday_closure`, `overnight_inactive` (weekday nights while 23×5 is not active).
  - It returns `tradeDate`, the trading cycle an instant belongs to. Sunday 21:00 belongs to Monday's cycle, and Monday 21:00 to Tuesday's. No overnight session opens into a weekend or holiday.
  - It also returns `legacySessionKind`, identical to the current `resolveSyncSessionKind`, so existing volume and evidence semantics are untouched.
  - ET wall time comes from the existing `easternParts` (Intl `America/New_York`, DST-aware). Holidays and early closes come from the existing `market_session_calendar` exception rows.
  - Futures calendars (CME Sunday 18:00 – Friday 17:00 with a daily break) are explicitly **not** used. `MarketCalendarId = "us_equities"` reserves room for a separate futures module.
- **`handler.ts`, staged `cron` only:** after `abortExpired`, stranded-publish reconcile, and in-flight **resume**, and **before** any provider snapshot or NHL load, the handler loads the exception calendar and resolves the session. If the session is not scan-eligible, it returns `200 { ok: true, skipped: true, reason: "session_closed", phase, skip_reason, et_date, trade_date, holiday_name, calendar }` and logs `cron_session_skip`.
  - `continue` / `finalize` actions are never gated, so in-flight generations crossing into a closed session finish normally.
  - The prior published generation is never touched.
  - An unreadable calendar does **not** skip a weekday. Holidays can't be confirmed, so it fails open to a normal attempt.
- **Unchanged:** publish CAS, leases, atomic publication, Gappers and prior-generation retention guards, ranking, the legacy (non-staged) handler path, and cron job 25.

## Behavior before vs. after activation

| ET time | Before (default) | After 23×5 activation |
| --- | --- | --- |
| Mon–Fri 04:00–20:00 | Scan (premarket / regular / after-hours, unchanged) | Same |
| Mon–Thu 20:00–21:00 | Skip `overnight_not_activated` | Skip `maintenance_pause` |
| Sun–Thu 21:00–04:00 | Skip `overnight_not_activated` | `overnight` phase. **Skip `overnight_pipeline_not_ready`** until the pipeline batch lands |
| Fri 20:00 – Sun 21:00 | Skip `weekend_closure` | Skip `weekend_closure` |
| Calendar holiday | Skip `holiday_closure` (previously scanned) | Same; no overnight into the holiday |
| Early-close day | Sessions end at the calendar times | Same |

The two-week parity test (15-minute steps, null calendar) proves that before activation, scan eligibility equals `resolveSyncSessionKind !== "closed"` at every step.

## 23×5 activation prerequisites (all required; none set by this batch)

1. **Confirmed exchange readiness.** Set `STOCKSIST_EQUITY_23X5_EXCHANGE_EFFECTIVE_DATE` to the confirmed first overnight trade date in ET `YYYY-MM-DD` form. For a Sunday Dec 6, 2026 21:00 opening, that is `2026-12-07`, because the overnight session belongs to Monday's cycle.
2. **Supported market data.** Set `STOCKSIST_EQUITY_23X5_PROVIDER_OVERNIGHT_CONFIRMED=true` only after verifying that Polygon/Massive delivers overnight trades and aggregates for the subscribed tier.
3. **Owner authorization.** `STOCKSIST_EQUITY_23X5_OWNER_AUTHORIZED=true`, set in Lovable Cloud Edge secrets by the owner.
4. **Overnight scanner pipeline batch (code).** **Batch 221** added overnight session-volume and qualification semantics in `session-volume.ts`, `session-sync-context.ts`, and `equityTradeDateForVolume`. Flip `OVERNIGHT_SCANNER_PIPELINE_READY` only after owner activation prerequisites — see `docs/release/batch221-overnight-scanner-pipeline-v1.md`.
5. Deploy `sync-screener-data` through Lovable Cloud after review, and run an overnight acceptance window.

Flags are parsed strictly: only the exact string `true` and an ISO date count. The calendar date alone never activates anything.

## Verification

- `equity-session-control_test.ts` (15 tests) covers:
  - Saturday closure
  - Sunday 20:59 closed and Sunday 21:00 open, before and after activation
  - Mon–Thu maintenance pauses
  - Friday 20:00 weekend closure
  - midnight trade-date rollover
  - DST fall-back (Nov 1, 2026) and spring-forward (Mar 14, 2027)
  - Thanksgiving holiday, no overnight into it, and the early-close Friday
  - activation flag combinations and the Dec 6/7 effective date
  - strict env parsing
  - the pipeline-not-ready guard
  - the two-week parity sweep
- `batch215-cron-session-gate_test.ts` (7 handler-level tests) covers:
  - Saturday skip with no provider fetch, with cleanup, reconcile, and resume still called
  - an expired job aborted while closed
  - an in-flight job resuming across Friday 20:05
  - an open session reaching the provider (provider down → 503, not a skip)
  - a confirmed holiday skip, and an unreadable calendar not skipping
  - activation env alone not starting overnight generations
  - `continue` never gated
- Both files were added to CI job **Screener Deno regressions**.

## Limitations

- Provider-unavailable during an open session keeps the existing behavior: `503 provider_unavailable`, with no DB work and the prior generation retained. It is not a new state.
- Trading halts are per-symbol provider data, not a session phase. They are not modeled here.
- The client-side ISS-041 (`resolveMarketSessionAt` weekend-open fallback in the browser) is not changed by this batch.
