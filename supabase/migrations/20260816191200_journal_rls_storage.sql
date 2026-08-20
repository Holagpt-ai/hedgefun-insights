-- Stocksist Trading Journal RLS + private storage.
-- Compact manifest-driven replacement of the approved 180 KB policy file.
-- One PostgreSQL-atomic DO block. A CREATE POLICY failure rolls back every
-- DROP POLICY and GRANT in this file. No wildcard journal_% policy deletion.
-- No storage.buckets writes. Does not ALTER TABLE storage.objects.
-- journal-private must be created separately through Lovable's supported
-- storage tooling. The bucket must be private. This migration defines the
-- storage.objects policies but intentionally does not create the bucket.
-- Object paths: {user_id}/imports/, {user_id}/attachments/, {user_id}/exports/
-- Service-role policy exceptions: journal_event_outbox_service_role_all,
-- journal_audit_log_service_role_all, journal_dead_letters_service_role_all.

-- integrity-md5: a8f1117770972910b0edd77b8afe300e
DO $journal_rls$
DECLARE
  r record;
  t text;
  select_pred text;
  write_pred text;
  parent_table text;
  parent_fk text;
  v_digest text;
  v_expected text := 'a8f1117770972910b0edd77b8afe300e';
  v_tables constant text[] := ARRAY[
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
  v_service constant text[] := ARRAY[
    'journal_event_outbox',
    'journal_audit_log',
    'journal_dead_letters'
  ];
  v_catalog constant text[] := ARRAY[
    'journal_metric_definitions',
    'journal_report_templates'
  ];
  v_manifest constant text[] := ARRAY[
    $journal_man$journal_trades,journal_notes,journal_stats_cache,journal_equity_snapshots,journal_imports,journal_trader_profiles,journal_accounts,journal_account_balance_snapshots,journal_goals,journal_risk_rules,journal_coaching_commitments,journal_cash_ledger_entries,journal_balance_reconciliations,journal_currency_conversions,journal_trade_legs,journal_executions,journal_execution_fees,journal_trade_cash_flows,journal_trade_plans,journal_trade_reviews,journal_trade_context,journal_trade_relationships,journal_trade_markers,journal_attachments,journal_tags,journal_tag_assignments,journal_notebooks,journal_notebook_entries,journal_notebook_links,journal_sessions,journal_daily_reviews,journal_playbooks,journal_playbook_versions,journal_playbook_rules,journal_playbook_check_results,journal_risk_violations,journal_process_scores,journal_process_score_components,journal_metric_definitions,journal_metric_formula_versions,journal_report_templates,journal_saved_reports,journal_report_runs,journal_report_run_rows,journal_report_exports,journal_report_schedules,journal_market_context,journal_market_context_sources,journal_price_observations,journal_valuation_snapshots,journal_calculation_runs,journal_calculation_lineage,journal_trade_sequence_metrics,journal_data_quality_issues,journal_daily_metrics,journal_analytics_cache,journal_performance_insights,journal_ai_memories,journal_ai_memory_evidence,journal_ai_insights,journal_ai_conversations,journal_ai_messages,journal_ai_feedback,journal_ai_jobs,journal_ai_usage,journal_import_jobs,journal_import_rows,journal_import_mappings,journal_integrations,journal_provider_accounts,journal_sync_cursors,journal_webhook_endpoints,journal_webhook_deliveries,journal_domain_events,journal_event_outbox,journal_audit_log,journal_dead_letters$journal_man$,
    $journal_man$journal_trades=Users can manage own trades|journal_notes=Users can manage own notes|journal_equity_snapshots=Users can manage own equity snapshots|journal_imports=Users can manage own imports|journal_stats_cache=Users can manage own stats cache$journal_man$,
    $journal_man$journal_trade_legs.journal_trades.trade_id|journal_executions.journal_trades.trade_id|journal_trade_cash_flows.journal_trades.trade_id|journal_tag_assignments.journal_trades.trade_id|journal_notebook_links.journal_notebook_entries.entry_id|journal_playbook_check_results.journal_trades.trade_id|journal_process_score_components.journal_process_scores.process_score_id|journal_report_run_rows.journal_report_runs.report_run_id|journal_market_context_sources.journal_market_context.market_context_id|journal_calculation_lineage.journal_calculation_runs.calculation_run_id|journal_ai_memory_evidence.journal_ai_memories.memory_id|journal_ai_messages.journal_ai_conversations.conversation_id|journal_import_rows.journal_import_jobs.import_job_id|journal_provider_accounts.journal_integrations.integration_id|journal_sync_cursors.journal_integrations.integration_id|journal_webhook_deliveries.journal_webhook_endpoints.endpoint_id$journal_man$,
    $journal_man$notes:journal_notes.user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.journal_trades t
      WHERE t.id = journal_notes.trade_id
        AND t.user_id = auth.uid()
    )$journal_man$,
    $journal_man$fees:EXISTS (
      SELECT 1 FROM public.journal_executions e
      JOIN public.journal_trades p ON p.id = e.trade_id
      WHERE e.id = journal_execution_fees.execution_id AND p.user_id = auth.uid()
    )$journal_man$,
    $journal_man$user:user_id = auth.uid()$journal_man$,
    $journal_man$parent_template:EXISTS (SELECT 1 FROM public.%I p WHERE p.id = %I.%I AND p.user_id = auth.uid())$journal_man$,
    $journal_man$catalog:journal_metric_definitions,journal_report_templates$journal_man$,
    $journal_man$catalog_select:(user_id IS NULL OR user_id = auth.uid())$journal_man$,
    $journal_man$formula_select:EXISTS (
      SELECT 1 FROM public.journal_metric_definitions p
      WHERE p.id = journal_metric_formula_versions.metric_definition_id
        AND (p.user_id IS NULL OR p.user_id = auth.uid())
    )$journal_man$,
    $journal_man$formula_write:EXISTS (
      SELECT 1 FROM public.journal_metric_definitions p
      WHERE p.id = journal_metric_formula_versions.metric_definition_id
        AND p.user_id = auth.uid()
    )$journal_man$,
    $journal_man$service:journal_event_outbox,journal_audit_log,journal_dead_letters$journal_man$,
    $journal_man$storage:journal_private_select_own,journal_private_insert_own,journal_private_update_own,journal_private_delete_own$journal_man$
  ];
