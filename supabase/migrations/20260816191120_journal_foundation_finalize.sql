-- Late foreign keys, indexes, updated_at triggers, exact 77-table harden,
-- and restore of anon/authenticated default TABLE privileges.
-- PUBLIC default table grant is never restored.
-- Harden tables created by this migration. Exact allowlist — not journal_%.
-- Live tables that already have policies keep their grants and policies.
-- integrity-md5: c15c3b36bfff34ccb4c6ac846770d4ef
DO $journal_seg$
DECLARE
  v_statements text[] := ARRAY[
    $journal_stmt$DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_trades_account_id_fkey') THEN
    ALTER TABLE public.journal_trades
      ADD CONSTRAINT journal_trades_account_id_fkey
      FOREIGN KEY (account_id) REFERENCES public.journal_accounts(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_trades_playbook_id_fkey') THEN
    ALTER TABLE public.journal_trades
      ADD CONSTRAINT journal_trades_playbook_id_fkey
      FOREIGN KEY (playbook_id) REFERENCES public.journal_playbooks(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_trades_playbook_version_id_fkey') THEN
    ALTER TABLE public.journal_trades
      ADD CONSTRAINT journal_trades_playbook_version_id_fkey
      FOREIGN KEY (playbook_version_id) REFERENCES public.journal_playbook_versions(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_trades_context_snapshot_id_fkey') THEN
    ALTER TABLE public.journal_trades
      ADD CONSTRAINT journal_trades_context_snapshot_id_fkey
      FOREIGN KEY (context_snapshot_id) REFERENCES public.journal_trade_context(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_trades_import_job_id_fkey') THEN
    ALTER TABLE public.journal_trades
      ADD CONSTRAINT journal_trades_import_job_id_fkey
      FOREIGN KEY (import_job_id) REFERENCES public.journal_import_jobs(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_trades_parent_trade_id_fkey') THEN
    ALTER TABLE public.journal_trades
      ADD CONSTRAINT journal_trades_parent_trade_id_fkey
      FOREIGN KEY (parent_trade_id) REFERENCES public.journal_trades(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_executions_import_job_id_fkey') THEN
    ALTER TABLE public.journal_executions
      ADD CONSTRAINT journal_executions_import_job_id_fkey
      FOREIGN KEY (import_job_id) REFERENCES public.journal_import_jobs(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_executions_leg_id_fkey') THEN
    ALTER TABLE public.journal_executions
      ADD CONSTRAINT journal_executions_leg_id_fkey
      FOREIGN KEY (leg_id) REFERENCES public.journal_trade_legs(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_notebook_links_playbook_id_fkey') THEN
    ALTER TABLE public.journal_notebook_links
      ADD CONSTRAINT journal_notebook_links_playbook_id_fkey
      FOREIGN KEY (playbook_id) REFERENCES public.journal_playbooks(id) ON DELETE SET NULL;
  END IF;
END $$
$journal_stmt$,
    $journal_stmt$CREATE INDEX IF NOT EXISTS journal_trades_user_entry_idx
  ON public.journal_trades (user_id, entry_date DESC)
$journal_stmt$,
    $journal_stmt$CREATE INDEX IF NOT EXISTS journal_trades_account_idx
  ON public.journal_trades (account_id)
$journal_stmt$,
    $journal_stmt$CREATE INDEX IF NOT EXISTS journal_trades_import_job_idx
  ON public.journal_trades (import_job_id)
$journal_stmt$,
    $journal_stmt$CREATE INDEX IF NOT EXISTS journal_executions_trade_idx
  ON public.journal_executions (trade_id, occurred_at_utc)
$journal_stmt$,
    $journal_stmt$CREATE INDEX IF NOT EXISTS journal_execution_fees_execution_idx
  ON public.journal_execution_fees (execution_id)
$journal_stmt$,
    $journal_stmt$CREATE INDEX IF NOT EXISTS journal_cash_ledger_account_idx
  ON public.journal_cash_ledger_entries (account_id, occurred_at)
$journal_stmt$,
    $journal_stmt$CREATE INDEX IF NOT EXISTS journal_daily_metrics_user_date_idx
  ON public.journal_daily_metrics (user_id, metric_date)
$journal_stmt$,
    $journal_stmt$CREATE INDEX IF NOT EXISTS journal_event_outbox_status_idx
  ON public.journal_event_outbox (status, next_attempt_at)
$journal_stmt$,
    $journal_stmt$CREATE INDEX IF NOT EXISTS journal_import_rows_job_idx
  ON public.journal_import_rows (import_job_id, row_index)
$journal_stmt$,
    $journal_stmt$CREATE UNIQUE INDEX IF NOT EXISTS journal_import_rows_imported_identity_uidx
  ON public.journal_import_rows (identity_key)
  WHERE status = 'imported' AND identity_key IS NOT NULL
$journal_stmt$,
    $journal_stmt$DO $$
DECLARE
  t text;
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY[
    'journal_trades',
    'journal_trader_profiles',
    'journal_accounts',
    'journal_goals',
    'journal_risk_rules',
    'journal_coaching_commitments',
    'journal_trade_plans',
    'journal_notebooks',
    'journal_notebook_entries',
    'journal_sessions',
    'journal_daily_reviews',
    'journal_playbooks',
    'journal_metric_definitions',
    'journal_saved_reports',
    'journal_trade_sequence_metrics',
    'journal_daily_metrics',
    'journal_ai_conversations',
    'journal_import_mappings',
    'journal_integrations'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t, t
    );
  END LOOP;
END $$
$journal_stmt$,
    $journal_stmt$DO $$
DECLARE
  t text;
  v_created constant text[] := ARRAY[
    'journal_trades',
    'journal_notes',
    'journal_stats_cache',
    'journal_equity_snapshots',
    'journal_imports',
    'journal_trader_profiles',
    'journal_accounts',
    'journal_account_balance_snapshots',
    'journal_goals',
    'journal_risk_rules',
    'journal_coaching_commitments',
    'journal_cash_ledger_entries',
    'journal_balance_reconciliations',
    'journal_currency_conversions',
    'journal_trade_legs',
    'journal_executions',
    'journal_execution_fees',
    'journal_trade_cash_flows',
    'journal_trade_plans',
    'journal_trade_reviews',
    'journal_trade_context',
    'journal_trade_relationships',
    'journal_trade_markers',
    'journal_attachments',
    'journal_tags',
    'journal_tag_assignments',
    'journal_notebooks',
    'journal_notebook_entries',
    'journal_notebook_links',
    'journal_sessions',
    'journal_daily_reviews',
    'journal_playbooks',
    'journal_playbook_versions',
    'journal_playbook_rules',
    'journal_playbook_check_results',
    'journal_risk_violations',
    'journal_process_scores',
    'journal_process_score_components',
    'journal_metric_definitions',
    'journal_metric_formula_versions',
    'journal_report_templates',
    'journal_saved_reports',
    'journal_report_runs',
    'journal_report_run_rows',
    'journal_report_exports',
    'journal_report_schedules',
    'journal_market_context',
    'journal_market_context_sources',
    'journal_price_observations',
    'journal_valuation_snapshots',
    'journal_calculation_runs',
    'journal_calculation_lineage',
    'journal_trade_sequence_metrics',
    'journal_data_quality_issues',
    'journal_daily_metrics',
    'journal_analytics_cache',
    'journal_performance_insights',
    'journal_ai_memories',
    'journal_ai_memory_evidence',
    'journal_ai_insights',
    'journal_ai_conversations',
    'journal_ai_messages',
    'journal_ai_feedback',
    'journal_ai_jobs',
    'journal_ai_usage',
    'journal_import_jobs',
    'journal_import_rows',
    'journal_import_mappings',
    'journal_integrations',
    'journal_provider_accounts',
    'journal_sync_cursors',
    'journal_webhook_endpoints',
    'journal_webhook_deliveries',
    'journal_domain_events',
    'journal_event_outbox',
    'journal_audit_log',
    'journal_dead_letters'
  ];
  v_live constant text[] := ARRAY[
    'journal_trades',
    'journal_notes',
    'journal_equity_snapshots',
    'journal_stats_cache',
    'journal_imports'
  ];
BEGIN
  FOREACH t IN ARRAY v_created LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t
        AND c.relkind = 'r'
    ) THEN
      CONTINUE;
    END IF;

    IF t = ANY (v_live)
       AND EXISTS (
         SELECT 1
         FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = t
       )
    THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      t
    );

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
    END IF;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
    END IF;
  END LOOP;
END;
$$
$journal_stmt$,
    $journal_stmt$ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon
$journal_stmt$,
    $journal_stmt$ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated
$journal_stmt$
  ];
  v_expected text := 'c15c3b36bfff34ccb4c6ac846770d4ef';
  v_digest text;
  v_stmt text;
BEGIN
  v_digest := md5(array_to_string(v_statements, E'\x1e'));
  IF v_digest IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION
      'journal migration integrity mismatch: expected %, got %',
      v_expected,
      v_digest;
  END IF;
  FOREACH v_stmt IN ARRAY v_statements LOOP
    EXECUTE v_stmt;
  END LOOP;
END;
$journal_seg$;
