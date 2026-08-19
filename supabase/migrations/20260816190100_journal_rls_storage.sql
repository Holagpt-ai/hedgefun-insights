-- Stocksist Trading Journal RLS + private storage.
-- DROP POLICY IF EXISTS before CREATE POLICY. Additive only.

DROP POLICY IF EXISTS "Users can manage own notes" ON public.journal_notes;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename LIKE 'journal_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- journal_trades
ALTER TABLE public.journal_trades ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_trades FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_trades TO authenticated;
GRANT ALL ON TABLE public.journal_trades TO service_role;

-- journal_notes
ALTER TABLE public.journal_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_notes FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_notes TO authenticated;
GRANT ALL ON TABLE public.journal_notes TO service_role;

-- journal_stats_cache
ALTER TABLE public.journal_stats_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_stats_cache FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_stats_cache TO authenticated;
GRANT ALL ON TABLE public.journal_stats_cache TO service_role;

-- journal_equity_snapshots
ALTER TABLE public.journal_equity_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_equity_snapshots FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_equity_snapshots TO authenticated;
GRANT ALL ON TABLE public.journal_equity_snapshots TO service_role;

-- journal_imports
ALTER TABLE public.journal_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_imports FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_imports TO authenticated;
GRANT ALL ON TABLE public.journal_imports TO service_role;

-- journal_trader_profiles
ALTER TABLE public.journal_trader_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_trader_profiles FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_trader_profiles TO authenticated;
GRANT ALL ON TABLE public.journal_trader_profiles TO service_role;

-- journal_accounts
ALTER TABLE public.journal_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_accounts FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_accounts TO authenticated;
GRANT ALL ON TABLE public.journal_accounts TO service_role;

-- journal_account_balance_snapshots
ALTER TABLE public.journal_account_balance_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_account_balance_snapshots FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_account_balance_snapshots TO authenticated;
GRANT ALL ON TABLE public.journal_account_balance_snapshots TO service_role;

-- journal_goals
ALTER TABLE public.journal_goals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_goals FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_goals TO authenticated;
GRANT ALL ON TABLE public.journal_goals TO service_role;

-- journal_risk_rules
ALTER TABLE public.journal_risk_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_risk_rules FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_risk_rules TO authenticated;
GRANT ALL ON TABLE public.journal_risk_rules TO service_role;

-- journal_coaching_commitments
ALTER TABLE public.journal_coaching_commitments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_coaching_commitments FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_coaching_commitments TO authenticated;
GRANT ALL ON TABLE public.journal_coaching_commitments TO service_role;

-- journal_cash_ledger_entries
ALTER TABLE public.journal_cash_ledger_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_cash_ledger_entries FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_cash_ledger_entries TO authenticated;
GRANT ALL ON TABLE public.journal_cash_ledger_entries TO service_role;

-- journal_balance_reconciliations
ALTER TABLE public.journal_balance_reconciliations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_balance_reconciliations FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_balance_reconciliations TO authenticated;
GRANT ALL ON TABLE public.journal_balance_reconciliations TO service_role;

-- journal_currency_conversions
ALTER TABLE public.journal_currency_conversions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_currency_conversions FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_currency_conversions TO authenticated;
GRANT ALL ON TABLE public.journal_currency_conversions TO service_role;

-- journal_trade_plans
ALTER TABLE public.journal_trade_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_trade_plans FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_trade_plans TO authenticated;
GRANT ALL ON TABLE public.journal_trade_plans TO service_role;

-- journal_trade_reviews
ALTER TABLE public.journal_trade_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_trade_reviews FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_trade_reviews TO authenticated;
GRANT ALL ON TABLE public.journal_trade_reviews TO service_role;

-- journal_trade_context
ALTER TABLE public.journal_trade_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_trade_context FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_trade_context TO authenticated;
GRANT ALL ON TABLE public.journal_trade_context TO service_role;

-- journal_trade_relationships
ALTER TABLE public.journal_trade_relationships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_trade_relationships FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_trade_relationships TO authenticated;
GRANT ALL ON TABLE public.journal_trade_relationships TO service_role;

-- journal_trade_markers
ALTER TABLE public.journal_trade_markers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_trade_markers FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_trade_markers TO authenticated;
GRANT ALL ON TABLE public.journal_trade_markers TO service_role;

-- journal_attachments
ALTER TABLE public.journal_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_attachments FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_attachments TO authenticated;
GRANT ALL ON TABLE public.journal_attachments TO service_role;

-- journal_tags
ALTER TABLE public.journal_tags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_tags FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_tags TO authenticated;
GRANT ALL ON TABLE public.journal_tags TO service_role;

-- journal_notebooks
ALTER TABLE public.journal_notebooks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_notebooks FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_notebooks TO authenticated;
GRANT ALL ON TABLE public.journal_notebooks TO service_role;

-- journal_notebook_entries
ALTER TABLE public.journal_notebook_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_notebook_entries FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_notebook_entries TO authenticated;
GRANT ALL ON TABLE public.journal_notebook_entries TO service_role;

-- journal_sessions
ALTER TABLE public.journal_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_sessions FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_sessions TO authenticated;
GRANT ALL ON TABLE public.journal_sessions TO service_role;

-- journal_daily_reviews
ALTER TABLE public.journal_daily_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_daily_reviews FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_daily_reviews TO authenticated;
GRANT ALL ON TABLE public.journal_daily_reviews TO service_role;

-- journal_playbooks
ALTER TABLE public.journal_playbooks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_playbooks FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_playbooks TO authenticated;
GRANT ALL ON TABLE public.journal_playbooks TO service_role;

-- journal_playbook_versions
ALTER TABLE public.journal_playbook_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_playbook_versions FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_playbook_versions TO authenticated;
GRANT ALL ON TABLE public.journal_playbook_versions TO service_role;

-- journal_playbook_rules
ALTER TABLE public.journal_playbook_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_playbook_rules FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_playbook_rules TO authenticated;
GRANT ALL ON TABLE public.journal_playbook_rules TO service_role;

-- journal_risk_violations
ALTER TABLE public.journal_risk_violations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_risk_violations FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_risk_violations TO authenticated;
GRANT ALL ON TABLE public.journal_risk_violations TO service_role;

-- journal_process_scores
ALTER TABLE public.journal_process_scores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_process_scores FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_process_scores TO authenticated;
GRANT ALL ON TABLE public.journal_process_scores TO service_role;

-- journal_saved_reports
ALTER TABLE public.journal_saved_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_saved_reports FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_saved_reports TO authenticated;
GRANT ALL ON TABLE public.journal_saved_reports TO service_role;

-- journal_report_runs
ALTER TABLE public.journal_report_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_report_runs FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_report_runs TO authenticated;
GRANT ALL ON TABLE public.journal_report_runs TO service_role;

-- journal_report_exports
ALTER TABLE public.journal_report_exports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_report_exports FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_report_exports TO authenticated;
GRANT ALL ON TABLE public.journal_report_exports TO service_role;

-- journal_report_schedules
ALTER TABLE public.journal_report_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_report_schedules FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_report_schedules TO authenticated;
GRANT ALL ON TABLE public.journal_report_schedules TO service_role;

-- journal_market_context
ALTER TABLE public.journal_market_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_market_context FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_market_context TO authenticated;
GRANT ALL ON TABLE public.journal_market_context TO service_role;

-- journal_price_observations
ALTER TABLE public.journal_price_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_price_observations FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_price_observations TO authenticated;
GRANT ALL ON TABLE public.journal_price_observations TO service_role;

-- journal_valuation_snapshots
ALTER TABLE public.journal_valuation_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_valuation_snapshots FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_valuation_snapshots TO authenticated;
GRANT ALL ON TABLE public.journal_valuation_snapshots TO service_role;

-- journal_calculation_runs
ALTER TABLE public.journal_calculation_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_calculation_runs FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_calculation_runs TO authenticated;
GRANT ALL ON TABLE public.journal_calculation_runs TO service_role;

-- journal_trade_sequence_metrics
ALTER TABLE public.journal_trade_sequence_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_trade_sequence_metrics FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_trade_sequence_metrics TO authenticated;
GRANT ALL ON TABLE public.journal_trade_sequence_metrics TO service_role;

-- journal_data_quality_issues
ALTER TABLE public.journal_data_quality_issues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_data_quality_issues FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_data_quality_issues TO authenticated;
GRANT ALL ON TABLE public.journal_data_quality_issues TO service_role;

-- journal_daily_metrics
ALTER TABLE public.journal_daily_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_daily_metrics FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_daily_metrics TO authenticated;
GRANT ALL ON TABLE public.journal_daily_metrics TO service_role;

-- journal_analytics_cache
ALTER TABLE public.journal_analytics_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_analytics_cache FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_analytics_cache TO authenticated;
GRANT ALL ON TABLE public.journal_analytics_cache TO service_role;

-- journal_performance_insights
ALTER TABLE public.journal_performance_insights ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_performance_insights FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_performance_insights TO authenticated;
GRANT ALL ON TABLE public.journal_performance_insights TO service_role;

-- journal_ai_memories
ALTER TABLE public.journal_ai_memories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_ai_memories FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_ai_memories TO authenticated;
GRANT ALL ON TABLE public.journal_ai_memories TO service_role;

-- journal_ai_insights
ALTER TABLE public.journal_ai_insights ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_ai_insights FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_ai_insights TO authenticated;
GRANT ALL ON TABLE public.journal_ai_insights TO service_role;