BEGIN
  v_digest := md5(array_to_string(v_manifest, E'\x1e'));
  IF v_digest IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION
      'journal migration integrity mismatch: expected %, got %',
      v_expected,
      v_digest;
  END IF;

  FOR r IN
    SELECT p.schemaname, p.tablename, p.policyname
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = ANY (v_tables)
  LOOP
    IF r.policyname IN (
         r.tablename || '_select_own',
         r.tablename || '_insert_own',
         r.tablename || '_update_own',
         r.tablename || '_delete_own'
       )
       OR (r.tablename = ANY (v_service) AND r.policyname = r.tablename || '_service_role_all')
       OR EXISTS (
         SELECT 1 FROM (VALUES
    ('public', 'journal_trades', 'Users can manage own trades'),
    ('public', 'journal_notes', 'Users can manage own notes'),
    ('public', 'journal_equity_snapshots', 'Users can manage own equity snapshots'),
    ('public', 'journal_imports', 'Users can manage own imports'),
    ('public', 'journal_stats_cache', 'Users can manage own stats cache')
         ) AS legacy(schemaname, tablename, policyname)
         WHERE legacy.schemaname = r.schemaname
           AND legacy.tablename = r.tablename
           AND legacy.policyname = r.policyname
       )
    THEN
      CONTINUE;
    END IF;
    RAISE EXCEPTION
      'preflight: unexpected policy %.% %',
      r.schemaname, r.tablename, r.policyname;
  END LOOP;

  FOREACH t IN ARRAY v_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF t = 'journal_trades' THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Users can manage own trades', t);
    ELSIF t = 'journal_notes' THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Users can manage own notes', t);
    ELSIF t = 'journal_equity_snapshots' THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Users can manage own equity snapshots', t);
    ELSIF t = 'journal_imports' THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Users can manage own imports', t);
    ELSIF t = 'journal_stats_cache' THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Users can manage own stats cache', t);
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_own', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert_own', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update_own', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete_own', t);
    IF t = ANY (v_service) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_service_role_all', t);
    END IF;

    parent_table := NULL;
    parent_fk := NULL;
    SELECT p.parent, p.fk INTO parent_table, parent_fk
    FROM (VALUES
    ('journal_trade_legs', 'journal_trades', 'trade_id'),
    ('journal_executions', 'journal_trades', 'trade_id'),
    ('journal_trade_cash_flows', 'journal_trades', 'trade_id'),
    ('journal_tag_assignments', 'journal_trades', 'trade_id'),
    ('journal_notebook_links', 'journal_notebook_entries', 'entry_id'),
    ('journal_playbook_check_results', 'journal_trades', 'trade_id'),
    ('journal_process_score_components', 'journal_process_scores', 'process_score_id'),
    ('journal_report_run_rows', 'journal_report_runs', 'report_run_id'),
    ('journal_market_context_sources', 'journal_market_context', 'market_context_id'),
    ('journal_calculation_lineage', 'journal_calculation_runs', 'calculation_run_id'),
    ('journal_ai_memory_evidence', 'journal_ai_memories', 'memory_id'),
    ('journal_ai_messages', 'journal_ai_conversations', 'conversation_id'),
    ('journal_import_rows', 'journal_import_jobs', 'import_job_id'),
    ('journal_provider_accounts', 'journal_integrations', 'integration_id'),
    ('journal_sync_cursors', 'journal_integrations', 'integration_id'),
    ('journal_webhook_deliveries', 'journal_webhook_endpoints', 'endpoint_id')
    ) AS p(child, parent, fk)
    WHERE p.child = t;

    IF t = 'journal_notes' THEN
      select_pred := $journal_notes_pred$
