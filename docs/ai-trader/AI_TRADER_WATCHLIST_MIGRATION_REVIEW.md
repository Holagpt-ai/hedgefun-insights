# AI Trader autonomous watchlist — Sprint 3A review

The memory foundation is live in the existing Stocksist / Lovable Supabase. This file authors the **next** unapplied watchlist migration only.

## Repository sync check

Present on `origin/main` after pull:

- `drizzle/migrations/0051_ai_trader_memory_foundation_v1.sql` — Lovable mirror
- `src/integrations/supabase/types.ts` — includes `ai_trader_*` memory tables
- Canonical file remains `supabase/migrations/20260927220000_ai_trader_memory_foundation_v1.sql`

Diff vs canonical SQL: missing trailing newline only. Semantics match. Do not create a competing schema. Do not rerun the memory migration.

Also present: `drizzle/migrations/0051_user_price_alerts_v1.sql`. Drizzle index `0051` is therefore reused. Do not delete either Lovable file.

Generated types do **not** include `ai_trader_watchlist_*` yet because this migration is not applied. Domain types stay independent.

## Watchlist migration (NOT applied)

`supabase/migrations/20260927230000_ai_trader_watchlist_foundation_v1.sql`

Tables:

- `ai_trader_watchlist_items` — mutable current state, unique symbol
- `ai_trader_watchlist_transitions` — append-only audit

Not user `watchlists`. No order/trade/position tables.

`AI_TRADER_WATCHLIST_APPLY_MIGRATION = false`

## Sprint 3A engine ceiling

May produce: `DISCOVERED`, `RESEARCHING`, `WATCHING`, `HIGH_PRIORITY`, `COOLDOWN`, `REMOVED`

Must not produce: `ENTRY_READY`, `POSITION_OPEN`, `EXITED`

Radar `rank` is stored as `sourceRank`. The adapter filters eligibility and does not replace volume-first discovery order.

## Future apply

Do not apply from Cursor. Lovable / Lovable Cloud applies after review, same as Sprint 2C.