-- journal_ai_conversations
ALTER TABLE public.journal_ai_conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_ai_conversations FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_ai_conversations TO authenticated;
GRANT ALL ON TABLE public.journal_ai_conversations TO service_role;

-- journal_ai_feedback
ALTER TABLE public.journal_ai_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_ai_feedback FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_ai_feedback TO authenticated;
GRANT ALL ON TABLE public.journal_ai_feedback TO service_role;

-- journal_ai_jobs
ALTER TABLE public.journal_ai_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_ai_jobs FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_ai_jobs TO authenticated;
GRANT ALL ON TABLE public.journal_ai_jobs TO service_role;

-- journal_ai_usage
ALTER TABLE public.journal_ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_ai_usage FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_ai_usage TO authenticated;
GRANT ALL ON TABLE public.journal_ai_usage TO service_role;

-- journal_import_jobs
ALTER TABLE public.journal_import_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_import_jobs FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_import_jobs TO authenticated;
GRANT ALL ON TABLE public.journal_import_jobs TO service_role;

-- journal_import_mappings
ALTER TABLE public.journal_import_mappings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_import_mappings FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_import_mappings TO authenticated;
GRANT ALL ON TABLE public.journal_import_mappings TO service_role;

-- journal_integrations
ALTER TABLE public.journal_integrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_integrations FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_integrations TO authenticated;
GRANT ALL ON TABLE public.journal_integrations TO service_role;

-- journal_webhook_endpoints
ALTER TABLE public.journal_webhook_endpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_webhook_endpoints FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_webhook_endpoints TO authenticated;
GRANT ALL ON TABLE public.journal_webhook_endpoints TO service_role;

-- journal_domain_events
ALTER TABLE public.journal_domain_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_domain_events FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_domain_events TO authenticated;
GRANT ALL ON TABLE public.journal_domain_events TO service_role;

-- journal_event_outbox
ALTER TABLE public.journal_event_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_event_outbox FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_event_outbox TO authenticated;
GRANT ALL ON TABLE public.journal_event_outbox TO service_role;

-- journal_audit_log
ALTER TABLE public.journal_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_audit_log FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_audit_log TO authenticated;
GRANT ALL ON TABLE public.journal_audit_log TO service_role;

-- journal_metric_definitions
ALTER TABLE public.journal_metric_definitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_metric_definitions FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_metric_definitions TO authenticated;
GRANT ALL ON TABLE public.journal_metric_definitions TO service_role;

-- journal_report_templates
ALTER TABLE public.journal_report_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_report_templates FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_report_templates TO authenticated;
GRANT ALL ON TABLE public.journal_report_templates TO service_role;

-- journal_trade_legs
ALTER TABLE public.journal_trade_legs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_trade_legs FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_trade_legs TO authenticated;
GRANT ALL ON TABLE public.journal_trade_legs TO service_role;

-- journal_executions
ALTER TABLE public.journal_executions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_executions FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_executions TO authenticated;
GRANT ALL ON TABLE public.journal_executions TO service_role;

-- journal_execution_fees
ALTER TABLE public.journal_execution_fees ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_execution_fees FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_execution_fees TO authenticated;
GRANT ALL ON TABLE public.journal_execution_fees TO service_role;

-- journal_trade_cash_flows
ALTER TABLE public.journal_trade_cash_flows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_trade_cash_flows FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_trade_cash_flows TO authenticated;
GRANT ALL ON TABLE public.journal_trade_cash_flows TO service_role;

-- journal_tag_assignments
ALTER TABLE public.journal_tag_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_tag_assignments FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_tag_assignments TO authenticated;
GRANT ALL ON TABLE public.journal_tag_assignments TO service_role;

-- journal_notebook_links
ALTER TABLE public.journal_notebook_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_notebook_links FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_notebook_links TO authenticated;
GRANT ALL ON TABLE public.journal_notebook_links TO service_role;

-- journal_playbook_check_results
ALTER TABLE public.journal_playbook_check_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_playbook_check_results FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_playbook_check_results TO authenticated;
GRANT ALL ON TABLE public.journal_playbook_check_results TO service_role;

-- journal_process_score_components
ALTER TABLE public.journal_process_score_components ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_process_score_components FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_process_score_components TO authenticated;
GRANT ALL ON TABLE public.journal_process_score_components TO service_role;

-- journal_metric_formula_versions
ALTER TABLE public.journal_metric_formula_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_metric_formula_versions FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_metric_formula_versions TO authenticated;
GRANT ALL ON TABLE public.journal_metric_formula_versions TO service_role;

-- journal_report_run_rows
ALTER TABLE public.journal_report_run_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_report_run_rows FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_report_run_rows TO authenticated;
GRANT ALL ON TABLE public.journal_report_run_rows TO service_role;

-- journal_market_context_sources
ALTER TABLE public.journal_market_context_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_market_context_sources FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_market_context_sources TO authenticated;
GRANT ALL ON TABLE public.journal_market_context_sources TO service_role;

-- journal_calculation_lineage
ALTER TABLE public.journal_calculation_lineage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_calculation_lineage FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_calculation_lineage TO authenticated;
GRANT ALL ON TABLE public.journal_calculation_lineage TO service_role;

-- journal_ai_memory_evidence
ALTER TABLE public.journal_ai_memory_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_ai_memory_evidence FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_ai_memory_evidence TO authenticated;
GRANT ALL ON TABLE public.journal_ai_memory_evidence TO service_role;

-- journal_ai_messages
ALTER TABLE public.journal_ai_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_ai_messages FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_ai_messages TO authenticated;
GRANT ALL ON TABLE public.journal_ai_messages TO service_role;

-- journal_import_rows
ALTER TABLE public.journal_import_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_import_rows FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_import_rows TO authenticated;
GRANT ALL ON TABLE public.journal_import_rows TO service_role;

-- journal_provider_accounts
ALTER TABLE public.journal_provider_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_provider_accounts FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_provider_accounts TO authenticated;
GRANT ALL ON TABLE public.journal_provider_accounts TO service_role;

-- journal_sync_cursors
ALTER TABLE public.journal_sync_cursors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_sync_cursors FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_sync_cursors TO authenticated;
GRANT ALL ON TABLE public.journal_sync_cursors TO service_role;

-- journal_webhook_deliveries
ALTER TABLE public.journal_webhook_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_webhook_deliveries FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_webhook_deliveries TO authenticated;
GRANT ALL ON TABLE public.journal_webhook_deliveries TO service_role;

-- journal_dead_letters
ALTER TABLE public.journal_dead_letters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_dead_letters FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_dead_letters TO authenticated;
GRANT ALL ON TABLE public.journal_dead_letters TO service_role;

-- Owner policies (user_id = auth.uid())

DROP POLICY IF EXISTS "journal_trades_select_own" ON public.journal_trades;
CREATE POLICY "journal_trades_select_own"
  ON public.journal_trades
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trades_insert_own" ON public.journal_trades;
CREATE POLICY "journal_trades_insert_own"
  ON public.journal_trades
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trades_update_own" ON public.journal_trades;
CREATE POLICY "journal_trades_update_own"
  ON public.journal_trades
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trades_delete_own" ON public.journal_trades;
CREATE POLICY "journal_trades_delete_own"
  ON public.journal_trades
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_notes_select_own" ON public.journal_notes;
CREATE POLICY "journal_notes_select_own"
  ON public.journal_notes
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_notes_insert_own" ON public.journal_notes;
CREATE POLICY "journal_notes_insert_own"
  ON public.journal_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_notes_update_own" ON public.journal_notes;
CREATE POLICY "journal_notes_update_own"
  ON public.journal_notes
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_notes_delete_own" ON public.journal_notes;
CREATE POLICY "journal_notes_delete_own"
  ON public.journal_notes
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_stats_cache_select_own" ON public.journal_stats_cache;
CREATE POLICY "journal_stats_cache_select_own"
  ON public.journal_stats_cache
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_stats_cache_insert_own" ON public.journal_stats_cache;
CREATE POLICY "journal_stats_cache_insert_own"
  ON public.journal_stats_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_stats_cache_update_own" ON public.journal_stats_cache;
CREATE POLICY "journal_stats_cache_update_own"
  ON public.journal_stats_cache
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_stats_cache_delete_own" ON public.journal_stats_cache;
CREATE POLICY "journal_stats_cache_delete_own"
  ON public.journal_stats_cache
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_equity_snapshots_select_own" ON public.journal_equity_snapshots;
CREATE POLICY "journal_equity_snapshots_select_own"
  ON public.journal_equity_snapshots
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_equity_snapshots_insert_own" ON public.journal_equity_snapshots;
CREATE POLICY "journal_equity_snapshots_insert_own"
  ON public.journal_equity_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_equity_snapshots_update_own" ON public.journal_equity_snapshots;
CREATE POLICY "journal_equity_snapshots_update_own"
  ON public.journal_equity_snapshots
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_equity_snapshots_delete_own" ON public.journal_equity_snapshots;
CREATE POLICY "journal_equity_snapshots_delete_own"
  ON public.journal_equity_snapshots
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_imports_select_own" ON public.journal_imports;
CREATE POLICY "journal_imports_select_own"
  ON public.journal_imports
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_imports_insert_own" ON public.journal_imports;
CREATE POLICY "journal_imports_insert_own"
  ON public.journal_imports
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_imports_update_own" ON public.journal_imports;
CREATE POLICY "journal_imports_update_own"
  ON public.journal_imports
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_imports_delete_own" ON public.journal_imports;
CREATE POLICY "journal_imports_delete_own"
  ON public.journal_imports
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trader_profiles_select_own" ON public.journal_trader_profiles;
CREATE POLICY "journal_trader_profiles_select_own"
  ON public.journal_trader_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trader_profiles_insert_own" ON public.journal_trader_profiles;