journal_notes.user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.journal_trades t
      WHERE t.id = journal_notes.trade_id
        AND t.user_id = auth.uid()
    )
      $journal_notes_pred$;
      write_pred := select_pred;
    ELSIF t = 'journal_execution_fees' THEN
      select_pred := $journal_fees_pred$
EXISTS (
      SELECT 1 FROM public.journal_executions e
      JOIN public.journal_trades p ON p.id = e.trade_id
      WHERE e.id = journal_execution_fees.execution_id AND p.user_id = auth.uid()
    )
      $journal_fees_pred$;
      write_pred := select_pred;
    ELSIF t = 'journal_metric_formula_versions' THEN
      select_pred := $journal_formula_sel$
EXISTS (
      SELECT 1 FROM public.journal_metric_definitions p
      WHERE p.id = journal_metric_formula_versions.metric_definition_id
        AND (p.user_id IS NULL OR p.user_id = auth.uid())
    )
      $journal_formula_sel$;
      write_pred := $journal_formula_wr$
EXISTS (
      SELECT 1 FROM public.journal_metric_definitions p
      WHERE p.id = journal_metric_formula_versions.metric_definition_id
        AND p.user_id = auth.uid()
    )
      $journal_formula_wr$;
    ELSIF t = ANY (v_catalog) THEN
      select_pred := '(user_id IS NULL OR user_id = auth.uid())';
      write_pred := 'user_id = auth.uid()';
    ELSIF parent_table IS NOT NULL THEN
      select_pred := format('EXISTS (SELECT 1 FROM public.%I p WHERE p.id = %I.%I AND p.user_id = auth.uid())', parent_table, t, parent_fk);
      write_pred := select_pred;
    ELSE
      select_pred := 'user_id = auth.uid()';
      write_pred := select_pred;
    END IF;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
      t || '_select_own', t, select_pred
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
      t || '_insert_own', t, write_pred
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      t || '_update_own', t, write_pred, write_pred
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
      t || '_delete_own', t, write_pred
    );
    IF t = ANY (v_service) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t || '_service_role_all', t
      );
    END IF;

    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated',
      t
    );
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;

  EXECUTE format('DROP POLICY IF EXISTS %I ON storage.%I', 'journal_private_select_own', 'objects');
  EXECUTE format('DROP POLICY IF EXISTS %I ON storage.%I', 'journal_private_insert_own', 'objects');
  EXECUTE format('DROP POLICY IF EXISTS %I ON storage.%I', 'journal_private_update_own', 'objects');
  EXECUTE format('DROP POLICY IF EXISTS %I ON storage.%I', 'journal_private_delete_own', 'objects');
  EXECUTE $journal_create$
  CREATE POLICY "journal_private_select_own"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'journal-private'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] IN ('imports', 'attachments', 'exports')
  )
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_private_insert_own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'journal-private'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] IN ('imports', 'attachments', 'exports')
  )
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_private_update_own"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'journal-private'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] IN ('imports', 'attachments', 'exports')
  )
  WITH CHECK (
    bucket_id = 'journal-private'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] IN ('imports', 'attachments', 'exports')
  )
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_private_delete_own"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'journal-private'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] IN ('imports', 'attachments', 'exports')
  )
  $journal_create$;
END;
$journal_rls$;
