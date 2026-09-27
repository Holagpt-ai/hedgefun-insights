# Watchlist transition RPC proposal

Sprint 3C does **not** apply this.

Supabase JS does not give the current persistence path a real multi-statement transaction. Current write order:

1. Existing item: insert transition, then update current state
2. New item: insert item (FK), then insert transition

If the second statement fails, history and current state can diverge. Recovery is the next cycle: unchanged current state plus a missing/extra transition is detectable, but it is not atomic.

Proposed future function (do not apply now):

`ai_trader_apply_watchlist_transition_v1(jsonb) → uuid`

Steps in one Postgres function:

1. lock the current item row by symbol
2. insert `ai_trader_watchlist_transitions`
3. insert or update `ai_trader_watchlist_items`
4. return item id

Suggested future filename if approved:

`supabase/migrations/YYYYMMDDHHMMSS_ai_trader_watchlist_transition_rpc_v1.sql`

Do not apply from Cursor. Lovable applies only after review.