CREATE POLICY "journal_trader_profiles_insert_own"
  ON public.journal_trader_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trader_profiles_update_own" ON public.journal_trader_profiles;
CREATE POLICY "journal_trader_profiles_update_own"
  ON public.journal_trader_profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trader_profiles_delete_own" ON public.journal_trader_profiles;
CREATE POLICY "journal_trader_profiles_delete_own"
  ON public.journal_trader_profiles
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_accounts_select_own" ON public.journal_accounts;
CREATE POLICY "journal_accounts_select_own"
  ON public.journal_accounts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_accounts_insert_own" ON public.journal_accounts;
CREATE POLICY "journal_accounts_insert_own"
  ON public.journal_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_accounts_update_own" ON public.journal_accounts;
CREATE POLICY "journal_accounts_update_own"
  ON public.journal_accounts
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_accounts_delete_own" ON public.journal_accounts;
CREATE POLICY "journal_accounts_delete_own"
  ON public.journal_accounts
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_account_balance_snapshots_select_own" ON public.journal_account_balance_snapshots;
CREATE POLICY "journal_account_balance_snapshots_select_own"
  ON public.journal_account_balance_snapshots
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_account_balance_snapshots_insert_own" ON public.journal_account_balance_snapshots;
CREATE POLICY "journal_account_balance_snapshots_insert_own"
  ON public.journal_account_balance_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_account_balance_snapshots_update_own" ON public.journal_account_balance_snapshots;
CREATE POLICY "journal_account_balance_snapshots_update_own"
  ON public.journal_account_balance_snapshots
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_account_balance_snapshots_delete_own" ON public.journal_account_balance_snapshots;
CREATE POLICY "journal_account_balance_snapshots_delete_own"
  ON public.journal_account_balance_snapshots
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_goals_select_own" ON public.journal_goals;
CREATE POLICY "journal_goals_select_own"
  ON public.journal_goals
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_goals_insert_own" ON public.journal_goals;
CREATE POLICY "journal_goals_insert_own"
  ON public.journal_goals
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_goals_update_own" ON public.journal_goals;
CREATE POLICY "journal_goals_update_own"
  ON public.journal_goals
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_goals_delete_own" ON public.journal_goals;
CREATE POLICY "journal_goals_delete_own"
  ON public.journal_goals
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_risk_rules_select_own" ON public.journal_risk_rules;
CREATE POLICY "journal_risk_rules_select_own"
  ON public.journal_risk_rules
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_risk_rules_insert_own" ON public.journal_risk_rules;
CREATE POLICY "journal_risk_rules_insert_own"
  ON public.journal_risk_rules
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_risk_rules_update_own" ON public.journal_risk_rules;
CREATE POLICY "journal_risk_rules_update_own"
  ON public.journal_risk_rules
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_risk_rules_delete_own" ON public.journal_risk_rules;
CREATE POLICY "journal_risk_rules_delete_own"
  ON public.journal_risk_rules
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_coaching_commitments_select_own" ON public.journal_coaching_commitments;
CREATE POLICY "journal_coaching_commitments_select_own"
  ON public.journal_coaching_commitments
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_coaching_commitments_insert_own" ON public.journal_coaching_commitments;
CREATE POLICY "journal_coaching_commitments_insert_own"
  ON public.journal_coaching_commitments
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_coaching_commitments_update_own" ON public.journal_coaching_commitments;
CREATE POLICY "journal_coaching_commitments_update_own"
  ON public.journal_coaching_commitments
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_coaching_commitments_delete_own" ON public.journal_coaching_commitments;
CREATE POLICY "journal_coaching_commitments_delete_own"
  ON public.journal_coaching_commitments
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_cash_ledger_entries_select_own" ON public.journal_cash_ledger_entries;
CREATE POLICY "journal_cash_ledger_entries_select_own"
  ON public.journal_cash_ledger_entries
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_cash_ledger_entries_insert_own" ON public.journal_cash_ledger_entries;
CREATE POLICY "journal_cash_ledger_entries_insert_own"
  ON public.journal_cash_ledger_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_cash_ledger_entries_update_own" ON public.journal_cash_ledger_entries;
CREATE POLICY "journal_cash_ledger_entries_update_own"
  ON public.journal_cash_ledger_entries
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_cash_ledger_entries_delete_own" ON public.journal_cash_ledger_entries;
CREATE POLICY "journal_cash_ledger_entries_delete_own"
  ON public.journal_cash_ledger_entries
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_balance_reconciliations_select_own" ON public.journal_balance_reconciliations;
CREATE POLICY "journal_balance_reconciliations_select_own"
  ON public.journal_balance_reconciliations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_balance_reconciliations_insert_own" ON public.journal_balance_reconciliations;
CREATE POLICY "journal_balance_reconciliations_insert_own"
  ON public.journal_balance_reconciliations
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_balance_reconciliations_update_own" ON public.journal_balance_reconciliations;
CREATE POLICY "journal_balance_reconciliations_update_own"
  ON public.journal_balance_reconciliations
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_balance_reconciliations_delete_own" ON public.journal_balance_reconciliations;
CREATE POLICY "journal_balance_reconciliations_delete_own"
  ON public.journal_balance_reconciliations
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_currency_conversions_select_own" ON public.journal_currency_conversions;
CREATE POLICY "journal_currency_conversions_select_own"
  ON public.journal_currency_conversions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_currency_conversions_insert_own" ON public.journal_currency_conversions;
CREATE POLICY "journal_currency_conversions_insert_own"
  ON public.journal_currency_conversions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_currency_conversions_update_own" ON public.journal_currency_conversions;
CREATE POLICY "journal_currency_conversions_update_own"
  ON public.journal_currency_conversions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_currency_conversions_delete_own" ON public.journal_currency_conversions;
CREATE POLICY "journal_currency_conversions_delete_own"
  ON public.journal_currency_conversions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trade_plans_select_own" ON public.journal_trade_plans;
CREATE POLICY "journal_trade_plans_select_own"
  ON public.journal_trade_plans
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trade_plans_insert_own" ON public.journal_trade_plans;
CREATE POLICY "journal_trade_plans_insert_own"
  ON public.journal_trade_plans
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trade_plans_update_own" ON public.journal_trade_plans;
CREATE POLICY "journal_trade_plans_update_own"
  ON public.journal_trade_plans
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trade_plans_delete_own" ON public.journal_trade_plans;
CREATE POLICY "journal_trade_plans_delete_own"
  ON public.journal_trade_plans
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trade_reviews_select_own" ON public.journal_trade_reviews;
CREATE POLICY "journal_trade_reviews_select_own"
  ON public.journal_trade_reviews
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trade_reviews_insert_own" ON public.journal_trade_reviews;
CREATE POLICY "journal_trade_reviews_insert_own"
  ON public.journal_trade_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trade_reviews_update_own" ON public.journal_trade_reviews;
CREATE POLICY "journal_trade_reviews_update_own"
  ON public.journal_trade_reviews
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trade_reviews_delete_own" ON public.journal_trade_reviews;
CREATE POLICY "journal_trade_reviews_delete_own"
  ON public.journal_trade_reviews
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trade_context_select_own" ON public.journal_trade_context;
CREATE POLICY "journal_trade_context_select_own"
  ON public.journal_trade_context
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trade_context_insert_own" ON public.journal_trade_context;
CREATE POLICY "journal_trade_context_insert_own"
  ON public.journal_trade_context
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trade_context_update_own" ON public.journal_trade_context;
CREATE POLICY "journal_trade_context_update_own"
  ON public.journal_trade_context
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trade_context_delete_own" ON public.journal_trade_context;
CREATE POLICY "journal_trade_context_delete_own"
  ON public.journal_trade_context
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trade_relationships_select_own" ON public.journal_trade_relationships;
CREATE POLICY "journal_trade_relationships_select_own"
  ON public.journal_trade_relationships
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trade_relationships_insert_own" ON public.journal_trade_relationships;
CREATE POLICY "journal_trade_relationships_insert_own"
  ON public.journal_trade_relationships
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trade_relationships_update_own" ON public.journal_trade_relationships;
CREATE POLICY "journal_trade_relationships_update_own"
  ON public.journal_trade_relationships
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trade_relationships_delete_own" ON public.journal_trade_relationships;
CREATE POLICY "journal_trade_relationships_delete_own"
  ON public.journal_trade_relationships
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trade_markers_select_own" ON public.journal_trade_markers;
CREATE POLICY "journal_trade_markers_select_own"
  ON public.journal_trade_markers
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trade_markers_insert_own" ON public.journal_trade_markers;
CREATE POLICY "journal_trade_markers_insert_own"
  ON public.journal_trade_markers
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trade_markers_update_own" ON public.journal_trade_markers;
CREATE POLICY "journal_trade_markers_update_own"
  ON public.journal_trade_markers
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trade_markers_delete_own" ON public.journal_trade_markers;
CREATE POLICY "journal_trade_markers_delete_own"
  ON public.journal_trade_markers
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_attachments_select_own" ON public.journal_attachments;
CREATE POLICY "journal_attachments_select_own"
  ON public.journal_attachments
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_attachments_insert_own" ON public.journal_attachments;
CREATE POLICY "journal_attachments_insert_own"
  ON public.journal_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_attachments_update_own" ON public.journal_attachments;
