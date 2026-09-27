# Supabase vs Drizzle migration notes (repository inventory)

Production applies **`supabase/migrations/`** in timestamp order. **`drizzle/migrations/`** mirrors selected changes for alternate tooling paths (CI, Lovable mirrors, journal runner contracts) — not a second production history.

## Recent pairs (semantic intent)

| Supabase | Drizzle | Relationship |
|----------|---------|--------------|
| `20260926200000_db_performance_hardening_v1.sql` | `0050_db_performance_hardening_v1.sql` | **A — exact mirror** (header comment) |
| `20260927200000_user_price_alerts_v1.sql` | `0051_user_price_alerts_v1.sql` | **A — exact mirror** |
| `20260927200000` (Lovable) | `0049_user_price_alerts_v1.sql` | **F — duplicate numbering** (same feature; two Drizzle filenames with prefix `0049`; **KEEP both** until apply path proven) |
| `0047_radar_event_engine_v1` / `0047_intraday_participation_v1` | Supabase split files | **D/E — dual tracks** (verify apply markers in repo tests) |
| `0048_*` / `0049_scanner_intelligence_stack_replace_rpc_v1` | Supabase scanner reload chain | **B/C partial** — schema reload migrations are Supabase-oriented |

**Rule:** Never delete or rewrite applied Supabase migrations. Additive corrective migrations only.
