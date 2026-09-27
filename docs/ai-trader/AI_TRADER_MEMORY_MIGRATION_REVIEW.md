# AI Trader memory foundation — migration review

Sprint 2B.1 lifecycle corrections. The SQL exists in Git. It has not been applied.

Database decision: **use the existing Stocksist / Lovable Cloud Supabase**. Do not create a second project.

Cursor owns authoring. Lovable / Lovable Cloud owns later production apply. Frontend remains Cursor → GitHub → Vercel.

## 1. Migration filename

`supabase/migrations/20260927220000_ai_trader_memory_foundation_v1.sql`

Corrected in place because repository evidence shows it is **not applied** (`AI_TRADER_SCHEMA_APPLY_MIGRATION = false`; no later local migration; Cursor has no authorized remote history).

## 2. Tables created

- `ai_trader_accounts`
- `ai_trader_strategy_versions`
- `ai_trader_model_assignments`
- `ai_trader_runtime` (singleton `id = 1`, default `OFF`)
- `ai_trader_sessions`
- `ai_trader_context_snapshots`
- `ai_trader_observations`
- `ai_trader_episodes`
- `ai_trader_symbol_profiles`
- `ai_trader_setup_profiles`
- `ai_trader_regime_profiles`
- `ai_trader_decision_evidence`
- `ai_trader_reflections`
- `ai_trader_counterfactuals`
- `ai_trader_strategy_candidates`
- `ai_trader_reward_assessments`
- `ai_trader_audit_events`

No Journal, Game, or user-watchlist tables are reused.

## 3. Functions / triggers

Functions (INVOKER, `search_path = public`, not SECURITY DEFINER):

- `ai_trader_reject_mutation()`
- `ai_trader_allow_is_current_clear()`
- `ai_trader_session_lifecycle_guard()`
- `ai_trader_model_assignment_lifecycle_guard()`
- `ai_trader_strategy_version_lifecycle_guard()`
- `ai_trader_strategy_candidate_lifecycle_guard()`
- `ai_trader_replace_symbol_profile_v1(jsonb)`
- `ai_trader_replace_setup_profile_v1(jsonb)`
- `ai_trader_replace_regime_profile_v1(jsonb)`

Triggers: strict append-only UPDATE/DELETE reject on evidence tables; profile `is_current` clear-only; profile DELETE reject; lifecycle guards on sessions, model assignments, strategy versions, and strategy candidates.

No promotion RPC. No broker/execution RPC. No generic CRUD RPC.

## 4. RLS / access design

Every AI Trader table has RLS enabled.

`anon` and `authenticated` receive no policies and no grants.

`service_role` is granted table access. Service role bypasses RLS. RLS therefore does **not** protect against a compromised service credential.

Profile replace functions are executable by `service_role` only.

## 5. Mutability model

See `AI_TRADER_MUTABILITY_MATRIX` in `src/lib/ai-trader/schema/schema-spec.ts`.

Strict append-only: context snapshots, observations, episodes, decision evidence, reflections, counterfactuals, reward assessments, audit events.

Versioned profiles: contents immutable; only `is_current` may be cleared; DELETE prohibited; replace RPCs are atomic.

Controlled lifecycle: sessions, model assignments, strategy versions, strategy candidates.

Mutable current state: `ai_trader_runtime`, `ai_trader_accounts`. Still denied to browser/client roles.

## 6. Session lifecycle

Statuses: `CREATED`, `ACTIVE`, `PAUSED`, `KILLED`, `CLOSED`, `FAILED`.

Transitions:

- CREATED → ACTIVE | FAILED
- ACTIVE → PAUSED | KILLED | CLOSED | FAILED
- PAUSED → ACTIVE | KILLED | CLOSED | FAILED
- KILLED / CLOSED / FAILED: terminal, cannot reopen

Identity fields freeze after leaving CREATED. Lifecycle fields `status`, `started_at`, `ended_at` may change while legal.

## 7. Episode types

`TRADE`, `PASS`, `WAIT`, `RISK_REJECTION`, `WATCHLIST_PROMOTION`, `WATCHLIST_REMOVAL`, `MISSED_OPPORTUNITY`, `EXECUTION_EVENT`, `MARKET_REFERENCE`.

Generic `WATCHLIST` is removed.

## 8. Model assignment / strategy lifecycle

Model assignment identity is immutable. `active_until` may change NULL → timestamp once.

Strategy version identity (`strategy_id`, `version`, `parent_version_id`, `configuration_hash`, `created_at`) is immutable. Trusted services may later update status/approval/evaluation/allowed_modes. AI-facing code cannot promote.

Strategy candidates: AI adapter inserts `PROPOSED` only. Database may later store other statuses. **DATABASE CAPABILITY != AI AUTHORITY.**

## 9. Profile-version transaction design

Replace RPCs run in one Postgres function:

1. Find the current profile for the key
2. Clear `is_current` on that row
3. Insert the new version with `supersedes_id` and `is_current = true`

Historical retrieval must use `generated_at <= asOf`, not `is_current`.

## 10. Temporal retrieval / context dedupe / idempotency

Episode queries always include `started_at <= $asOf` and a `LIMIT` (8 similar, 3 failures).

Profile queries always include `generated_at <= $asOf ORDER BY generated_at DESC LIMIT 1`.

Context: unique `(context_hash, schema_version)`; insert `ON CONFLICT DO NOTHING` then select existing id.

Observations/episodes: optional unique `source_event_key`.

## 11. Numeric types

Prices/P&L: `numeric(18,6)`. Capital/equity: `numeric(18,4)`. Confidence/rates: `numeric(8,6)`. Counts: `integer`. IDs: `uuid`.

Supabase often serializes `numeric` as strings. `parseNullableNumeric` keeps NULL, rejects non-finite/invalid values, and does not coerce decimals to integers. Real-money accounting may later need a decimal library.

## 12. Intentionally deferred tables

- `ai_trader_model_evaluations`
- `ai_trader_risk_configs`
- `ai_trader_trades`, `ai_trader_decisions`, orders, positions

Correlation UUIDs only. No placeholder trading tables.

## 13. Remote history

Cursor cannot authoritatively inspect Lovable production migration history.

**REMOTE MIGRATION HISTORY REQUIRES LOVABLE PRODUCTION PREFLIGHT**

## 14. Exact apply command for later Sprint 2C

Do **not** run this from Cursor against production.

Lovable / Lovable Cloud applies the exact reviewed file to the existing Stocksist Supabase after preflight. See `docs/ai-trader/AI_TRADER_LOVABLE_APPLY_PACKAGE.md`.

Never apply through the Supabase dashboard SQL editor ad-hoc, and never via Lovable frontend Publish.
