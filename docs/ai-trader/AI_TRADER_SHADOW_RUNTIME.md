# AI Trader Shadow observation runtime

Built in Sprint 3C and hardened in Sprint 3C.1. **Not activated.** Operating mode remains `OFF`.

## Atomic watchlist writes

Production writes must go through `ai_trader_apply_watchlist_transition_v1`.

The TypeScript path no longer issues split item/transition statements.

The RPC migration is authored and **not applied**:

`supabase/migrations/20260928000000_ai_trader_watchlist_transition_rpc_v1.sql`

Readiness is `NOT_READY` until `transitionRpcPresent` is true.

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

`services/ai-trader-shadow-worker/` is a future package. Not deployed. `npm start` refuses. Import does nothing.
