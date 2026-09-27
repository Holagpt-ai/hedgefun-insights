# AI Trader — Lovable production apply package

DATABASE-ONLY assignment. Do not edit frontend, UI, app code, scanner, AI Analyst, Game, authentication, or pricing. Do not publish the frontend. Do not activate a broker or model.

Use the **existing** Stocksist / Lovable Cloud Supabase project. Do **not** create a second Supabase project.

Cursor authored this package. Lovable / Lovable Cloud performs production schema application after human review.

## 1. Exact migration filename

`supabase/migrations/20260927220000_ai_trader_memory_foundation_v1.sql`

## 2. Commit containing the final migration

`c2704b2c1585f9f9ef0ef12f046036c87ae6f327`

GitHub `main` commit message:

`fix(ai-trader): finalize memory schema lifecycle`

Do not apply a different file.

## 3. Expected new tables

- `public.ai_trader_accounts`
- `public.ai_trader_strategy_versions`
- `public.ai_trader_model_assignments`
- `public.ai_trader_runtime`
- `public.ai_trader_sessions`
- `public.ai_trader_context_snapshots`
- `public.ai_trader_observations`
- `public.ai_trader_episodes`
- `public.ai_trader_symbol_profiles`
- `public.ai_trader_setup_profiles`
- `public.ai_trader_regime_profiles`
- `public.ai_trader_decision_evidence`
- `public.ai_trader_reflections`
- `public.ai_trader_counterfactuals`
- `public.ai_trader_strategy_candidates`
- `public.ai_trader_reward_assessments`
- `public.ai_trader_audit_events`

## 4. Expected SQL functions

- `public.ai_trader_reject_mutation()`
- `public.ai_trader_allow_is_current_clear()`
- `public.ai_trader_session_lifecycle_guard()`
- `public.ai_trader_model_assignment_lifecycle_guard()`
- `public.ai_trader_strategy_version_lifecycle_guard()`
- `public.ai_trader_strategy_candidate_lifecycle_guard()`
- `public.ai_trader_replace_symbol_profile_v1(jsonb)`
- `public.ai_trader_replace_setup_profile_v1(jsonb)`
- `public.ai_trader_replace_regime_profile_v1(jsonb)`

INVOKER only. `search_path` is `public`. Not SECURITY DEFINER.

## 5. Expected triggers

Strict append-only (`*_immutable` UPDATE OR DELETE):

- `ai_trader_context_snapshots_immutable`
- `ai_trader_observations_immutable`
- `ai_trader_episodes_immutable`
- `ai_trader_decision_evidence_immutable`
- `ai_trader_reflections_immutable`
- `ai_trader_counterfactuals_immutable`
- `ai_trader_reward_assessments_immutable`
- `ai_trader_audit_events_immutable`

Lifecycle:

- `ai_trader_sessions_lifecycle`
- `ai_trader_model_assignments_lifecycle`
- `ai_trader_strategy_versions_lifecycle`
- `ai_trader_strategy_candidates_lifecycle`

Profiles:

- `ai_trader_symbol_profiles_immutable`
- `ai_trader_setup_profiles_immutable`
- `ai_trader_regime_profiles_immutable`
- `ai_trader_symbol_profiles_no_delete`
- `ai_trader_setup_profiles_no_delete`
- `ai_trader_regime_profiles_no_delete`

## 6. Expected indexes

- `ai_trader_sessions_account_date_idx`
- `ai_trader_context_snapshots_symbol_observed_idx`
- `ai_trader_observations_symbol_type_observed_idx`
- `ai_trader_observations_source_event_key_uidx`
- `ai_trader_episodes_symbol_session_idx`
- `ai_trader_episodes_setup_session_idx`
- `ai_trader_episodes_regime_session_idx`
- `ai_trader_episodes_started_at_idx`
- `ai_trader_episodes_source_event_key_uidx`
- `ai_trader_symbol_profiles_current_uidx`
- `ai_trader_symbol_profiles_asof_idx`
- `ai_trader_setup_profiles_current_uidx`
- `ai_trader_setup_profiles_asof_idx`
- `ai_trader_regime_profiles_current_uidx`
- `ai_trader_regime_profiles_asof_idx`
- `ai_trader_decision_evidence_decision_idx`
- `ai_trader_reflections_trade_idx`
- `ai_trader_reflections_decision_idx`
- `ai_trader_counterfactuals_trade_idx`
- `ai_trader_counterfactuals_decision_idx`
- `ai_trader_strategy_candidates_status_idx`
- `ai_trader_reward_assessments_trade_idx`
- `ai_trader_reward_assessments_decision_idx`
- `ai_trader_audit_events_occurred_idx`
- `ai_trader_audit_events_session_idx`
- `ai_trader_model_assignments_role_from_idx`

Also: unique `(context_hash, schema_version)` and unique `(strategy_id, version)`.

## 7. Expected RLS / grant behavior

RLS enabled on every table in section 3.

REVOKE ALL from `PUBLIC`, `anon`, `authenticated`.

GRANT ALL on those tables to `service_role`.

No policies for `anon` or `authenticated`.

Replace RPCs: REVOKE from PUBLIC/anon/authenticated; GRANT EXECUTE to `service_role`.

`service_role` bypasses RLS. Do not claim RLS constrains the service role.

## 8. Expected runtime default

`public.ai_trader_runtime` row `id = 1`, `operating_mode = 'OFF'`.

No LIVE activation. No broker. No strategy. No model assignment. No fake memory.

## 9. Pre-apply production checks Lovable must perform

