# Watchlist transition RPC

Sprint 3C.1 authors the migration. **Do not apply from Cursor.**

## Why

Supabase JS does not give the previous persistence path a real multi-statement transaction.

Previous non-atomic behavior (removed from the TypeScript write path):

1. Existing item: insert transition, then update current state
2. New item: insert item, then insert transition

That can diverge. Production SHADOW writes must not start until the RPC is applied.

## Authoritative function (unapplied)

`ai_trader_apply_watchlist_transition_v1(jsonb) → jsonb`

Filename:

`supabase/migrations/20260928000000_ai_trader_watchlist_transition_rpc_v1.sql`

Apply package:

`docs/ai-trader/AI_TRADER_WATCHLIST_TRANSITION_RPC_APPLY_PACKAGE.md`

Steps in one Postgres function:

1. reject prohibited SHADOW-era states
2. return `NO_CHANGE` on durable `idempotency_key` retry
3. lock the current item row by symbol (`FOR UPDATE`)
4. create DISCOVERED + history atomically when absent (`prior_state` NULL)
5. compare expected prior state / optional `updated_at`
6. validate the legal graph
7. insert `ai_trader_watchlist_transitions` and update `ai_trader_watchlist_items`
8. return typed status + ids

Do not apply from Cursor. Lovable applies only after review.
