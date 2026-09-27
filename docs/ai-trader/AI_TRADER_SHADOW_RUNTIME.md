# AI Trader Shadow observation runtime

Built in Sprint 3C. **Not activated.** Operating mode remains `OFF`.

## Freshness

Reuses `SCREENER_STALE_AFTER_MS` (20 minutes). Stale or future `providerAsOf` is rejected. Prior surveillance dates are not treated as current.

## Aging

Absent WATCHING / HIGH_PRIORITY → COOLDOWN.  
COOLDOWN expires after 24 hours (`SHADOW_RUNTIME_CONFIG.cooldownDurationMs`) → REMOVED.

## HIGH_PRIORITY

Means important for observation. Uses Radar `sourceRank <= 3` only. Does not mean buy, enter, or order-ready.

## Atomicity

See `AI_TRADER_WATCHLIST_TRANSITION_RPC_PROPOSAL.md`. Not applied in this sprint.
