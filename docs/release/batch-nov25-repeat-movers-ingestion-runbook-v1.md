# Repeat Movers / `market_behavior_episodes` ingestion — owner runbook (Nov 25)

## Observed production condition

- Latest `market_behavior_episodes.episode_start` was **October 20, 2026** at read-only inspection (Nov 25).
- Sampled symbols (APUS, NRSN, MUZ, NVD, NVDQ, OMH, SSPC) returned **no comparable episodes** for the current board.
- Authenticated Radar **Repeat Movers** correctly reports history unavailable when profiles cannot be assembled — this is **not** a zero-match conclusion.

## Root cause class

**Historical ingestion / scheduling gap**, not a client-only defect. The `radar-historical-context` → `radar-worker-bridge` (`repeat_mover_get_context`) path reads Postgres tables only; it does not fabricate episodes.

## What this PR fixes in code

- Edge client sends **publishable/anon `apikey`** separately from the user Bearer JWT (gateway compatibility).
- Existing **>20-symbol batching** remains unchanged (`RADAR_HISTORICAL_CONTEXT_MAX_REQUESTS_PER_BATCH = 20`).

## Required production action (separate authorization — do not run from Cursor)

1. **Confirm Fly workers** `stocksist-historical-backfill-job` and Radar ingestion schedules in Lovable Cloud (no deploy from this PR).
2. **Verify secrets**: `RADAR_WORKER_SECRET` on Edge `radar-historical-context` and `radar-worker-bridge`.
3. **Bounded backfill**: run the approved historical backfill job for episode reconstruction after owner signs off — see `historical_apply_episode_batch` RPC chain in migrations `20260922160000` onward.
4. **Acceptance**: `max(episode_start)` advances past the current trading week; Repeat Movers section shows limited/available profiles for symbols with stored episodes (not global “unavailable” when enrichment succeeds).

## Out of scope

- Executing production SQL, cron changes, or backfill runs from this batch.
- Claiming individual tickers “have no history” when ingestion is stale.