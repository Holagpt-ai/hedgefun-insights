# Batch 219.3B — NHL baseline UI consistency (ISS-045)

**Base:** GitHub `main` `dc9305f59d46e208d9a96f6c3650b2da6a9e48da`  
**Scope:** Frontend truth-state copy only. No Fly, SQL, Edge, cron, or scanner publish changes.

## Reported production incident (owner, Nov 11 ~7:41 AM ET)

- NHL tab UI: **Baseline unavailable**
- Prior 7:40 AM published job: `nhl_baseline_loaded=true`, baseline generation `1b65754e-c454-4188-9f85-0640b493f555`, **12,118** symbols

## Root cause (reproduced in unit tests)

`resolveScreenerTruthState` → `copyForReason("generation_unavailable")` always returned NHL **Baseline unavailable** copy. That mislabels:

1. **Session gate:** `viewForActiveTab` returns `unavailable` when `assessScreenerGenerationSession` is `previous_during_live` (prior surveillance-day `provider_as_of` during live pre-market/RTH/AH), even when `nhl_baseline_status` is `available`.
2. **Generation validation / fetch failures:** `loadVerifiedScreenerGeneration` → `unavailableView` with no verified baseline signal.

Fail-closed generation integrity is unchanged; only user-visible copy distinguishes baseline vs generation unavailability.

## Fix

`screener-truth-state.ts`: `generation_unavailable` uses generic screener unavailable copy for all tabs. `baseline_unavailable` remains gated on `nhl_baseline_status === "unavailable"`.

## Tests

- `screener-truth-state.test.ts`
- `screener-session.test.ts` (NHL + previous-session gate + available baseline metadata)

## Acceptance

- [ ] Vercel deploy from merged PR
- [ ] During pre-market with available baseline in `screener_feed_state`, NHL tab must not show **Baseline unavailable** unless feed state reports `nhl_baseline_status: unavailable`
- [ ] ISS-044 closed-session acceptance remains independent (Fly v48, weekday 20:00 ET)
