# AI Trader Shadow observation runtime

Built in Sprint 3C and hardened in Sprint 3C.1. **Not activated.** Operating mode remains `OFF`.

## Atomic watchlist writes

Production writes must go through `ai_trader_apply_watchlist_transition_v1`.

The TypeScript path no longer issues split item/transition statements.

The production RPC is `public.ai_trader_apply_watchlist_transition_v1`.

`supabase/migrations/20260928000000_ai_trader_watchlist_transition_rpc_v1.sql`

The function comment still says `Not applied until Lovable review`. That wording is cosmetic and is not a reason to add another migration from this worker.

## Observation policy (`shadow-observation-v1`)

Centralized in `ShadowObservationPolicy`:

- freshness: `SCREENER_STALE_AFTER_MS` (20 minutes)
- cooldown: 24 hours
- HIGH_PRIORITY: Radar `sourceRank <= 3`

HIGH_PRIORITY means important for observation. It does not mean buy, enter, or order-ready.

## Aging

Absent WATCHING / HIGH_PRIORITY → COOLDOWN.  
COOLDOWN expires after 24 hours → REMOVED.

## Worker

`services/ai-trader-shadow-worker/` is the trusted server process. Operating mode stays `OFF` until a separate activation gate. OFF cycles are `SKIPPED` / `OPERATING_MODE_OFF` and do not write.
