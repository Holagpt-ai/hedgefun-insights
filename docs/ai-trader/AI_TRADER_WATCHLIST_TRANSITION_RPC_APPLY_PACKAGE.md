# AI Trader — Lovable watchlist transition RPC apply package

DATABASE-ONLY assignment. Do not edit frontend, UI, app code, scanner, AI Analyst, Game, authentication, or pricing. Do not publish the frontend. Do not activate a broker or model. Do not change `ai_trader_runtime.operating_mode`. Do not deploy the Shadow worker.

Use the **existing** Stocksist / Lovable Cloud Supabase project. Do **not** create a second Supabase project.

Cursor authored this package. Lovable / Lovable Cloud performs production schema application after human review.

## 1. Exact migration filename

`supabase/migrations/20260928000000_ai_trader_watchlist_transition_rpc_v1.sql`

## 2. Expected new objects

- column `public.ai_trader_watchlist_transitions.idempotency_key`
- unique index `ai_trader_watchlist_transitions_idempotency_uidx`
- function `public.ai_trader_apply_watchlist_transition_v1(jsonb) → jsonb`

No new tables. No order/position/trade/broker/model tables. No `operating_mode` change.

## 3. Function contract

INVOKER only. `search_path` is `public`. Not SECURITY DEFINER.

Statuses:

- `APPLIED`
- `NO_CHANGE`
- `CONFLICT`
- `INVALID_TRANSITION`
- `PROHIBITED_STATE`
- `FAILED`

SHADOW-era `new_state` only: `DISCOVERED`, `RESEARCHING`, `WATCHING`, `HIGH_PRIORITY`, `COOLDOWN`, `REMOVED`.

Rejects `ENTRY_READY`, `POSITION_OPEN`, `EXITED`.

First row: `prior_state = NULL`, `new_state = DISCOVERED`, item + transition in one transaction.

Existing row: `SELECT … FOR UPDATE`, expected prior state, legal graph, append transition, update current state.

## 4. Expected grants

REVOKE ALL on the function from `PUBLIC`, `anon`, `authenticated`.

GRANT EXECUTE to `service_role`.

## 5. Pre-apply checks

1. Confirm this is the existing Stocksist Supabase project.
2. Confirm watchlist tables already exist from Sprint 3B.
3. Confirm the function does **not** already exist.
4. Confirm frontend Publish is not used.
5. Do not seed watchlist rows, sessions, or observations.
6. Do not update `ai_trader_runtime`.

```sql
SELECT proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'ai_trader_apply_watchlist_transition_v1';
```

Zero rows expected.

```sql
SELECT relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('ai_trader_watchlist_items', 'ai_trader_watchlist_transitions');
```

Two rows expected.

```sql
SELECT operating_mode FROM public.ai_trader_runtime WHERE id = 1;
```

Expected: `OFF`.

## 6. Post-apply checks

Function exists. `idempotency_key` column exists. Operating mode is still `OFF`. Watchlist tables remain empty. No Shadow worker deploy.

## 7. Do not apply from Cursor

`AI_TRADER_WATCHLIST_TRANSITION_RPC_APPLY_MIGRATION = false`