CREATE POLICY "journal_attachments_update_own"
  ON public.journal_attachments
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_attachments_delete_own" ON public.journal_attachments;
CREATE POLICY "journal_attachments_delete_own"
  ON public.journal_attachments
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_tags_select_own" ON public.journal_tags;
CREATE POLICY "journal_tags_select_own"
  ON public.journal_tags
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_tags_insert_own" ON public.journal_tags;
CREATE POLICY "journal_tags_insert_own"
  ON public.journal_tags
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_tags_update_own" ON public.journal_tags;
CREATE POLICY "journal_tags_update_own"
  ON public.journal_tags
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_tags_delete_own" ON public.journal_tags;
CREATE POLICY "journal_tags_delete_own"
  ON public.journal_tags
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_notebooks_select_own" ON public.journal_notebooks;
CREATE POLICY "journal_notebooks_select_own"
  ON public.journal_notebooks
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_notebooks_insert_own" ON public.journal_notebooks;
CREATE POLICY "journal_notebooks_insert_own"
  ON public.journal_notebooks
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_notebooks_update_own" ON public.journal_notebooks;
CREATE POLICY "journal_notebooks_update_own"
  ON public.journal_notebooks
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_notebooks_delete_own" ON public.journal_notebooks;
CREATE POLICY "journal_notebooks_delete_own"
  ON public.journal_notebooks
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_notebook_entries_select_own" ON public.journal_notebook_entries;
CREATE POLICY "journal_notebook_entries_select_own"
  ON public.journal_notebook_entries
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_notebook_entries_insert_own" ON public.journal_notebook_entries;
CREATE POLICY "journal_notebook_entries_insert_own"
  ON public.journal_notebook_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_notebook_entries_update_own" ON public.journal_notebook_entries;
CREATE POLICY "journal_notebook_entries_update_own"
  ON public.journal_notebook_entries
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_notebook_entries_delete_own" ON public.journal_notebook_entries;
CREATE POLICY "journal_notebook_entries_delete_own"
  ON public.journal_notebook_entries
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_sessions_select_own" ON public.journal_sessions;
CREATE POLICY "journal_sessions_select_own"
  ON public.journal_sessions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_sessions_insert_own" ON public.journal_sessions;
CREATE POLICY "journal_sessions_insert_own"
  ON public.journal_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_sessions_update_own" ON public.journal_sessions;
CREATE POLICY "journal_sessions_update_own"
  ON public.journal_sessions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_sessions_delete_own" ON public.journal_sessions;
CREATE POLICY "journal_sessions_delete_own"
  ON public.journal_sessions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_daily_reviews_select_own" ON public.journal_daily_reviews;
CREATE POLICY "journal_daily_reviews_select_own"
  ON public.journal_daily_reviews
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_daily_reviews_insert_own" ON public.journal_daily_reviews;
CREATE POLICY "journal_daily_reviews_insert_own"
  ON public.journal_daily_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_daily_reviews_update_own" ON public.journal_daily_reviews;
CREATE POLICY "journal_daily_reviews_update_own"
  ON public.journal_daily_reviews
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_daily_reviews_delete_own" ON public.journal_daily_reviews;
CREATE POLICY "journal_daily_reviews_delete_own"
  ON public.journal_daily_reviews
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_playbooks_select_own" ON public.journal_playbooks;
CREATE POLICY "journal_playbooks_select_own"
  ON public.journal_playbooks
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_playbooks_insert_own" ON public.journal_playbooks;
CREATE POLICY "journal_playbooks_insert_own"
  ON public.journal_playbooks
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_playbooks_update_own" ON public.journal_playbooks;
CREATE POLICY "journal_playbooks_update_own"
  ON public.journal_playbooks
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_playbooks_delete_own" ON public.journal_playbooks;
CREATE POLICY "journal_playbooks_delete_own"
  ON public.journal_playbooks
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_playbook_versions_select_own" ON public.journal_playbook_versions;
CREATE POLICY "journal_playbook_versions_select_own"
  ON public.journal_playbook_versions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_playbook_versions_insert_own" ON public.journal_playbook_versions;
CREATE POLICY "journal_playbook_versions_insert_own"
  ON public.journal_playbook_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_playbook_versions_update_own" ON public.journal_playbook_versions;
CREATE POLICY "journal_playbook_versions_update_own"
  ON public.journal_playbook_versions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_playbook_versions_delete_own" ON public.journal_playbook_versions;
CREATE POLICY "journal_playbook_versions_delete_own"
  ON public.journal_playbook_versions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_playbook_rules_select_own" ON public.journal_playbook_rules;
CREATE POLICY "journal_playbook_rules_select_own"
  ON public.journal_playbook_rules
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_playbook_rules_insert_own" ON public.journal_playbook_rules;
CREATE POLICY "journal_playbook_rules_insert_own"
  ON public.journal_playbook_rules
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_playbook_rules_update_own" ON public.journal_playbook_rules;
CREATE POLICY "journal_playbook_rules_update_own"
  ON public.journal_playbook_rules
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_playbook_rules_delete_own" ON public.journal_playbook_rules;
CREATE POLICY "journal_playbook_rules_delete_own"
  ON public.journal_playbook_rules
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_risk_violations_select_own" ON public.journal_risk_violations;
CREATE POLICY "journal_risk_violations_select_own"
  ON public.journal_risk_violations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_risk_violations_insert_own" ON public.journal_risk_violations;
CREATE POLICY "journal_risk_violations_insert_own"
  ON public.journal_risk_violations
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_risk_violations_update_own" ON public.journal_risk_violations;
CREATE POLICY "journal_risk_violations_update_own"
  ON public.journal_risk_violations
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_risk_violations_delete_own" ON public.journal_risk_violations;
CREATE POLICY "journal_risk_violations_delete_own"
  ON public.journal_risk_violations
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_process_scores_select_own" ON public.journal_process_scores;
CREATE POLICY "journal_process_scores_select_own"
  ON public.journal_process_scores
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_process_scores_insert_own" ON public.journal_process_scores;
CREATE POLICY "journal_process_scores_insert_own"
  ON public.journal_process_scores
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_process_scores_update_own" ON public.journal_process_scores;
CREATE POLICY "journal_process_scores_update_own"
  ON public.journal_process_scores
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_process_scores_delete_own" ON public.journal_process_scores;
CREATE POLICY "journal_process_scores_delete_own"
  ON public.journal_process_scores
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_saved_reports_select_own" ON public.journal_saved_reports;
CREATE POLICY "journal_saved_reports_select_own"
  ON public.journal_saved_reports
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_saved_reports_insert_own" ON public.journal_saved_reports;
CREATE POLICY "journal_saved_reports_insert_own"
  ON public.journal_saved_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_saved_reports_update_own" ON public.journal_saved_reports;
CREATE POLICY "journal_saved_reports_update_own"
  ON public.journal_saved_reports
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_saved_reports_delete_own" ON public.journal_saved_reports;
CREATE POLICY "journal_saved_reports_delete_own"
  ON public.journal_saved_reports
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_report_runs_select_own" ON public.journal_report_runs;
CREATE POLICY "journal_report_runs_select_own"
  ON public.journal_report_runs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_report_runs_insert_own" ON public.journal_report_runs;
CREATE POLICY "journal_report_runs_insert_own"
  ON public.journal_report_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_report_runs_update_own" ON public.journal_report_runs;
CREATE POLICY "journal_report_runs_update_own"
  ON public.journal_report_runs
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_report_runs_delete_own" ON public.journal_report_runs;
CREATE POLICY "journal_report_runs_delete_own"
  ON public.journal_report_runs
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_report_exports_select_own" ON public.journal_report_exports;
CREATE POLICY "journal_report_exports_select_own"
  ON public.journal_report_exports
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_report_exports_insert_own" ON public.journal_report_exports;
CREATE POLICY "journal_report_exports_insert_own"
  ON public.journal_report_exports
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_report_exports_update_own" ON public.journal_report_exports;
CREATE POLICY "journal_report_exports_update_own"
  ON public.journal_report_exports
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_report_exports_delete_own" ON public.journal_report_exports;
CREATE POLICY "journal_report_exports_delete_own"
  ON public.journal_report_exports
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_report_schedules_select_own" ON public.journal_report_schedules;
CREATE POLICY "journal_report_schedules_select_own"
  ON public.journal_report_schedules
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_report_schedules_insert_own" ON public.journal_report_schedules;
CREATE POLICY "journal_report_schedules_insert_own"
  ON public.journal_report_schedules
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_report_schedules_update_own" ON public.journal_report_schedules;
CREATE POLICY "journal_report_schedules_update_own"
  ON public.journal_report_schedules
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_report_schedules_delete_own" ON public.journal_report_schedules;
CREATE POLICY "journal_report_schedules_delete_own"
  ON public.journal_report_schedules
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_market_context_select_own" ON public.journal_market_context;
CREATE POLICY "journal_market_context_select_own"
  ON public.journal_market_context
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_market_context_insert_own" ON public.journal_market_context;
CREATE POLICY "journal_market_context_insert_own"
  ON public.journal_market_context
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_market_context_update_own" ON public.journal_market_context;
CREATE POLICY "journal_market_context_update_own"
  ON public.journal_market_context
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_market_context_delete_own" ON public.journal_market_context;
CREATE POLICY "journal_market_context_delete_own"
  ON public.journal_market_context
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_price_observations_select_own" ON public.journal_price_observations;
CREATE POLICY "journal_price_observations_select_own"
  ON public.journal_price_observations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_price_observations_insert_own" ON public.journal_price_observations;