1. Confirm this is the existing Stocksist Supabase project.
2. Confirm no second AI Trader project is being created.
3. Confirm frontend Publish is not used.
4. Confirm the exact migration file SHA matches GitHub `main`.
5. Read-only inspect current schema objects named `ai_trader_%`.
6. Stop if any unexpected `ai_trader_` table/function already exists.
7. Stop if this filename is already recorded as applied.
8. Do not seed trades, memories, models, or accounts.

## 10. Production migration-history check

Inspect Lovable Cloud / Supabase migration history for:

`20260927220000_ai_trader_memory_foundation_v1`

If present: **STOP**. Do not re-apply. Report the conflict.

If absent: continue.

## 11. Confirmation that migration is not already applied

Required before apply:

```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version = '20260927220000'
   OR name ILIKE '%ai_trader_memory_foundation_v1%';
```

If the project's history table name differs, use the Lovable Cloud equivalent. Zero rows expected.

## 12. Confirmation no conflicting objects exist

```sql
SELECT n.nspname, c.relname, c.relkind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname LIKE 'ai_trader_%'
ORDER BY 1, 2;

SELECT n.nspname, p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'ai_trader_%'
ORDER BY 1, 2;
```

Expected before apply: zero rows.

## 13. Exact migration content / file to apply

Apply **only**:

`supabase/migrations/20260927220000_ai_trader_memory_foundation_v1.sql`

from the commit in section 2.

Do not rewrite SQL. Do not apply a subset. Do not apply later unreviewed files.

## 14–23. Post-apply verification (read-only)

### Tables

```sql
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'ai_trader_%'
ORDER BY 1;
```

Expect the 17 tables in section 3. Expect `operating_mode = 'OFF'` below.

### Functions

```sql
SELECT p.proname, p.prosecdef, p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'ai_trader_%'
ORDER BY 1;
```

Expect the 9 functions in section 4. `prosecdef` must be false.

### Triggers

```sql
SELECT event_object_table, trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table LIKE 'ai_trader_%'
ORDER BY 1, 2, 3;
```

Expect the names in section 5.

### Indexes

```sql
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename LIKE 'ai_trader_%'
ORDER BY 1, 2;
```

### RLS

```sql
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname LIKE 'ai_trader_%'
  AND c.relkind = 'r'
ORDER BY 1;
```

Every table: `relrowsecurity = true`.

### Grants / policies

```sql
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name LIKE 'ai_trader_%'
ORDER BY 2, 1, 3;

SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename LIKE 'ai_trader_%';
```

Expect no `anon` / `authenticated` table grants. Expect zero policies (clients have no access). `service_role` may appear; it bypasses RLS.

### Runtime singleton

```sql
SELECT id, operating_mode, active_strategy_version_id, active_risk_config_id
FROM public.ai_trader_runtime;
```

Expect exactly one row: `id = 1`, `operating_mode = 'OFF'`, strategy/risk pointers NULL.

### Empty book

```sql
SELECT
  (SELECT count(*) FROM public.ai_trader_accounts) AS accounts,
  (SELECT count(*) FROM public.ai_trader_sessions) AS sessions,
  (SELECT count(*) FROM public.ai_trader_model_assignments) AS model_assignments,
  (SELECT count(*) FROM public.ai_trader_strategy_versions) AS strategy_versions,
  (SELECT count(*) FROM public.ai_trader_observations) AS observations,
  (SELECT count(*) FROM public.ai_trader_episodes) AS episodes,
  (SELECT count(*) FROM public.ai_trader_context_snapshots) AS snapshots;
```

All counts must be `0` except runtime (verified separately).

### Context unique constraint

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.ai_trader_context_snapshots'::regclass
  AND contype = 'u';
```

Expect unique `(context_hash, schema_version)`.

### Profile unique-current indexes

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'ai_trader_symbol_profiles_current_uidx',
    'ai_trader_setup_profiles_current_uidx',
    'ai_trader_regime_profiles_current_uidx'
  );
```

### Session / episode CHECKs

```sql
SELECT conrelid::regclass, conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN (
  'public.ai_trader_sessions'::regclass,
  'public.ai_trader_episodes'::regclass
)
AND contype = 'c';
```

Sessions must include CREATED/ACTIVE/PAUSED/KILLED/CLOSED/FAILED.
Episodes must include WATCHLIST_PROMOTION/WATCHLIST_REMOVAL/MISSED_OPPORTUNITY/EXECUTION_EVENT/MARKET_REFERENCE and must not use generic WATCHLIST.

### Direct client write-denial

Using **anon** and **authenticated** PostgREST clients (not service_role):

- SELECT on `ai_trader_runtime` must fail or return no permission.
- INSERT into `ai_trader_observations` must fail.

Do not use the service role for this denial test.

### Service-path verification

Using service role only: confirm table SELECT on `ai_trader_runtime` succeeds and returns OFF. Do not insert fake memories.

## 24. Rollback / containment

If apply fails mid-file: do not hand-edit production. Restore from Lovable/Supabase backup or stop and report the exact error.

If applied successfully but objects are wrong: do not drop unrelated Stocksist tables. Contain by leaving `ai_trader_runtime.operating_mode = 'OFF'` and reporting. A down-migration is not provided in this package.

This migration does not activate trading. Leaving it unapplied is safer than a partial apply.

## Out of scope

- Broker activation
- Model/provider selection
- Frontend publish
- Scanner / Radar / Journal / Watchlist / Catalyst / Game / auth / pricing changes
- pgvector / embeddings
- Fake trades or memories
