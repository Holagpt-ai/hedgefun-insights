-- Verification queries for the Stocksist journal schema / RLS.
-- Do NOT execute against production or any live database from this worktree.

-- 1) Every journal_* table should have RLS enabled.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname LIKE 'journal_%'
ORDER BY c.relname;

-- 2) User-owned tables must have at least one policy referencing auth.uid().
SELECT p.tablename, p.policyname, p.cmd, p.qual, p.with_check
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND p.tablename LIKE 'journal_%'
ORDER BY p.tablename, p.policyname;

-- 3) Private storage bucket must exist and must not be public.
SELECT id, name, public
FROM storage.buckets
WHERE id = 'journal-private';

-- 4) Storage object policies should scope the first folder to auth.uid()::text
--    and the second folder to imports / attachments / exports.
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE 'journal_private_%';

-- 5) Demo workspace rows must be rejected on journal_trades.source.
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.journal_trades'::regclass
  AND conname = 'journal_trades_source_not_demo';

-- 6) Seeded metric catalog + journal-calc.v1 formulas.
SELECT d.metric_key, d.name_en, d.name_es, f.formula_version
FROM public.journal_metric_definitions d
JOIN public.journal_metric_formula_versions f
  ON f.metric_definition_id = d.id
WHERE d.user_id IS NULL
  AND f.formula_version = 'journal-calc.v1'
ORDER BY d.metric_key;

-- 7) Calculation / backfill / rollback functions exist with search_path = public.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'journal_calculate_trade_v1',
    'journal_refresh_derived',
    'journal_backfill_accounts_and_executions',
    'journal_migrate_legacy_trades',
    'journal_import_rollback',
    'journal_import_start_v1',
    'journal_import_row_v1',
    'journal_import_finalize_v1',
    'journal_save_trade_v1',
    'refresh_journal_stats'
  )
ORDER BY p.proname;

-- 8) Existing journal_trades columns plus additive columns.
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'journal_trades'
ORDER BY ordinal_position;

-- 9) Executions are idempotent on idempotency_key.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'journal_executions'
  AND indexdef ILIKE '%idempotency_key%';

-- 10) Outbox processing is available to service_role.
SELECT policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('journal_event_outbox', 'journal_dead_letters', 'journal_audit_log')
ORDER BY tablename, policyname;

-- ---------------------------------------------------------------------------
-- Comment-only checklist (do not run as a live apply):
-- * ALTER TABLE public.journal_* ENABLE ROW LEVEL SECURITY for every user-owned table
-- * Policies use user_id = auth.uid() or EXISTS (... parent.user_id = auth.uid())
-- * storage.buckets journal-private public = false
-- * Paths: {user_id}/imports/, {user_id}/attachments/, {user_id}/exports/
-- * CHECK (coalesce(source, '') <> 'demo_workspace') on journal_trades
-- * wash_trades cache column is unchanged; daily breakevens map from is_wash
-- * Legacy public.trades / trade_tags / trade_tag_assignments are not dropped
-- ---------------------------------------------------------------------------