CREATE POLICY "journal_price_observations_insert_own"
  ON public.journal_price_observations
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_price_observations_update_own" ON public.journal_price_observations;
CREATE POLICY "journal_price_observations_update_own"
  ON public.journal_price_observations
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_price_observations_delete_own" ON public.journal_price_observations;
CREATE POLICY "journal_price_observations_delete_own"
  ON public.journal_price_observations
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_valuation_snapshots_select_own" ON public.journal_valuation_snapshots;
CREATE POLICY "journal_valuation_snapshots_select_own"
  ON public.journal_valuation_snapshots
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_valuation_snapshots_insert_own" ON public.journal_valuation_snapshots;
CREATE POLICY "journal_valuation_snapshots_insert_own"
  ON public.journal_valuation_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_valuation_snapshots_update_own" ON public.journal_valuation_snapshots;
CREATE POLICY "journal_valuation_snapshots_update_own"
  ON public.journal_valuation_snapshots
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_valuation_snapshots_delete_own" ON public.journal_valuation_snapshots;
CREATE POLICY "journal_valuation_snapshots_delete_own"
  ON public.journal_valuation_snapshots
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_calculation_runs_select_own" ON public.journal_calculation_runs;
CREATE POLICY "journal_calculation_runs_select_own"
  ON public.journal_calculation_runs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_calculation_runs_insert_own" ON public.journal_calculation_runs;
CREATE POLICY "journal_calculation_runs_insert_own"
  ON public.journal_calculation_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_calculation_runs_update_own" ON public.journal_calculation_runs;
CREATE POLICY "journal_calculation_runs_update_own"
  ON public.journal_calculation_runs
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_calculation_runs_delete_own" ON public.journal_calculation_runs;
CREATE POLICY "journal_calculation_runs_delete_own"
  ON public.journal_calculation_runs
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trade_sequence_metrics_select_own" ON public.journal_trade_sequence_metrics;
CREATE POLICY "journal_trade_sequence_metrics_select_own"
  ON public.journal_trade_sequence_metrics
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trade_sequence_metrics_insert_own" ON public.journal_trade_sequence_metrics;
CREATE POLICY "journal_trade_sequence_metrics_insert_own"
  ON public.journal_trade_sequence_metrics
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trade_sequence_metrics_update_own" ON public.journal_trade_sequence_metrics;
CREATE POLICY "journal_trade_sequence_metrics_update_own"
  ON public.journal_trade_sequence_metrics
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_trade_sequence_metrics_delete_own" ON public.journal_trade_sequence_metrics;
CREATE POLICY "journal_trade_sequence_metrics_delete_own"
  ON public.journal_trade_sequence_metrics
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_data_quality_issues_select_own" ON public.journal_data_quality_issues;
CREATE POLICY "journal_data_quality_issues_select_own"
  ON public.journal_data_quality_issues
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_data_quality_issues_insert_own" ON public.journal_data_quality_issues;
CREATE POLICY "journal_data_quality_issues_insert_own"
  ON public.journal_data_quality_issues
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_data_quality_issues_update_own" ON public.journal_data_quality_issues;
CREATE POLICY "journal_data_quality_issues_update_own"
  ON public.journal_data_quality_issues
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_data_quality_issues_delete_own" ON public.journal_data_quality_issues;
CREATE POLICY "journal_data_quality_issues_delete_own"
  ON public.journal_data_quality_issues
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_daily_metrics_select_own" ON public.journal_daily_metrics;
CREATE POLICY "journal_daily_metrics_select_own"
  ON public.journal_daily_metrics
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_daily_metrics_insert_own" ON public.journal_daily_metrics;
CREATE POLICY "journal_daily_metrics_insert_own"
  ON public.journal_daily_metrics
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_daily_metrics_update_own" ON public.journal_daily_metrics;
CREATE POLICY "journal_daily_metrics_update_own"
  ON public.journal_daily_metrics
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_daily_metrics_delete_own" ON public.journal_daily_metrics;
CREATE POLICY "journal_daily_metrics_delete_own"
  ON public.journal_daily_metrics
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_analytics_cache_select_own" ON public.journal_analytics_cache;
CREATE POLICY "journal_analytics_cache_select_own"
  ON public.journal_analytics_cache
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_analytics_cache_insert_own" ON public.journal_analytics_cache;
CREATE POLICY "journal_analytics_cache_insert_own"
  ON public.journal_analytics_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_analytics_cache_update_own" ON public.journal_analytics_cache;
CREATE POLICY "journal_analytics_cache_update_own"
  ON public.journal_analytics_cache
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_analytics_cache_delete_own" ON public.journal_analytics_cache;
CREATE POLICY "journal_analytics_cache_delete_own"
  ON public.journal_analytics_cache
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_performance_insights_select_own" ON public.journal_performance_insights;
CREATE POLICY "journal_performance_insights_select_own"
  ON public.journal_performance_insights
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_performance_insights_insert_own" ON public.journal_performance_insights;
CREATE POLICY "journal_performance_insights_insert_own"
  ON public.journal_performance_insights
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_performance_insights_update_own" ON public.journal_performance_insights;
CREATE POLICY "journal_performance_insights_update_own"
  ON public.journal_performance_insights
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_performance_insights_delete_own" ON public.journal_performance_insights;
CREATE POLICY "journal_performance_insights_delete_own"
  ON public.journal_performance_insights
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_ai_memories_select_own" ON public.journal_ai_memories;
CREATE POLICY "journal_ai_memories_select_own"
  ON public.journal_ai_memories
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_ai_memories_insert_own" ON public.journal_ai_memories;
CREATE POLICY "journal_ai_memories_insert_own"
  ON public.journal_ai_memories
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_ai_memories_update_own" ON public.journal_ai_memories;
CREATE POLICY "journal_ai_memories_update_own"
  ON public.journal_ai_memories
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_ai_memories_delete_own" ON public.journal_ai_memories;
CREATE POLICY "journal_ai_memories_delete_own"
  ON public.journal_ai_memories
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_ai_insights_select_own" ON public.journal_ai_insights;
CREATE POLICY "journal_ai_insights_select_own"
  ON public.journal_ai_insights
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_ai_insights_insert_own" ON public.journal_ai_insights;
CREATE POLICY "journal_ai_insights_insert_own"
  ON public.journal_ai_insights
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_ai_insights_update_own" ON public.journal_ai_insights;
CREATE POLICY "journal_ai_insights_update_own"
  ON public.journal_ai_insights
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_ai_insights_delete_own" ON public.journal_ai_insights;
CREATE POLICY "journal_ai_insights_delete_own"
  ON public.journal_ai_insights
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_ai_conversations_select_own" ON public.journal_ai_conversations;
CREATE POLICY "journal_ai_conversations_select_own"
  ON public.journal_ai_conversations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_ai_conversations_insert_own" ON public.journal_ai_conversations;
CREATE POLICY "journal_ai_conversations_insert_own"
  ON public.journal_ai_conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_ai_conversations_update_own" ON public.journal_ai_conversations;
CREATE POLICY "journal_ai_conversations_update_own"
  ON public.journal_ai_conversations
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_ai_conversations_delete_own" ON public.journal_ai_conversations;
CREATE POLICY "journal_ai_conversations_delete_own"
  ON public.journal_ai_conversations
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_ai_feedback_select_own" ON public.journal_ai_feedback;
CREATE POLICY "journal_ai_feedback_select_own"
  ON public.journal_ai_feedback
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_ai_feedback_insert_own" ON public.journal_ai_feedback;
CREATE POLICY "journal_ai_feedback_insert_own"
  ON public.journal_ai_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_ai_feedback_update_own" ON public.journal_ai_feedback;
CREATE POLICY "journal_ai_feedback_update_own"
  ON public.journal_ai_feedback
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_ai_feedback_delete_own" ON public.journal_ai_feedback;
CREATE POLICY "journal_ai_feedback_delete_own"
  ON public.journal_ai_feedback
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_ai_jobs_select_own" ON public.journal_ai_jobs;
CREATE POLICY "journal_ai_jobs_select_own"
  ON public.journal_ai_jobs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_ai_jobs_insert_own" ON public.journal_ai_jobs;
CREATE POLICY "journal_ai_jobs_insert_own"
  ON public.journal_ai_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_ai_jobs_update_own" ON public.journal_ai_jobs;
