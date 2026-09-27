# AI Trader memory foundation — migration review

This file is the Sprint 2B review artifact. The SQL exists in Git. It has not been applied.

## 1. Migration filename

`supabase/migrations/20260927220000_ai_trader_memory_foundation_v1.sql`

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

Functions:

- `ai_trader_reject_mutation()`
- `ai_trader_allow_is_current_clear()`
- `ai_trader_replace_symbol_profile_v1(jsonb)`
- `ai_trader_replace_setup_profile_v1(jsonb)`
- `ai_trader_replace_regime_profile_v1(jsonb)`

Triggers:

- UPDATE/DELETE rejected on append-only tables
- Profile UPDATE allowed only to set `is_current = false`
- Profile DELETE rejected

No promotion RPC. No broker/execution RPC. No generic CRUD RPC.

## 4. RLS / access design

Every AI Trader table has RLS enabled.

`anon` and `authenticated` receive no policies and no grants.

`service_role` is granted table access. Service role bypasses RLS. RLS therefore does **not** protect against a compromised service credential. It only keeps PostgREST/browser clients off the base tables.

Profile replace functions are executable by `service_role` only.

Public and subscriber UI must later read filtered server projections, not these tables.

## 5. Append-only enforcement

Database-enforced for:

sessions, model assignments, strategy versions, context snapshots, observations, episodes, decision evidence, reflections, counterfactuals, strategy candidates, reward assessments, audit events.

Application-convention plus limited DB enforcement for profiles: contents cannot change; only `is_current` may be cleared.

`ai_trader_runtime` and `ai_trader_accounts` are mutable current-state tables.

## 6. Mutable / current-state tables

- `ai_trader_runtime` — singleton current mode/config pointers
- `ai_trader_accounts` — book identity
- Profile `is_current` flags via replace RPCs

Sessions remain the historical freeze. Runtime is not history.

## 7. Important indexes

- Sessions `(account_id, trading_date)`
- Context `(symbol, observed_at DESC)`
- Observations `(symbol, observation_type, observed_at DESC)`
- Episodes symbol/setup/regime/session and `started_at`
- Profiles `(key, generated_at DESC)` plus partial unique current rows
- Decision evidence `(decision_id)`

## 8. Profile-version transaction design

Replace RPCs run in one Postgres function:

1. Find the current profile for the key
2. Clear `is_current` on that row
3. Insert the new version with `supersedes_id` and `is_current = true`

This is real DB atomicity. The TypeScript client does not fake a multi-statement transaction.

Historical retrieval must use `generated_at <= asOf`, not `is_current`.

## 9. Temporal retrieval design

Episode queries always include `started_at <= $asOf` and a `LIMIT`.

Profile queries always include `generated_at <= $asOf ORDER BY generated_at DESC LIMIT 1`.

Failure examples are a separate query branch.

## 10. Context snapshot dedupe

Unique `(context_hash, schema_version)`.

Insert uses `ON CONFLICT DO NOTHING` then selects the existing id.

## 11. Idempotency design

- Context: hash + schema version
- Observations: optional unique `source_event_key`
- Episodes: optional unique `source_event_key`

No extra idempotency columns on reflections or rewards.

## 12. Intentionally deferred tables

- `ai_trader_model_evaluations` — `evaluation_id` is a nullable UUID, no FK
- `ai_trader_risk_configs` — `risk_config_id` / `active_risk_config_id` are nullable UUIDs, no FK
- `ai_trader_trades`, `ai_trader_decisions`, orders, positions, watchlist items — correlation UUIDs only
- Sprint 2B requested session statuses `CREATED|ACTIVE|PAUSED|KILLED|CLOSED|FAILED` were **not** used. Sprint 2A remains `OPEN|CLOSED|ABORTED`
- Sprint 2B requested episode types `WATCHLIST_REMOVAL|WATCHLIST_PROMOTION|MISSED_OPPORTUNITY|EXECUTION_EVENT` were **not** used. Sprint 2A remains `TRADE|PASS|WAIT|RISK_REJECTION|WATCHLIST|MARKET_REFERENCE`

Those extra labels need an explicit later additive migration if product still wants them.

`memory_usefulness` was not added; Sprint 2A reflection contracts do not include it.

## 13. Risks / assumptions

- Symbol text is the V1 query key, matching Radar. `security_id` is nullable and has no FK until coverage is complete
- `numeric` columns serialize through Supabase as strings; mappers parse with finite-number checks
- Service role can still insert bad rows; promotion safety is adapter + later service auth, not a complete DB actor model
- LIVE account environment does not change `ai_trader_runtime.operating_mode`
- The app boots without this migration. Persistence runs only when an executor is invoked

## 14. Exact apply command for later Sprint 2C

Do **not** run this now.

```bash
# After human review only. Targets the intended isolated/project database.
supabase db push
```

Alternative when applying a single reviewed file through the existing 14-digit chain:

```bash
supabase migration up
```

Never apply through the Supabase dashboard SQL editor or Lovable.

## Symbol / security identity

V1 stores `symbol` plus optional `security_id`. No new security master. Later work may add an FK to `securities.security_id`.

## Promotion protection

Database CHECK allows the full candidate status set. The TypeScript adapter exposes only `insertProposedStrategyCandidate`. There is no `setStatus` API. Service authorization for human promotion is Sprint 2C+.

## Sprint 2C type generation

After the migration is applied:

```bash
# regenerate src/integrations/supabase/types.ts against the applied schema
```

Do not edit generated types before apply.
