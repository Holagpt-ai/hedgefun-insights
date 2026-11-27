# Historical catch-up — resumable activation procedure (prepared, not executed)

Owner authorization required for every step. Cursor must not deploy Fly, scale machines, unset preflight, or write production data.

## Preserved production checkpoint (do not reset)

| Field | Value |
| --- | --- |
| App | `stocksist-historical-backfill-job` |
| Image | **v57** `deployment-01M8CCYWZQZHBNJ9FDMAP6N2CK` (until corrected image replaces it) |
| Machines | **0** |
| Cursor | `BKH` |
| Eligible remaining | ~**4735** |
| Durable securities / rows / episodes | **599** / **340,797** / **32,939** |
| Campaign | **16/20** executions; provider **7432** measured + **7500** reserved / **50000** |
| Target session | `2026-11-25` |
| Entitlement floor | `2021-11-29` |
| Preflight | **on** |
| Scheduler | **disabled** |

## Failure class corrected in git (this PR)

Repeated identical **200-symbol** empty windows at `BKH` (`ambiguous_identity` / `unsupported_ticker`) with `maxEmptyResolutionBatches` abort before jobs, exclusive cursor not progressing past the deferral belt, and campaign continuing empty burns. Source now exclusive-advances past deferred windows, wraps once then stops with `queue_cycle_exhausted`, raises empty-window bound to **3**, refreshes Fly queue secret every run, and halts on `stuck_queue_cursor`.

## Activation sequence

1. **Deploy corrected worker** from the merged git SHA to Fly `stocksist-historical-backfill-job` (owner Lovable/Fly path). Keep `min_machines_running = 0`, `auto_start_machines = false`, `restart = never`. Record image id for rollback to v57 recovery `deployment-01M5JGEZBCYDGE1KHFT8CRVS6Z` if needed.
2. **Preflight-only:** ensure `HISTORICAL_CATCHUP_PREFLIGHT_ONLY=1`, target `2026-11-25`, floor `2021-11-29`, caps `600/3/2500`, eligibility `200`, cursor `BKH`. Scale to 1 once; expect `catch_up_preflight_ok`. Scale to 0.
3. **Limited authorized write pass:** restore campaign state from `scripts/historical/campaign-state.nov26.json` (16/20, 7432+7500, cursor `BKH`). Unset preflight only for the campaign owner process. Run `run-fly-catchup-campaign.ps1 -SingleRun` (or `Invoke-RecurringHistoricalCatchup.ps1 -Execute` with lock). Expect cursor **past** the BKH deferral belt and/or `batchesRun > 0`.
4. **Durable progress reconciliation:** confirm new job rows, daily history growth, eligible remaining decrease; update campaign JSON from logs; restore preflight + zero machines.
5. **Episode reconstruction:** completed catch-up jobs must flow through existing `historical_apply_episode_batch` RPC chain (no new tables). Confirm `max(episode_start)` advances past Oct 20 when writes succeed.
6. **Repeat Movers freshness:** authenticated Radar Repeat Movers should leave global “unavailable” once episodes exist for sampled symbols; preserve unavailable/stale/incomplete vs legitimate no-match distinctions already in client.
7. **Recurring readiness:** keep scheduler **off**. When daily catch-up is approved, use `Invoke-RecurringHistoricalCatchup.ps1` with latest completed session from `resolve-catchup-target.ts`, five-year/entitlement floor, overlap lock, and cleanup verifying preflight + zero machines.

## Hard stops

- Do not raise `maxProviderRequests` / per-run allowances.
- Do not reset campaign counters or delete historical rows.
- Do not activate Fly/GitHub/Lovable cron without a separate owner ticket.
- Scanner v530, Radar v50, Option B, Layer C, Calendar, Watchlist homepage, AI Trader remain out of scope.