CREATE POLICY "journal_ai_jobs_update_own"
  ON public.journal_ai_jobs
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_ai_jobs_delete_own" ON public.journal_ai_jobs;
CREATE POLICY "journal_ai_jobs_delete_own"
  ON public.journal_ai_jobs
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_ai_usage_select_own" ON public.journal_ai_usage;
CREATE POLICY "journal_ai_usage_select_own"
  ON public.journal_ai_usage
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_ai_usage_insert_own" ON public.journal_ai_usage;
CREATE POLICY "journal_ai_usage_insert_own"
  ON public.journal_ai_usage
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_ai_usage_update_own" ON public.journal_ai_usage;
CREATE POLICY "journal_ai_usage_update_own"
  ON public.journal_ai_usage
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_ai_usage_delete_own" ON public.journal_ai_usage;
CREATE POLICY "journal_ai_usage_delete_own"
  ON public.journal_ai_usage
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_import_jobs_select_own" ON public.journal_import_jobs;
CREATE POLICY "journal_import_jobs_select_own"
  ON public.journal_import_jobs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_import_jobs_insert_own" ON public.journal_import_jobs;
CREATE POLICY "journal_import_jobs_insert_own"
  ON public.journal_import_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_import_jobs_update_own" ON public.journal_import_jobs;
CREATE POLICY "journal_import_jobs_update_own"
  ON public.journal_import_jobs
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_import_jobs_delete_own" ON public.journal_import_jobs;
CREATE POLICY "journal_import_jobs_delete_own"
  ON public.journal_import_jobs
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_import_mappings_select_own" ON public.journal_import_mappings;
CREATE POLICY "journal_import_mappings_select_own"
  ON public.journal_import_mappings
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_import_mappings_insert_own" ON public.journal_import_mappings;
CREATE POLICY "journal_import_mappings_insert_own"
  ON public.journal_import_mappings
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_import_mappings_update_own" ON public.journal_import_mappings;
CREATE POLICY "journal_import_mappings_update_own"
  ON public.journal_import_mappings
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_import_mappings_delete_own" ON public.journal_import_mappings;
CREATE POLICY "journal_import_mappings_delete_own"
  ON public.journal_import_mappings
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_integrations_select_own" ON public.journal_integrations;
CREATE POLICY "journal_integrations_select_own"
  ON public.journal_integrations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_integrations_insert_own" ON public.journal_integrations;
CREATE POLICY "journal_integrations_insert_own"
  ON public.journal_integrations
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_integrations_update_own" ON public.journal_integrations;
CREATE POLICY "journal_integrations_update_own"
  ON public.journal_integrations
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_integrations_delete_own" ON public.journal_integrations;
CREATE POLICY "journal_integrations_delete_own"
  ON public.journal_integrations
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_webhook_endpoints_select_own" ON public.journal_webhook_endpoints;
CREATE POLICY "journal_webhook_endpoints_select_own"
  ON public.journal_webhook_endpoints
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_webhook_endpoints_insert_own" ON public.journal_webhook_endpoints;
CREATE POLICY "journal_webhook_endpoints_insert_own"
  ON public.journal_webhook_endpoints
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_webhook_endpoints_update_own" ON public.journal_webhook_endpoints;
CREATE POLICY "journal_webhook_endpoints_update_own"
  ON public.journal_webhook_endpoints
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_webhook_endpoints_delete_own" ON public.journal_webhook_endpoints;
CREATE POLICY "journal_webhook_endpoints_delete_own"
  ON public.journal_webhook_endpoints
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_domain_events_select_own" ON public.journal_domain_events;
CREATE POLICY "journal_domain_events_select_own"
  ON public.journal_domain_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_domain_events_insert_own" ON public.journal_domain_events;
CREATE POLICY "journal_domain_events_insert_own"
  ON public.journal_domain_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_domain_events_update_own" ON public.journal_domain_events;
CREATE POLICY "journal_domain_events_update_own"
  ON public.journal_domain_events
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_domain_events_delete_own" ON public.journal_domain_events;
CREATE POLICY "journal_domain_events_delete_own"
  ON public.journal_domain_events
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_event_outbox_select_own" ON public.journal_event_outbox;
CREATE POLICY "journal_event_outbox_select_own"
  ON public.journal_event_outbox
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_event_outbox_insert_own" ON public.journal_event_outbox;
CREATE POLICY "journal_event_outbox_insert_own"
  ON public.journal_event_outbox
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_event_outbox_update_own" ON public.journal_event_outbox;
CREATE POLICY "journal_event_outbox_update_own"
  ON public.journal_event_outbox
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_event_outbox_delete_own" ON public.journal_event_outbox;
CREATE POLICY "journal_event_outbox_delete_own"
  ON public.journal_event_outbox
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_audit_log_select_own" ON public.journal_audit_log;
CREATE POLICY "journal_audit_log_select_own"
  ON public.journal_audit_log
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_audit_log_insert_own" ON public.journal_audit_log;
CREATE POLICY "journal_audit_log_insert_own"
  ON public.journal_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_audit_log_update_own" ON public.journal_audit_log;
CREATE POLICY "journal_audit_log_update_own"
  ON public.journal_audit_log
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_audit_log_delete_own" ON public.journal_audit_log;
CREATE POLICY "journal_audit_log_delete_own"
  ON public.journal_audit_log
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Catalog rows may be system-wide (user_id IS NULL) or user-owned.

