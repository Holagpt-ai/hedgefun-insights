# Recurring historical daily catch-up (prepared — not activated)

## Current state

- Fly app `stocksist-historical-backfill-job` is **one-shot** (`min_machines_running = 0`, `auto_start_machines = false`, `restart = never`).
- There is **no** Lovable cron, Fly schedule, or GitHub Action enabled for catch-up.
- Staleness occurs when operators do not scale to 1 after the last completed U.S. session.

## Smallest production-ready pattern (manual or external trigger)

1. **Overlap guard:** Before scale-up, `fly machines list` must be empty. External scheduler should use a lock (e.g. one-row lease or process mutex).
2. **Target session:** Set `HISTORICAL_CATCHUP_TARGET_SESSION` to the latest completed session (helper: `npx vite-node scripts/historical/resolve-catchup-target.ts`).
3. **Entitlement:** Keep `HISTORICAL_PROVIDER_ENTITLEMENT_FLOOR_DATE` at the verified Polygon boundary (re-probe quarterly; max five rolling years).
4. **Queue cursor:** After each run, persist `catch_up_queue_state.queueAfterSymbol` → Fly secret `HISTORICAL_CATCHUP_QUEUE_AFTER_SYMBOL` (symbol cursor, not numeric offset).
5. **Preflight:** Run once with `HISTORICAL_CATCHUP_PREFLIGHT_ONLY=1`, then unset for the write pass.
6. **Bounded loop:** Use `scripts/historical/run-fly-catchup-campaign.ps1` or repeated `fly scale count 1` with caps from `historical-catchup.config.ts`.
7. **Cleanup:** `fly scale count 0`; restore `HISTORICAL_CATCHUP_PREFLIGHT_ONLY=1`.

## Executable driver (not scheduled)

- `scripts/historical/Invoke-RecurringHistoricalCatchup.ps1` — dry-run by default; pass `-Execute` for one bounded campaign iteration. This process is the sole lock owner; it calls the campaign script with `-AssumeLockHeld` and never lets a nested invocation delete a foreign lock or scale down another run.
- `scripts/historical/run-fly-catchup-campaign.ps1` — restores `campaign-state.nov26.json` across invocations (Nov 26 campaign: 3/20 runs, ~3410 provider budget used). Reserves the full per-run provider allowance before scale-up; unknown consumption keeps that reservation. Cleanup checks Fly exit codes and verifies zero machines plus restored `HISTORICAL_CATCHUP_PREFLIGHT_ONLY`.

## What not to do without owner authorization

- Fly Machines API cron / scheduled machines always-on
- Supabase `pg_cron` jobs for Fly scale
- New SQL migrations for queue state

## Recovery

- Interrupted symbol jobs: scale to 1 without unsetting preflight if `HISTORICAL_CATCHUP_RESUME_ONLY=1` and job UUID are set (see Batch 33.6 runbook).
- Queue starvation: set `HISTORICAL_CATCHUP_QUEUE_AFTER_SYMBOL` from logs; deploy worker with Batch 33.9 queue fix before large campaigns.