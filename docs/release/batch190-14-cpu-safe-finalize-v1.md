# Batch 190.14 — CPU-safe staged finalize

**Priority:** P0 (ISS-034 publication reliability)  
**Base:** GitHub `main` **`3bd3ee68`**  
**Scope:** Edge `sync-screener-data` staged **finalize** path only (no migrations).

## Production failure (preserved)

**2026-11-04 20:55:47 UTC** — Lovable `sync-screener-data` **v506**: seven of seven chunks completed; **finalize** returned **HTTP 546** (`CPU Time exceeded`); finalize lease remained held; **no new generation published**. Same **546** pattern on earlier Nov 4 runs.

## Root cause (code)

Finalize replayed **full-universe** work already bounded across chunks:

1. **Gainers/losers tab evidence** re-scanned the G/L universe for `qualified_count` after `selectForTab` had already filtered the same universe.
2. **Day Trade qualification capture** built a 13k+ ticker index and ran lifecycle I/O **before** the HTTP response on the finalize critical path.

## Fix (minimal)

| Change | Effect |
| --- | --- |
| `selectGainersLosersFromUniverse` | Single pass → `{ selected, qualifiedCount }` for selection + evidence |
| `gainersLosersQualifiedCount` on chunk + monolithic evidence builders | Skips second G/L universe scan at finalize |
| `deferEdgeWork` for `captureDayTradeQualificationFromSync` | Post-publish lifecycle off hot path (same pattern as staged continue dispatch) |
| `indexPolygonTickersBySymbol` | One index build for day-trade capture |
| `logFinalizeStageTimings` | Stage wall-clock logs for production triage |

**Unchanged:** chunk leases, atomic `publish_screener_sync_staged_generation_v1`, Batch **190.12** reconcile, Batch **190.13** cron body normalize, six-tab semantics, Five Pillars, volume-first ranking.

## Local benchmark (not Edge CPU)

Representative **13,262** symbols, regular session (`sync-screener-universe-cpu_test.ts`):

| Metric | Before (legacy rescan) | After (precomputed G/L count) |
| --- | ---: | ---: |
| G/L evidence pass | ~0.86 ms local | ~0.02 ms local |

Full staged path optimized vs legacy multi-pass remains **~3.6s vs ~30s** local elapsed (existing benchmark).

## Tests

- `supabase/functions/_shared/screeners/batch190-14-finalize-cpu_test.ts`
- `supabase/functions/_shared/screeners/sync-screener-universe-cpu_test.ts` (190.14 assertion)
- Critical screener Deno regressions workflow

## Activation (owner)

1. Merge PR to `main`.
2. **Lovable Cloud** deploy Edge **`sync-screener-data`** only.
3. Verify: staged run completes finalize → `published`; logs include `staged_finalize_timing`; no **546** on 13k universe.
4. Confirm Batch **190.12** migration + **190.13** cron fix applied if not already.

## Rollback

Redeploy prior `sync-screener-data` bundle from Lovable revision history. No schema rollback.