DROP POLICY IF EXISTS "journal_metric_definitions_select_own" ON public.journal_metric_definitions;
CREATE POLICY "journal_metric_definitions_select_own"
  ON public.journal_metric_definitions
  FOR SELECT
  TO authenticated
  USING ((user_id IS NULL OR user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_metric_definitions_insert_own" ON public.journal_metric_definitions;
CREATE POLICY "journal_metric_definitions_insert_own"
  ON public.journal_metric_definitions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_metric_definitions_update_own" ON public.journal_metric_definitions;
CREATE POLICY "journal_metric_definitions_update_own"
  ON public.journal_metric_definitions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_metric_definitions_delete_own" ON public.journal_metric_definitions;
CREATE POLICY "journal_metric_definitions_delete_own"
  ON public.journal_metric_definitions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_report_templates_select_own" ON public.journal_report_templates;
CREATE POLICY "journal_report_templates_select_own"
  ON public.journal_report_templates
  FOR SELECT
  TO authenticated
  USING ((user_id IS NULL OR user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_report_templates_insert_own" ON public.journal_report_templates;
CREATE POLICY "journal_report_templates_insert_own"
  ON public.journal_report_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_report_templates_update_own" ON public.journal_report_templates;
CREATE POLICY "journal_report_templates_update_own"
  ON public.journal_report_templates
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_report_templates_delete_own" ON public.journal_report_templates;
CREATE POLICY "journal_report_templates_delete_own"
  ON public.journal_report_templates
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Child tables: parent.user_id = auth.uid()

DROP POLICY IF EXISTS "journal_trade_legs_select_own" ON public.journal_trade_legs;
CREATE POLICY "journal_trade_legs_select_own"
  ON public.journal_trade_legs
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_trade_legs.trade_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_trade_legs_insert_own" ON public.journal_trade_legs;
CREATE POLICY "journal_trade_legs_insert_own"
  ON public.journal_trade_legs
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_trade_legs.trade_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_trade_legs_update_own" ON public.journal_trade_legs;
CREATE POLICY "journal_trade_legs_update_own"
  ON public.journal_trade_legs
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_trade_legs.trade_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_trade_legs.trade_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_trade_legs_delete_own" ON public.journal_trade_legs;
CREATE POLICY "journal_trade_legs_delete_own"
  ON public.journal_trade_legs
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_trade_legs.trade_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_executions_select_own" ON public.journal_executions;
CREATE POLICY "journal_executions_select_own"
  ON public.journal_executions
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_executions.trade_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_executions_insert_own" ON public.journal_executions;
CREATE POLICY "journal_executions_insert_own"
  ON public.journal_executions
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_executions.trade_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_executions_update_own" ON public.journal_executions;
CREATE POLICY "journal_executions_update_own"
  ON public.journal_executions
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_executions.trade_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_executions.trade_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_executions_delete_own" ON public.journal_executions;
CREATE POLICY "journal_executions_delete_own"
  ON public.journal_executions
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_executions.trade_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_execution_fees_select_own" ON public.journal_execution_fees;
CREATE POLICY "journal_execution_fees_select_own"
  ON public.journal_execution_fees
  FOR SELECT
  TO authenticated
  USING (EXISTS (
      SELECT 1 FROM public.journal_executions e
      JOIN public.journal_trades p ON p.id = e.trade_id
      WHERE e.id = journal_execution_fees.execution_id AND p.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "journal_execution_fees_insert_own" ON public.journal_execution_fees;
CREATE POLICY "journal_execution_fees_insert_own"
  ON public.journal_execution_fees
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
      SELECT 1 FROM public.journal_executions e
      JOIN public.journal_trades p ON p.id = e.trade_id
      WHERE e.id = journal_execution_fees.execution_id AND p.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "journal_execution_fees_update_own" ON public.journal_execution_fees;
CREATE POLICY "journal_execution_fees_update_own"
  ON public.journal_execution_fees
  FOR UPDATE
  TO authenticated
  USING (EXISTS (
      SELECT 1 FROM public.journal_executions e
      JOIN public.journal_trades p ON p.id = e.trade_id
      WHERE e.id = journal_execution_fees.execution_id AND p.user_id = auth.uid()
    ))
  WITH CHECK (EXISTS (
      SELECT 1 FROM public.journal_executions e
      JOIN public.journal_trades p ON p.id = e.trade_id
      WHERE e.id = journal_execution_fees.execution_id AND p.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "journal_execution_fees_delete_own" ON public.journal_execution_fees;
CREATE POLICY "journal_execution_fees_delete_own"
  ON public.journal_execution_fees
  FOR DELETE
  TO authenticated
  USING (EXISTS (
      SELECT 1 FROM public.journal_executions e
      JOIN public.journal_trades p ON p.id = e.trade_id
      WHERE e.id = journal_execution_fees.execution_id AND p.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "journal_trade_cash_flows_select_own" ON public.journal_trade_cash_flows;
CREATE POLICY "journal_trade_cash_flows_select_own"
  ON public.journal_trade_cash_flows
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_trade_cash_flows.trade_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_trade_cash_flows_insert_own" ON public.journal_trade_cash_flows;
CREATE POLICY "journal_trade_cash_flows_insert_own"
  ON public.journal_trade_cash_flows
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_trade_cash_flows.trade_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_trade_cash_flows_update_own" ON public.journal_trade_cash_flows;
CREATE POLICY "journal_trade_cash_flows_update_own"
  ON public.journal_trade_cash_flows
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_trade_cash_flows.trade_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_trade_cash_flows.trade_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_trade_cash_flows_delete_own" ON public.journal_trade_cash_flows;
CREATE POLICY "journal_trade_cash_flows_delete_own"
  ON public.journal_trade_cash_flows
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_trade_cash_flows.trade_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_tag_assignments_select_own" ON public.journal_tag_assignments;
CREATE POLICY "journal_tag_assignments_select_own"
  ON public.journal_tag_assignments
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_tag_assignments.trade_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_tag_assignments_insert_own" ON public.journal_tag_assignments;
CREATE POLICY "journal_tag_assignments_insert_own"
  ON public.journal_tag_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_tag_assignments.trade_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_tag_assignments_update_own" ON public.journal_tag_assignments;
CREATE POLICY "journal_tag_assignments_update_own"
  ON public.journal_tag_assignments
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_tag_assignments.trade_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_tag_assignments.trade_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_tag_assignments_delete_own" ON public.journal_tag_assignments;
CREATE POLICY "journal_tag_assignments_delete_own"
  ON public.journal_tag_assignments
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_tag_assignments.trade_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_notebook_links_select_own" ON public.journal_notebook_links;
CREATE POLICY "journal_notebook_links_select_own"
  ON public.journal_notebook_links
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_notebook_entries p WHERE p.id = journal_notebook_links.entry_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_notebook_links_insert_own" ON public.journal_notebook_links;
CREATE POLICY "journal_notebook_links_insert_own"
  ON public.journal_notebook_links
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_notebook_entries p WHERE p.id = journal_notebook_links.entry_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_notebook_links_update_own" ON public.journal_notebook_links;
CREATE POLICY "journal_notebook_links_update_own"
  ON public.journal_notebook_links
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_notebook_entries p WHERE p.id = journal_notebook_links.entry_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_notebook_entries p WHERE p.id = journal_notebook_links.entry_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_notebook_links_delete_own" ON public.journal_notebook_links;
CREATE POLICY "journal_notebook_links_delete_own"
  ON public.journal_notebook_links
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_notebook_entries p WHERE p.id = journal_notebook_links.entry_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_playbook_check_results_select_own" ON public.journal_playbook_check_results;
CREATE POLICY "journal_playbook_check_results_select_own"
  ON public.journal_playbook_check_results
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_playbook_check_results.trade_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_playbook_check_results_insert_own" ON public.journal_playbook_check_results;
CREATE POLICY "journal_playbook_check_results_insert_own"
  ON public.journal_playbook_check_results
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_playbook_check_results.trade_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_playbook_check_results_update_own" ON public.journal_playbook_check_results;
CREATE POLICY "journal_playbook_check_results_update_own"
  ON public.journal_playbook_check_results
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_playbook_check_results.trade_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_playbook_check_results.trade_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_playbook_check_results_delete_own" ON public.journal_playbook_check_results;
CREATE POLICY "journal_playbook_check_results_delete_own"
  ON public.journal_playbook_check_results
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_playbook_check_results.trade_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_process_score_components_select_own" ON public.journal_process_score_components;
CREATE POLICY "journal_process_score_components_select_own"
  ON public.journal_process_score_components
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_process_scores p WHERE p.id = journal_process_score_components.process_score_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_process_score_components_insert_own" ON public.journal_process_score_components;
CREATE POLICY "journal_process_score_components_insert_own"
  ON public.journal_process_score_components
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_process_scores p WHERE p.id = journal_process_score_components.process_score_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_process_score_components_update_own" ON public.journal_process_score_components;
CREATE POLICY "journal_process_score_components_update_own"
  ON public.journal_process_score_components
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_process_scores p WHERE p.id = journal_process_score_components.process_score_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_process_scores p WHERE p.id = journal_process_score_components.process_score_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_process_score_components_delete_own" ON public.journal_process_score_components;
CREATE POLICY "journal_process_score_components_delete_own"
  ON public.journal_process_score_components
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_process_scores p WHERE p.id = journal_process_score_components.process_score_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_metric_formula_versions_select_own" ON public.journal_metric_formula_versions;
CREATE POLICY "journal_metric_formula_versions_select_own"
  ON public.journal_metric_formula_versions
  FOR SELECT
  TO authenticated
  USING (EXISTS (
      SELECT 1 FROM public.journal_metric_definitions p
      WHERE p.id = journal_metric_formula_versions.metric_definition_id
        AND (p.user_id IS NULL OR p.user_id = auth.uid())
    ));

DROP POLICY IF EXISTS "journal_metric_formula_versions_insert_own" ON public.journal_metric_formula_versions;
CREATE POLICY "journal_metric_formula_versions_insert_own"
  ON public.journal_metric_formula_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
      SELECT 1 FROM public.journal_metric_definitions p
      WHERE p.id = journal_metric_formula_versions.metric_definition_id
        AND p.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "journal_metric_formula_versions_update_own" ON public.journal_metric_formula_versions;
CREATE POLICY "journal_metric_formula_versions_update_own"
  ON public.journal_metric_formula_versions
  FOR UPDATE
  TO authenticated
  USING (EXISTS (
      SELECT 1 FROM public.journal_metric_definitions p
      WHERE p.id = journal_metric_formula_versions.metric_definition_id
        AND p.user_id = auth.uid()
    ))
  WITH CHECK (EXISTS (
      SELECT 1 FROM public.journal_metric_definitions p
      WHERE p.id = journal_metric_formula_versions.metric_definition_id
        AND p.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "journal_metric_formula_versions_delete_own" ON public.journal_metric_formula_versions;
CREATE POLICY "journal_metric_formula_versions_delete_own"
  ON public.journal_metric_formula_versions
  FOR DELETE
  TO authenticated
  USING (EXISTS (
      SELECT 1 FROM public.journal_metric_definitions p
      WHERE p.id = journal_metric_formula_versions.metric_definition_id
        AND p.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "journal_report_run_rows_select_own" ON public.journal_report_run_rows;
CREATE POLICY "journal_report_run_rows_select_own"
  ON public.journal_report_run_rows
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_report_runs p WHERE p.id = journal_report_run_rows.report_run_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_report_run_rows_insert_own" ON public.journal_report_run_rows;
CREATE POLICY "journal_report_run_rows_insert_own"
  ON public.journal_report_run_rows
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_report_runs p WHERE p.id = journal_report_run_rows.report_run_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_report_run_rows_update_own" ON public.journal_report_run_rows;
CREATE POLICY "journal_report_run_rows_update_own"
  ON public.journal_report_run_rows
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_report_runs p WHERE p.id = journal_report_run_rows.report_run_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_report_runs p WHERE p.id = journal_report_run_rows.report_run_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_report_run_rows_delete_own" ON public.journal_report_run_rows;
CREATE POLICY "journal_report_run_rows_delete_own"
  ON public.journal_report_run_rows
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_report_runs p WHERE p.id = journal_report_run_rows.report_run_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_market_context_sources_select_own" ON public.journal_market_context_sources;
CREATE POLICY "journal_market_context_sources_select_own"
  ON public.journal_market_context_sources
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_market_context p WHERE p.id = journal_market_context_sources.market_context_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_market_context_sources_insert_own" ON public.journal_market_context_sources;
CREATE POLICY "journal_market_context_sources_insert_own"
  ON public.journal_market_context_sources
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_market_context p WHERE p.id = journal_market_context_sources.market_context_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_market_context_sources_update_own" ON public.journal_market_context_sources;
CREATE POLICY "journal_market_context_sources_update_own"
  ON public.journal_market_context_sources
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_market_context p WHERE p.id = journal_market_context_sources.market_context_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_market_context p WHERE p.id = journal_market_context_sources.market_context_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_market_context_sources_delete_own" ON public.journal_market_context_sources;
CREATE POLICY "journal_market_context_sources_delete_own"
  ON public.journal_market_context_sources
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_market_context p WHERE p.id = journal_market_context_sources.market_context_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_calculation_lineage_select_own" ON public.journal_calculation_lineage;
CREATE POLICY "journal_calculation_lineage_select_own"
  ON public.journal_calculation_lineage
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_calculation_runs p WHERE p.id = journal_calculation_lineage.calculation_run_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_calculation_lineage_insert_own" ON public.journal_calculation_lineage;
CREATE POLICY "journal_calculation_lineage_insert_own"
  ON public.journal_calculation_lineage
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_calculation_runs p WHERE p.id = journal_calculation_lineage.calculation_run_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_calculation_lineage_update_own" ON public.journal_calculation_lineage;
CREATE POLICY "journal_calculation_lineage_update_own"
  ON public.journal_calculation_lineage
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_calculation_runs p WHERE p.id = journal_calculation_lineage.calculation_run_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_calculation_runs p WHERE p.id = journal_calculation_lineage.calculation_run_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_calculation_lineage_delete_own" ON public.journal_calculation_lineage;
CREATE POLICY "journal_calculation_lineage_delete_own"
  ON public.journal_calculation_lineage
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_calculation_runs p WHERE p.id = journal_calculation_lineage.calculation_run_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_ai_memory_evidence_select_own" ON public.journal_ai_memory_evidence;
CREATE POLICY "journal_ai_memory_evidence_select_own"
  ON public.journal_ai_memory_evidence
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_ai_memories p WHERE p.id = journal_ai_memory_evidence.memory_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_ai_memory_evidence_insert_own" ON public.journal_ai_memory_evidence;
CREATE POLICY "journal_ai_memory_evidence_insert_own"
  ON public.journal_ai_memory_evidence
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_ai_memories p WHERE p.id = journal_ai_memory_evidence.memory_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_ai_memory_evidence_update_own" ON public.journal_ai_memory_evidence;
CREATE POLICY "journal_ai_memory_evidence_update_own"
  ON public.journal_ai_memory_evidence
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_ai_memories p WHERE p.id = journal_ai_memory_evidence.memory_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_ai_memories p WHERE p.id = journal_ai_memory_evidence.memory_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_ai_memory_evidence_delete_own" ON public.journal_ai_memory_evidence;
CREATE POLICY "journal_ai_memory_evidence_delete_own"
  ON public.journal_ai_memory_evidence
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_ai_memories p WHERE p.id = journal_ai_memory_evidence.memory_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_ai_messages_select_own" ON public.journal_ai_messages;
CREATE POLICY "journal_ai_messages_select_own"
  ON public.journal_ai_messages
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_ai_conversations p WHERE p.id = journal_ai_messages.conversation_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_ai_messages_insert_own" ON public.journal_ai_messages;
CREATE POLICY "journal_ai_messages_insert_own"
  ON public.journal_ai_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_ai_conversations p WHERE p.id = journal_ai_messages.conversation_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_ai_messages_update_own" ON public.journal_ai_messages;
CREATE POLICY "journal_ai_messages_update_own"
  ON public.journal_ai_messages
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_ai_conversations p WHERE p.id = journal_ai_messages.conversation_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_ai_conversations p WHERE p.id = journal_ai_messages.conversation_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_ai_messages_delete_own" ON public.journal_ai_messages;
CREATE POLICY "journal_ai_messages_delete_own"
  ON public.journal_ai_messages
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_ai_conversations p WHERE p.id = journal_ai_messages.conversation_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_import_rows_select_own" ON public.journal_import_rows;
CREATE POLICY "journal_import_rows_select_own"
  ON public.journal_import_rows
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_import_jobs p WHERE p.id = journal_import_rows.import_job_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_import_rows_insert_own" ON public.journal_import_rows;
CREATE POLICY "journal_import_rows_insert_own"
  ON public.journal_import_rows
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_import_jobs p WHERE p.id = journal_import_rows.import_job_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_import_rows_update_own" ON public.journal_import_rows;
CREATE POLICY "journal_import_rows_update_own"
  ON public.journal_import_rows
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_import_jobs p WHERE p.id = journal_import_rows.import_job_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_import_jobs p WHERE p.id = journal_import_rows.import_job_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_import_rows_delete_own" ON public.journal_import_rows;
CREATE POLICY "journal_import_rows_delete_own"
  ON public.journal_import_rows
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_import_jobs p WHERE p.id = journal_import_rows.import_job_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_provider_accounts_select_own" ON public.journal_provider_accounts;
CREATE POLICY "journal_provider_accounts_select_own"
  ON public.journal_provider_accounts
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_integrations p WHERE p.id = journal_provider_accounts.integration_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_provider_accounts_insert_own" ON public.journal_provider_accounts;
CREATE POLICY "journal_provider_accounts_insert_own"
  ON public.journal_provider_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_integrations p WHERE p.id = journal_provider_accounts.integration_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_provider_accounts_update_own" ON public.journal_provider_accounts;
CREATE POLICY "journal_provider_accounts_update_own"
  ON public.journal_provider_accounts
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_integrations p WHERE p.id = journal_provider_accounts.integration_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_integrations p WHERE p.id = journal_provider_accounts.integration_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_provider_accounts_delete_own" ON public.journal_provider_accounts;
CREATE POLICY "journal_provider_accounts_delete_own"
  ON public.journal_provider_accounts
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_integrations p WHERE p.id = journal_provider_accounts.integration_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_sync_cursors_select_own" ON public.journal_sync_cursors;
CREATE POLICY "journal_sync_cursors_select_own"
  ON public.journal_sync_cursors
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_integrations p WHERE p.id = journal_sync_cursors.integration_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_sync_cursors_insert_own" ON public.journal_sync_cursors;
CREATE POLICY "journal_sync_cursors_insert_own"
  ON public.journal_sync_cursors
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_integrations p WHERE p.id = journal_sync_cursors.integration_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_sync_cursors_update_own" ON public.journal_sync_cursors;
CREATE POLICY "journal_sync_cursors_update_own"
  ON public.journal_sync_cursors
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_integrations p WHERE p.id = journal_sync_cursors.integration_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_integrations p WHERE p.id = journal_sync_cursors.integration_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_sync_cursors_delete_own" ON public.journal_sync_cursors;
CREATE POLICY "journal_sync_cursors_delete_own"
  ON public.journal_sync_cursors
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_integrations p WHERE p.id = journal_sync_cursors.integration_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_webhook_deliveries_select_own" ON public.journal_webhook_deliveries;
CREATE POLICY "journal_webhook_deliveries_select_own"
  ON public.journal_webhook_deliveries
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_webhook_endpoints p WHERE p.id = journal_webhook_deliveries.endpoint_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_webhook_deliveries_insert_own" ON public.journal_webhook_deliveries;
CREATE POLICY "journal_webhook_deliveries_insert_own"
  ON public.journal_webhook_deliveries
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_webhook_endpoints p WHERE p.id = journal_webhook_deliveries.endpoint_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_webhook_deliveries_update_own" ON public.journal_webhook_deliveries;
CREATE POLICY "journal_webhook_deliveries_update_own"
  ON public.journal_webhook_deliveries
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_webhook_endpoints p WHERE p.id = journal_webhook_deliveries.endpoint_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_webhook_endpoints p WHERE p.id = journal_webhook_deliveries.endpoint_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "journal_webhook_deliveries_delete_own" ON public.journal_webhook_deliveries;
CREATE POLICY "journal_webhook_deliveries_delete_own"
  ON public.journal_webhook_deliveries
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_webhook_endpoints p WHERE p.id = journal_webhook_deliveries.endpoint_id AND p.user_id = auth.uid()));

-- Dead letters: users read/write own rows; service_role processes the queue.
ALTER TABLE public.journal_dead_letters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.journal_dead_letters FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_dead_letters TO authenticated;
GRANT ALL ON TABLE public.journal_dead_letters TO service_role;

DROP POLICY IF EXISTS "journal_dead_letters_select_own" ON public.journal_dead_letters;
CREATE POLICY "journal_dead_letters_select_own"
  ON public.journal_dead_letters
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_dead_letters_insert_own" ON public.journal_dead_letters;
CREATE POLICY "journal_dead_letters_insert_own"
  ON public.journal_dead_letters
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_dead_letters_update_own" ON public.journal_dead_letters;
CREATE POLICY "journal_dead_letters_update_own"
  ON public.journal_dead_letters
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journal_dead_letters_delete_own" ON public.journal_dead_letters;
CREATE POLICY "journal_dead_letters_delete_own"
  ON public.journal_dead_letters
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Service-role processing for outbox / audit / dead letters

DROP POLICY IF EXISTS "journal_event_outbox_service_role_all" ON public.journal_event_outbox;
CREATE POLICY "journal_event_outbox_service_role_all"
  ON public.journal_event_outbox
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "journal_dead_letters_service_role_all" ON public.journal_dead_letters;
CREATE POLICY "journal_dead_letters_service_role_all"
  ON public.journal_dead_letters
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "journal_audit_log_service_role_all" ON public.journal_audit_log;
CREATE POLICY "journal_audit_log_service_role_all"
  ON public.journal_audit_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- journal-private must be created separately through Lovable's supported
-- storage tooling. The bucket must be private. This migration defines the
-- storage.objects policies but intentionally does not create the bucket.
-- Object paths: {user_id}/imports/, {user_id}/attachments/, {user_id}/exports/

DROP POLICY IF EXISTS "journal_private_select_own" ON storage.objects;
CREATE POLICY "journal_private_select_own"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'journal-private'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] IN ('imports', 'attachments', 'exports')
  );

DROP POLICY IF EXISTS "journal_private_insert_own" ON storage.objects;
CREATE POLICY "journal_private_insert_own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'journal-private'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] IN ('imports', 'attachments', 'exports')
  );

DROP POLICY IF EXISTS "journal_private_update_own" ON storage.objects;
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
  );

DROP POLICY IF EXISTS "journal_private_delete_own" ON storage.objects;
CREATE POLICY "journal_private_delete_own"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'journal-private'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] IN ('imports', 'attachments', 'exports')
  );

