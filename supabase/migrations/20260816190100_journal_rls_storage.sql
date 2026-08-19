-- Stocksist Trading Journal RLS + private storage.
-- Fail-closed under an unproven runner that may autocommit each top-level
-- statement. Each managed table (and the four journal-private storage
-- policies) is replaced inside one PostgreSQL-atomic DO block. A CREATE
-- POLICY failure rolls back every DROP POLICY in that same block.
-- No wildcard journal_% policy deletion. No storage.buckets writes.

-- ---------------------------------------------------------------------------
-- Pre-mutation policy allowlist. Unexpected policies abort before any drop.
-- Allowed: no policy on a new fail-closed table; a known legacy policy;
-- or an already-installed final target policy on rerun.
-- ---------------------------------------------------------------------------

DO $journal_pre$
DECLARE
  r record;
  v_managed constant text[] := ARRAY[
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
    'journal_trade_plans',
    'journal_trade_reviews',
    'journal_trade_context',
    'journal_trade_relationships',
    'journal_trade_markers',
    'journal_attachments',
    'journal_tags',
    'journal_notebooks',
    'journal_notebook_entries',
    'journal_sessions',
    'journal_daily_reviews',
    'journal_playbooks',
    'journal_playbook_versions',
    'journal_playbook_rules',
    'journal_risk_violations',
    'journal_process_scores',
    'journal_saved_reports',
    'journal_report_runs',
    'journal_report_exports',
    'journal_report_schedules',
    'journal_market_context',
    'journal_price_observations',
    'journal_valuation_snapshots',
    'journal_calculation_runs',
    'journal_trade_sequence_metrics',
    'journal_data_quality_issues',
    'journal_daily_metrics',
    'journal_analytics_cache',
    'journal_performance_insights',
    'journal_ai_memories',
    'journal_ai_insights',
    'journal_ai_conversations',
    'journal_ai_feedback',
    'journal_ai_jobs',
    'journal_ai_usage',
    'journal_import_jobs',
    'journal_import_mappings',
    'journal_integrations',
    'journal_webhook_endpoints',
    'journal_domain_events',
    'journal_event_outbox',
    'journal_audit_log',
    'journal_metric_definitions',
    'journal_report_templates',
    'journal_trade_legs',
    'journal_executions',
    'journal_execution_fees',
    'journal_trade_cash_flows',
    'journal_tag_assignments',
    'journal_notebook_links',
    'journal_playbook_check_results',
    'journal_process_score_components',
    'journal_metric_formula_versions',
    'journal_report_run_rows',
    'journal_market_context_sources',
    'journal_calculation_lineage',
    'journal_ai_memory_evidence',
    'journal_ai_messages',
    'journal_import_rows',
    'journal_provider_accounts',
    'journal_sync_cursors',
    'journal_webhook_deliveries',
    'journal_dead_letters'
  ];
BEGIN
  FOR r IN
    SELECT p.schemaname, p.tablename, p.policyname
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = ANY (v_managed)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM (
        VALUES
    ('public', 'journal_notes', 'Users can manage own notes'),
    ('public', 'journal_trades', 'Users can manage own trades'),
    ('public', 'journal_trades', 'journal_trades_select_own'),
    ('public', 'journal_trades', 'journal_trades_insert_own'),
    ('public', 'journal_trades', 'journal_trades_update_own'),
    ('public', 'journal_trades', 'journal_trades_delete_own'),
    ('public', 'journal_notes', 'journal_notes_select_own'),
    ('public', 'journal_notes', 'journal_notes_insert_own'),
    ('public', 'journal_notes', 'journal_notes_update_own'),
    ('public', 'journal_notes', 'journal_notes_delete_own'),
    ('public', 'journal_stats_cache', 'journal_stats_cache_select_own'),
    ('public', 'journal_stats_cache', 'journal_stats_cache_insert_own'),
    ('public', 'journal_stats_cache', 'journal_stats_cache_update_own'),
    ('public', 'journal_stats_cache', 'journal_stats_cache_delete_own'),
    ('public', 'journal_equity_snapshots', 'journal_equity_snapshots_select_own'),
    ('public', 'journal_equity_snapshots', 'journal_equity_snapshots_insert_own'),
    ('public', 'journal_equity_snapshots', 'journal_equity_snapshots_update_own'),
    ('public', 'journal_equity_snapshots', 'journal_equity_snapshots_delete_own'),
    ('public', 'journal_imports', 'journal_imports_select_own'),
    ('public', 'journal_imports', 'journal_imports_insert_own'),
    ('public', 'journal_imports', 'journal_imports_update_own'),
    ('public', 'journal_imports', 'journal_imports_delete_own'),
    ('public', 'journal_trader_profiles', 'journal_trader_profiles_select_own'),
    ('public', 'journal_trader_profiles', 'journal_trader_profiles_insert_own'),
    ('public', 'journal_trader_profiles', 'journal_trader_profiles_update_own'),
    ('public', 'journal_trader_profiles', 'journal_trader_profiles_delete_own'),
    ('public', 'journal_accounts', 'journal_accounts_select_own'),
    ('public', 'journal_accounts', 'journal_accounts_insert_own'),
    ('public', 'journal_accounts', 'journal_accounts_update_own'),
    ('public', 'journal_accounts', 'journal_accounts_delete_own'),
    ('public', 'journal_account_balance_snapshots', 'journal_account_balance_snapshots_select_own'),
    ('public', 'journal_account_balance_snapshots', 'journal_account_balance_snapshots_insert_own'),
    ('public', 'journal_account_balance_snapshots', 'journal_account_balance_snapshots_update_own'),
    ('public', 'journal_account_balance_snapshots', 'journal_account_balance_snapshots_delete_own'),
    ('public', 'journal_goals', 'journal_goals_select_own'),
    ('public', 'journal_goals', 'journal_goals_insert_own'),
    ('public', 'journal_goals', 'journal_goals_update_own'),
    ('public', 'journal_goals', 'journal_goals_delete_own'),
    ('public', 'journal_risk_rules', 'journal_risk_rules_select_own'),
    ('public', 'journal_risk_rules', 'journal_risk_rules_insert_own'),
    ('public', 'journal_risk_rules', 'journal_risk_rules_update_own'),
    ('public', 'journal_risk_rules', 'journal_risk_rules_delete_own'),
    ('public', 'journal_coaching_commitments', 'journal_coaching_commitments_select_own'),
    ('public', 'journal_coaching_commitments', 'journal_coaching_commitments_insert_own'),
    ('public', 'journal_coaching_commitments', 'journal_coaching_commitments_update_own'),
    ('public', 'journal_coaching_commitments', 'journal_coaching_commitments_delete_own'),
    ('public', 'journal_cash_ledger_entries', 'journal_cash_ledger_entries_select_own'),
    ('public', 'journal_cash_ledger_entries', 'journal_cash_ledger_entries_insert_own'),
    ('public', 'journal_cash_ledger_entries', 'journal_cash_ledger_entries_update_own'),
    ('public', 'journal_cash_ledger_entries', 'journal_cash_ledger_entries_delete_own'),
    ('public', 'journal_balance_reconciliations', 'journal_balance_reconciliations_select_own'),
    ('public', 'journal_balance_reconciliations', 'journal_balance_reconciliations_insert_own'),
    ('public', 'journal_balance_reconciliations', 'journal_balance_reconciliations_update_own'),
    ('public', 'journal_balance_reconciliations', 'journal_balance_reconciliations_delete_own'),
    ('public', 'journal_currency_conversions', 'journal_currency_conversions_select_own'),
    ('public', 'journal_currency_conversions', 'journal_currency_conversions_insert_own'),
    ('public', 'journal_currency_conversions', 'journal_currency_conversions_update_own'),
    ('public', 'journal_currency_conversions', 'journal_currency_conversions_delete_own'),
    ('public', 'journal_trade_plans', 'journal_trade_plans_select_own'),
    ('public', 'journal_trade_plans', 'journal_trade_plans_insert_own'),
    ('public', 'journal_trade_plans', 'journal_trade_plans_update_own'),
    ('public', 'journal_trade_plans', 'journal_trade_plans_delete_own'),
    ('public', 'journal_trade_reviews', 'journal_trade_reviews_select_own'),
    ('public', 'journal_trade_reviews', 'journal_trade_reviews_insert_own'),
    ('public', 'journal_trade_reviews', 'journal_trade_reviews_update_own'),
    ('public', 'journal_trade_reviews', 'journal_trade_reviews_delete_own'),
    ('public', 'journal_trade_context', 'journal_trade_context_select_own'),
    ('public', 'journal_trade_context', 'journal_trade_context_insert_own'),
    ('public', 'journal_trade_context', 'journal_trade_context_update_own'),
    ('public', 'journal_trade_context', 'journal_trade_context_delete_own'),
    ('public', 'journal_trade_relationships', 'journal_trade_relationships_select_own'),
    ('public', 'journal_trade_relationships', 'journal_trade_relationships_insert_own'),
    ('public', 'journal_trade_relationships', 'journal_trade_relationships_update_own'),
    ('public', 'journal_trade_relationships', 'journal_trade_relationships_delete_own'),
    ('public', 'journal_trade_markers', 'journal_trade_markers_select_own'),
    ('public', 'journal_trade_markers', 'journal_trade_markers_insert_own'),
    ('public', 'journal_trade_markers', 'journal_trade_markers_update_own'),
    ('public', 'journal_trade_markers', 'journal_trade_markers_delete_own'),
    ('public', 'journal_attachments', 'journal_attachments_select_own'),
    ('public', 'journal_attachments', 'journal_attachments_insert_own'),
    ('public', 'journal_attachments', 'journal_attachments_update_own'),
    ('public', 'journal_attachments', 'journal_attachments_delete_own'),
    ('public', 'journal_tags', 'journal_tags_select_own'),
    ('public', 'journal_tags', 'journal_tags_insert_own'),
    ('public', 'journal_tags', 'journal_tags_update_own'),
    ('public', 'journal_tags', 'journal_tags_delete_own'),
    ('public', 'journal_notebooks', 'journal_notebooks_select_own'),
    ('public', 'journal_notebooks', 'journal_notebooks_insert_own'),
    ('public', 'journal_notebooks', 'journal_notebooks_update_own'),
    ('public', 'journal_notebooks', 'journal_notebooks_delete_own'),
    ('public', 'journal_notebook_entries', 'journal_notebook_entries_select_own'),
    ('public', 'journal_notebook_entries', 'journal_notebook_entries_insert_own'),
    ('public', 'journal_notebook_entries', 'journal_notebook_entries_update_own'),
    ('public', 'journal_notebook_entries', 'journal_notebook_entries_delete_own'),
    ('public', 'journal_sessions', 'journal_sessions_select_own'),
    ('public', 'journal_sessions', 'journal_sessions_insert_own'),
    ('public', 'journal_sessions', 'journal_sessions_update_own'),
    ('public', 'journal_sessions', 'journal_sessions_delete_own'),
    ('public', 'journal_daily_reviews', 'journal_daily_reviews_select_own'),
    ('public', 'journal_daily_reviews', 'journal_daily_reviews_insert_own'),
    ('public', 'journal_daily_reviews', 'journal_daily_reviews_update_own'),
    ('public', 'journal_daily_reviews', 'journal_daily_reviews_delete_own'),
    ('public', 'journal_playbooks', 'journal_playbooks_select_own'),
    ('public', 'journal_playbooks', 'journal_playbooks_insert_own'),
    ('public', 'journal_playbooks', 'journal_playbooks_update_own'),
    ('public', 'journal_playbooks', 'journal_playbooks_delete_own'),
    ('public', 'journal_playbook_versions', 'journal_playbook_versions_select_own'),
    ('public', 'journal_playbook_versions', 'journal_playbook_versions_insert_own'),
    ('public', 'journal_playbook_versions', 'journal_playbook_versions_update_own'),
    ('public', 'journal_playbook_versions', 'journal_playbook_versions_delete_own'),
    ('public', 'journal_playbook_rules', 'journal_playbook_rules_select_own'),
    ('public', 'journal_playbook_rules', 'journal_playbook_rules_insert_own'),
    ('public', 'journal_playbook_rules', 'journal_playbook_rules_update_own'),
    ('public', 'journal_playbook_rules', 'journal_playbook_rules_delete_own'),
    ('public', 'journal_risk_violations', 'journal_risk_violations_select_own'),
    ('public', 'journal_risk_violations', 'journal_risk_violations_insert_own'),
    ('public', 'journal_risk_violations', 'journal_risk_violations_update_own'),
    ('public', 'journal_risk_violations', 'journal_risk_violations_delete_own'),
    ('public', 'journal_process_scores', 'journal_process_scores_select_own'),
    ('public', 'journal_process_scores', 'journal_process_scores_insert_own'),
    ('public', 'journal_process_scores', 'journal_process_scores_update_own'),
    ('public', 'journal_process_scores', 'journal_process_scores_delete_own'),
    ('public', 'journal_saved_reports', 'journal_saved_reports_select_own'),
    ('public', 'journal_saved_reports', 'journal_saved_reports_insert_own'),
    ('public', 'journal_saved_reports', 'journal_saved_reports_update_own'),
    ('public', 'journal_saved_reports', 'journal_saved_reports_delete_own'),
    ('public', 'journal_report_runs', 'journal_report_runs_select_own'),
    ('public', 'journal_report_runs', 'journal_report_runs_insert_own'),
    ('public', 'journal_report_runs', 'journal_report_runs_update_own'),
    ('public', 'journal_report_runs', 'journal_report_runs_delete_own'),
    ('public', 'journal_report_exports', 'journal_report_exports_select_own'),
    ('public', 'journal_report_exports', 'journal_report_exports_insert_own'),
    ('public', 'journal_report_exports', 'journal_report_exports_update_own'),
    ('public', 'journal_report_exports', 'journal_report_exports_delete_own'),
    ('public', 'journal_report_schedules', 'journal_report_schedules_select_own'),
    ('public', 'journal_report_schedules', 'journal_report_schedules_insert_own'),
    ('public', 'journal_report_schedules', 'journal_report_schedules_update_own'),
    ('public', 'journal_report_schedules', 'journal_report_schedules_delete_own'),
    ('public', 'journal_market_context', 'journal_market_context_select_own'),
    ('public', 'journal_market_context', 'journal_market_context_insert_own'),
    ('public', 'journal_market_context', 'journal_market_context_update_own'),
    ('public', 'journal_market_context', 'journal_market_context_delete_own'),
    ('public', 'journal_price_observations', 'journal_price_observations_select_own'),
    ('public', 'journal_price_observations', 'journal_price_observations_insert_own'),
    ('public', 'journal_price_observations', 'journal_price_observations_update_own'),
    ('public', 'journal_price_observations', 'journal_price_observations_delete_own'),
    ('public', 'journal_valuation_snapshots', 'journal_valuation_snapshots_select_own'),
    ('public', 'journal_valuation_snapshots', 'journal_valuation_snapshots_insert_own'),
    ('public', 'journal_valuation_snapshots', 'journal_valuation_snapshots_update_own'),
    ('public', 'journal_valuation_snapshots', 'journal_valuation_snapshots_delete_own'),
    ('public', 'journal_calculation_runs', 'journal_calculation_runs_select_own'),
    ('public', 'journal_calculation_runs', 'journal_calculation_runs_insert_own'),
    ('public', 'journal_calculation_runs', 'journal_calculation_runs_update_own'),
    ('public', 'journal_calculation_runs', 'journal_calculation_runs_delete_own'),
    ('public', 'journal_trade_sequence_metrics', 'journal_trade_sequence_metrics_select_own'),
    ('public', 'journal_trade_sequence_metrics', 'journal_trade_sequence_metrics_insert_own'),
    ('public', 'journal_trade_sequence_metrics', 'journal_trade_sequence_metrics_update_own'),
    ('public', 'journal_trade_sequence_metrics', 'journal_trade_sequence_metrics_delete_own'),
    ('public', 'journal_data_quality_issues', 'journal_data_quality_issues_select_own'),
    ('public', 'journal_data_quality_issues', 'journal_data_quality_issues_insert_own'),
    ('public', 'journal_data_quality_issues', 'journal_data_quality_issues_update_own'),
    ('public', 'journal_data_quality_issues', 'journal_data_quality_issues_delete_own'),
    ('public', 'journal_daily_metrics', 'journal_daily_metrics_select_own'),
    ('public', 'journal_daily_metrics', 'journal_daily_metrics_insert_own'),
    ('public', 'journal_daily_metrics', 'journal_daily_metrics_update_own'),
    ('public', 'journal_daily_metrics', 'journal_daily_metrics_delete_own'),
    ('public', 'journal_analytics_cache', 'journal_analytics_cache_select_own'),
    ('public', 'journal_analytics_cache', 'journal_analytics_cache_insert_own'),
    ('public', 'journal_analytics_cache', 'journal_analytics_cache_update_own'),
    ('public', 'journal_analytics_cache', 'journal_analytics_cache_delete_own'),
    ('public', 'journal_performance_insights', 'journal_performance_insights_select_own'),
    ('public', 'journal_performance_insights', 'journal_performance_insights_insert_own'),
    ('public', 'journal_performance_insights', 'journal_performance_insights_update_own'),
    ('public', 'journal_performance_insights', 'journal_performance_insights_delete_own'),
    ('public', 'journal_ai_memories', 'journal_ai_memories_select_own'),
    ('public', 'journal_ai_memories', 'journal_ai_memories_insert_own'),
    ('public', 'journal_ai_memories', 'journal_ai_memories_update_own'),
    ('public', 'journal_ai_memories', 'journal_ai_memories_delete_own'),
    ('public', 'journal_ai_insights', 'journal_ai_insights_select_own'),
    ('public', 'journal_ai_insights', 'journal_ai_insights_insert_own'),
    ('public', 'journal_ai_insights', 'journal_ai_insights_update_own'),
    ('public', 'journal_ai_insights', 'journal_ai_insights_delete_own'),
    ('public', 'journal_ai_conversations', 'journal_ai_conversations_select_own'),
    ('public', 'journal_ai_conversations', 'journal_ai_conversations_insert_own'),
    ('public', 'journal_ai_conversations', 'journal_ai_conversations_update_own'),
    ('public', 'journal_ai_conversations', 'journal_ai_conversations_delete_own'),
    ('public', 'journal_ai_feedback', 'journal_ai_feedback_select_own'),
    ('public', 'journal_ai_feedback', 'journal_ai_feedback_insert_own'),
    ('public', 'journal_ai_feedback', 'journal_ai_feedback_update_own'),
    ('public', 'journal_ai_feedback', 'journal_ai_feedback_delete_own'),
    ('public', 'journal_ai_jobs', 'journal_ai_jobs_select_own'),
    ('public', 'journal_ai_jobs', 'journal_ai_jobs_insert_own'),
    ('public', 'journal_ai_jobs', 'journal_ai_jobs_update_own'),
    ('public', 'journal_ai_jobs', 'journal_ai_jobs_delete_own'),
    ('public', 'journal_ai_usage', 'journal_ai_usage_select_own'),
    ('public', 'journal_ai_usage', 'journal_ai_usage_insert_own'),
    ('public', 'journal_ai_usage', 'journal_ai_usage_update_own'),
    ('public', 'journal_ai_usage', 'journal_ai_usage_delete_own'),
    ('public', 'journal_import_jobs', 'journal_import_jobs_select_own'),
    ('public', 'journal_import_jobs', 'journal_import_jobs_insert_own'),
    ('public', 'journal_import_jobs', 'journal_import_jobs_update_own'),
    ('public', 'journal_import_jobs', 'journal_import_jobs_delete_own'),
    ('public', 'journal_import_mappings', 'journal_import_mappings_select_own'),
    ('public', 'journal_import_mappings', 'journal_import_mappings_insert_own'),
    ('public', 'journal_import_mappings', 'journal_import_mappings_update_own'),
    ('public', 'journal_import_mappings', 'journal_import_mappings_delete_own'),
    ('public', 'journal_integrations', 'journal_integrations_select_own'),
    ('public', 'journal_integrations', 'journal_integrations_insert_own'),
    ('public', 'journal_integrations', 'journal_integrations_update_own'),
    ('public', 'journal_integrations', 'journal_integrations_delete_own'),
    ('public', 'journal_webhook_endpoints', 'journal_webhook_endpoints_select_own'),
    ('public', 'journal_webhook_endpoints', 'journal_webhook_endpoints_insert_own'),
    ('public', 'journal_webhook_endpoints', 'journal_webhook_endpoints_update_own'),
    ('public', 'journal_webhook_endpoints', 'journal_webhook_endpoints_delete_own'),
    ('public', 'journal_domain_events', 'journal_domain_events_select_own'),
    ('public', 'journal_domain_events', 'journal_domain_events_insert_own'),
    ('public', 'journal_domain_events', 'journal_domain_events_update_own'),
    ('public', 'journal_domain_events', 'journal_domain_events_delete_own'),
    ('public', 'journal_event_outbox', 'journal_event_outbox_select_own'),
    ('public', 'journal_event_outbox', 'journal_event_outbox_insert_own'),
    ('public', 'journal_event_outbox', 'journal_event_outbox_update_own'),
    ('public', 'journal_event_outbox', 'journal_event_outbox_delete_own'),
    ('public', 'journal_event_outbox', 'journal_event_outbox_service_role_all'),
    ('public', 'journal_audit_log', 'journal_audit_log_select_own'),
    ('public', 'journal_audit_log', 'journal_audit_log_insert_own'),
    ('public', 'journal_audit_log', 'journal_audit_log_update_own'),
    ('public', 'journal_audit_log', 'journal_audit_log_delete_own'),
    ('public', 'journal_audit_log', 'journal_audit_log_service_role_all'),
    ('public', 'journal_metric_definitions', 'journal_metric_definitions_select_own'),
    ('public', 'journal_metric_definitions', 'journal_metric_definitions_insert_own'),
    ('public', 'journal_metric_definitions', 'journal_metric_definitions_update_own'),
    ('public', 'journal_metric_definitions', 'journal_metric_definitions_delete_own'),
    ('public', 'journal_report_templates', 'journal_report_templates_select_own'),
    ('public', 'journal_report_templates', 'journal_report_templates_insert_own'),
    ('public', 'journal_report_templates', 'journal_report_templates_update_own'),
    ('public', 'journal_report_templates', 'journal_report_templates_delete_own'),
    ('public', 'journal_trade_legs', 'journal_trade_legs_select_own'),
    ('public', 'journal_trade_legs', 'journal_trade_legs_insert_own'),
    ('public', 'journal_trade_legs', 'journal_trade_legs_update_own'),
    ('public', 'journal_trade_legs', 'journal_trade_legs_delete_own'),
    ('public', 'journal_executions', 'journal_executions_select_own'),
    ('public', 'journal_executions', 'journal_executions_insert_own'),
    ('public', 'journal_executions', 'journal_executions_update_own'),
    ('public', 'journal_executions', 'journal_executions_delete_own'),
    ('public', 'journal_execution_fees', 'journal_execution_fees_select_own'),
    ('public', 'journal_execution_fees', 'journal_execution_fees_insert_own'),
    ('public', 'journal_execution_fees', 'journal_execution_fees_update_own'),
    ('public', 'journal_execution_fees', 'journal_execution_fees_delete_own'),
    ('public', 'journal_trade_cash_flows', 'journal_trade_cash_flows_select_own'),
    ('public', 'journal_trade_cash_flows', 'journal_trade_cash_flows_insert_own'),
    ('public', 'journal_trade_cash_flows', 'journal_trade_cash_flows_update_own'),
    ('public', 'journal_trade_cash_flows', 'journal_trade_cash_flows_delete_own'),
    ('public', 'journal_tag_assignments', 'journal_tag_assignments_select_own'),
    ('public', 'journal_tag_assignments', 'journal_tag_assignments_insert_own'),
    ('public', 'journal_tag_assignments', 'journal_tag_assignments_update_own'),
    ('public', 'journal_tag_assignments', 'journal_tag_assignments_delete_own'),
    ('public', 'journal_notebook_links', 'journal_notebook_links_select_own'),
    ('public', 'journal_notebook_links', 'journal_notebook_links_insert_own'),
    ('public', 'journal_notebook_links', 'journal_notebook_links_update_own'),
    ('public', 'journal_notebook_links', 'journal_notebook_links_delete_own'),
    ('public', 'journal_playbook_check_results', 'journal_playbook_check_results_select_own'),
    ('public', 'journal_playbook_check_results', 'journal_playbook_check_results_insert_own'),
    ('public', 'journal_playbook_check_results', 'journal_playbook_check_results_update_own'),
    ('public', 'journal_playbook_check_results', 'journal_playbook_check_results_delete_own'),
    ('public', 'journal_process_score_components', 'journal_process_score_components_select_own'),
    ('public', 'journal_process_score_components', 'journal_process_score_components_insert_own'),
    ('public', 'journal_process_score_components', 'journal_process_score_components_update_own'),
    ('public', 'journal_process_score_components', 'journal_process_score_components_delete_own'),
    ('public', 'journal_metric_formula_versions', 'journal_metric_formula_versions_select_own'),
    ('public', 'journal_metric_formula_versions', 'journal_metric_formula_versions_insert_own'),
    ('public', 'journal_metric_formula_versions', 'journal_metric_formula_versions_update_own'),
    ('public', 'journal_metric_formula_versions', 'journal_metric_formula_versions_delete_own'),
    ('public', 'journal_report_run_rows', 'journal_report_run_rows_select_own'),
    ('public', 'journal_report_run_rows', 'journal_report_run_rows_insert_own'),
    ('public', 'journal_report_run_rows', 'journal_report_run_rows_update_own'),
    ('public', 'journal_report_run_rows', 'journal_report_run_rows_delete_own'),
    ('public', 'journal_market_context_sources', 'journal_market_context_sources_select_own'),
    ('public', 'journal_market_context_sources', 'journal_market_context_sources_insert_own'),
    ('public', 'journal_market_context_sources', 'journal_market_context_sources_update_own'),
    ('public', 'journal_market_context_sources', 'journal_market_context_sources_delete_own'),
    ('public', 'journal_calculation_lineage', 'journal_calculation_lineage_select_own'),
    ('public', 'journal_calculation_lineage', 'journal_calculation_lineage_insert_own'),
    ('public', 'journal_calculation_lineage', 'journal_calculation_lineage_update_own'),
    ('public', 'journal_calculation_lineage', 'journal_calculation_lineage_delete_own'),
    ('public', 'journal_ai_memory_evidence', 'journal_ai_memory_evidence_select_own'),
    ('public', 'journal_ai_memory_evidence', 'journal_ai_memory_evidence_insert_own'),
    ('public', 'journal_ai_memory_evidence', 'journal_ai_memory_evidence_update_own'),
    ('public', 'journal_ai_memory_evidence', 'journal_ai_memory_evidence_delete_own'),
    ('public', 'journal_ai_messages', 'journal_ai_messages_select_own'),
    ('public', 'journal_ai_messages', 'journal_ai_messages_insert_own'),
    ('public', 'journal_ai_messages', 'journal_ai_messages_update_own'),
    ('public', 'journal_ai_messages', 'journal_ai_messages_delete_own'),
    ('public', 'journal_import_rows', 'journal_import_rows_select_own'),
    ('public', 'journal_import_rows', 'journal_import_rows_insert_own'),
    ('public', 'journal_import_rows', 'journal_import_rows_update_own'),
    ('public', 'journal_import_rows', 'journal_import_rows_delete_own'),
    ('public', 'journal_provider_accounts', 'journal_provider_accounts_select_own'),
    ('public', 'journal_provider_accounts', 'journal_provider_accounts_insert_own'),
    ('public', 'journal_provider_accounts', 'journal_provider_accounts_update_own'),
    ('public', 'journal_provider_accounts', 'journal_provider_accounts_delete_own'),
    ('public', 'journal_sync_cursors', 'journal_sync_cursors_select_own'),
    ('public', 'journal_sync_cursors', 'journal_sync_cursors_insert_own'),
    ('public', 'journal_sync_cursors', 'journal_sync_cursors_update_own'),
    ('public', 'journal_sync_cursors', 'journal_sync_cursors_delete_own'),
    ('public', 'journal_webhook_deliveries', 'journal_webhook_deliveries_select_own'),
    ('public', 'journal_webhook_deliveries', 'journal_webhook_deliveries_insert_own'),
    ('public', 'journal_webhook_deliveries', 'journal_webhook_deliveries_update_own'),
    ('public', 'journal_webhook_deliveries', 'journal_webhook_deliveries_delete_own'),
    ('public', 'journal_dead_letters', 'journal_dead_letters_select_own'),
    ('public', 'journal_dead_letters', 'journal_dead_letters_insert_own'),
    ('public', 'journal_dead_letters', 'journal_dead_letters_update_own'),
    ('public', 'journal_dead_letters', 'journal_dead_letters_delete_own'),
    ('public', 'journal_dead_letters', 'journal_dead_letters_service_role_all')
      ) AS allowlist(schemaname, tablename, policyname)
      WHERE allowlist.schemaname = r.schemaname
        AND allowlist.tablename = r.tablename
        AND allowlist.policyname = r.policyname
    ) THEN
      RAISE EXCEPTION
        'preflight: unexpected policy %.% %',
        r.schemaname, r.tablename, r.policyname;
    END IF;
  END LOOP;
END;
$journal_pre$;


-- public.journal_trades
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_trades');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Users can manage own trades', 'journal_trades');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trades_select_own', 'journal_trades');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trades_insert_own', 'journal_trades');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trades_update_own', 'journal_trades');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trades_delete_own', 'journal_trades');
  EXECUTE $journal_create$
  CREATE POLICY "journal_trades_select_own"
  ON public.journal_trades
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trades_insert_own"
  ON public.journal_trades
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trades_update_own"
  ON public.journal_trades
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trades_delete_own"
  ON public.journal_trades
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_trades FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_trades FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_trades TO authenticated;
GRANT ALL ON TABLE public.journal_trades TO service_role;

-- public.journal_notes
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_notes');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Users can manage own notes', 'journal_notes');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_notes_select_own', 'journal_notes');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_notes_insert_own', 'journal_notes');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_notes_update_own', 'journal_notes');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_notes_delete_own', 'journal_notes');
  EXECUTE $journal_create$
  CREATE POLICY "journal_notes_select_own"
  ON public.journal_notes
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_notes_insert_own"
  ON public.journal_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_notes_update_own"
  ON public.journal_notes
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_notes_delete_own"
  ON public.journal_notes
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_notes FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_notes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_notes TO authenticated;
GRANT ALL ON TABLE public.journal_notes TO service_role;

-- public.journal_stats_cache
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_stats_cache');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_stats_cache_select_own', 'journal_stats_cache');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_stats_cache_insert_own', 'journal_stats_cache');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_stats_cache_update_own', 'journal_stats_cache');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_stats_cache_delete_own', 'journal_stats_cache');
  EXECUTE $journal_create$
  CREATE POLICY "journal_stats_cache_select_own"
  ON public.journal_stats_cache
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_stats_cache_insert_own"
  ON public.journal_stats_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_stats_cache_update_own"
  ON public.journal_stats_cache
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_stats_cache_delete_own"
  ON public.journal_stats_cache
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_stats_cache FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_stats_cache FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_stats_cache TO authenticated;
GRANT ALL ON TABLE public.journal_stats_cache TO service_role;

-- public.journal_equity_snapshots
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_equity_snapshots');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_equity_snapshots_select_own', 'journal_equity_snapshots');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_equity_snapshots_insert_own', 'journal_equity_snapshots');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_equity_snapshots_update_own', 'journal_equity_snapshots');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_equity_snapshots_delete_own', 'journal_equity_snapshots');
  EXECUTE $journal_create$
  CREATE POLICY "journal_equity_snapshots_select_own"
  ON public.journal_equity_snapshots
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_equity_snapshots_insert_own"
  ON public.journal_equity_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_equity_snapshots_update_own"
  ON public.journal_equity_snapshots
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_equity_snapshots_delete_own"
  ON public.journal_equity_snapshots
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_equity_snapshots FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_equity_snapshots FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_equity_snapshots TO authenticated;
GRANT ALL ON TABLE public.journal_equity_snapshots TO service_role;

-- public.journal_imports
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_imports');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_imports_select_own', 'journal_imports');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_imports_insert_own', 'journal_imports');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_imports_update_own', 'journal_imports');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_imports_delete_own', 'journal_imports');
  EXECUTE $journal_create$
  CREATE POLICY "journal_imports_select_own"
  ON public.journal_imports
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_imports_insert_own"
  ON public.journal_imports
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_imports_update_own"
  ON public.journal_imports
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_imports_delete_own"
  ON public.journal_imports
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_imports FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_imports FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_imports TO authenticated;
GRANT ALL ON TABLE public.journal_imports TO service_role;

-- public.journal_trader_profiles
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_trader_profiles');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trader_profiles_select_own', 'journal_trader_profiles');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trader_profiles_insert_own', 'journal_trader_profiles');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trader_profiles_update_own', 'journal_trader_profiles');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trader_profiles_delete_own', 'journal_trader_profiles');
  EXECUTE $journal_create$
  CREATE POLICY "journal_trader_profiles_select_own"
  ON public.journal_trader_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trader_profiles_insert_own"
  ON public.journal_trader_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trader_profiles_update_own"
  ON public.journal_trader_profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trader_profiles_delete_own"
  ON public.journal_trader_profiles
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_trader_profiles FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_trader_profiles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_trader_profiles TO authenticated;
GRANT ALL ON TABLE public.journal_trader_profiles TO service_role;

-- public.journal_accounts
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_accounts');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_accounts_select_own', 'journal_accounts');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_accounts_insert_own', 'journal_accounts');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_accounts_update_own', 'journal_accounts');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_accounts_delete_own', 'journal_accounts');
  EXECUTE $journal_create$
  CREATE POLICY "journal_accounts_select_own"
  ON public.journal_accounts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_accounts_insert_own"
  ON public.journal_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_accounts_update_own"
  ON public.journal_accounts
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_accounts_delete_own"
  ON public.journal_accounts
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_accounts FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_accounts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_accounts TO authenticated;
GRANT ALL ON TABLE public.journal_accounts TO service_role;

-- public.journal_account_balance_snapshots
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_account_balance_snapshots');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_account_balance_snapshots_select_own', 'journal_account_balance_snapshots');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_account_balance_snapshots_insert_own', 'journal_account_balance_snapshots');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_account_balance_snapshots_update_own', 'journal_account_balance_snapshots');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_account_balance_snapshots_delete_own', 'journal_account_balance_snapshots');
  EXECUTE $journal_create$
  CREATE POLICY "journal_account_balance_snapshots_select_own"
  ON public.journal_account_balance_snapshots
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_account_balance_snapshots_insert_own"
  ON public.journal_account_balance_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_account_balance_snapshots_update_own"
  ON public.journal_account_balance_snapshots
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_account_balance_snapshots_delete_own"
  ON public.journal_account_balance_snapshots
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_account_balance_snapshots FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_account_balance_snapshots FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_account_balance_snapshots TO authenticated;
GRANT ALL ON TABLE public.journal_account_balance_snapshots TO service_role;

-- public.journal_goals
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_goals');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_goals_select_own', 'journal_goals');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_goals_insert_own', 'journal_goals');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_goals_update_own', 'journal_goals');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_goals_delete_own', 'journal_goals');
  EXECUTE $journal_create$
  CREATE POLICY "journal_goals_select_own"
  ON public.journal_goals
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_goals_insert_own"
  ON public.journal_goals
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_goals_update_own"
  ON public.journal_goals
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_goals_delete_own"
  ON public.journal_goals
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_goals FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_goals FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_goals TO authenticated;
GRANT ALL ON TABLE public.journal_goals TO service_role;

-- public.journal_risk_rules
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_risk_rules');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_risk_rules_select_own', 'journal_risk_rules');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_risk_rules_insert_own', 'journal_risk_rules');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_risk_rules_update_own', 'journal_risk_rules');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_risk_rules_delete_own', 'journal_risk_rules');
  EXECUTE $journal_create$
  CREATE POLICY "journal_risk_rules_select_own"
  ON public.journal_risk_rules
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_risk_rules_insert_own"
  ON public.journal_risk_rules
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_risk_rules_update_own"
  ON public.journal_risk_rules
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_risk_rules_delete_own"
  ON public.journal_risk_rules
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_risk_rules FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_risk_rules FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_risk_rules TO authenticated;
GRANT ALL ON TABLE public.journal_risk_rules TO service_role;

-- public.journal_coaching_commitments
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_coaching_commitments');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_coaching_commitments_select_own', 'journal_coaching_commitments');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_coaching_commitments_insert_own', 'journal_coaching_commitments');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_coaching_commitments_update_own', 'journal_coaching_commitments');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_coaching_commitments_delete_own', 'journal_coaching_commitments');
  EXECUTE $journal_create$
  CREATE POLICY "journal_coaching_commitments_select_own"
  ON public.journal_coaching_commitments
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_coaching_commitments_insert_own"
  ON public.journal_coaching_commitments
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_coaching_commitments_update_own"
  ON public.journal_coaching_commitments
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_coaching_commitments_delete_own"
  ON public.journal_coaching_commitments
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_coaching_commitments FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_coaching_commitments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_coaching_commitments TO authenticated;
GRANT ALL ON TABLE public.journal_coaching_commitments TO service_role;

-- public.journal_cash_ledger_entries
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_cash_ledger_entries');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_cash_ledger_entries_select_own', 'journal_cash_ledger_entries');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_cash_ledger_entries_insert_own', 'journal_cash_ledger_entries');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_cash_ledger_entries_update_own', 'journal_cash_ledger_entries');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_cash_ledger_entries_delete_own', 'journal_cash_ledger_entries');
  EXECUTE $journal_create$
  CREATE POLICY "journal_cash_ledger_entries_select_own"
  ON public.journal_cash_ledger_entries
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_cash_ledger_entries_insert_own"
  ON public.journal_cash_ledger_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_cash_ledger_entries_update_own"
  ON public.journal_cash_ledger_entries
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_cash_ledger_entries_delete_own"
  ON public.journal_cash_ledger_entries
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_cash_ledger_entries FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_cash_ledger_entries FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_cash_ledger_entries TO authenticated;
GRANT ALL ON TABLE public.journal_cash_ledger_entries TO service_role;

-- public.journal_balance_reconciliations
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_balance_reconciliations');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_balance_reconciliations_select_own', 'journal_balance_reconciliations');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_balance_reconciliations_insert_own', 'journal_balance_reconciliations');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_balance_reconciliations_update_own', 'journal_balance_reconciliations');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_balance_reconciliations_delete_own', 'journal_balance_reconciliations');
  EXECUTE $journal_create$
  CREATE POLICY "journal_balance_reconciliations_select_own"
  ON public.journal_balance_reconciliations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_balance_reconciliations_insert_own"
  ON public.journal_balance_reconciliations
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_balance_reconciliations_update_own"
  ON public.journal_balance_reconciliations
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_balance_reconciliations_delete_own"
  ON public.journal_balance_reconciliations
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_balance_reconciliations FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_balance_reconciliations FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_balance_reconciliations TO authenticated;
GRANT ALL ON TABLE public.journal_balance_reconciliations TO service_role;

-- public.journal_currency_conversions
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_currency_conversions');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_currency_conversions_select_own', 'journal_currency_conversions');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_currency_conversions_insert_own', 'journal_currency_conversions');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_currency_conversions_update_own', 'journal_currency_conversions');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_currency_conversions_delete_own', 'journal_currency_conversions');
  EXECUTE $journal_create$
  CREATE POLICY "journal_currency_conversions_select_own"
  ON public.journal_currency_conversions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_currency_conversions_insert_own"
  ON public.journal_currency_conversions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_currency_conversions_update_own"
  ON public.journal_currency_conversions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_currency_conversions_delete_own"
  ON public.journal_currency_conversions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_currency_conversions FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_currency_conversions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_currency_conversions TO authenticated;
GRANT ALL ON TABLE public.journal_currency_conversions TO service_role;

-- public.journal_trade_plans
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_trade_plans');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_plans_select_own', 'journal_trade_plans');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_plans_insert_own', 'journal_trade_plans');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_plans_update_own', 'journal_trade_plans');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_plans_delete_own', 'journal_trade_plans');
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_plans_select_own"
  ON public.journal_trade_plans
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_plans_insert_own"
  ON public.journal_trade_plans
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_plans_update_own"
  ON public.journal_trade_plans
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_plans_delete_own"
  ON public.journal_trade_plans
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_trade_plans FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_trade_plans FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_trade_plans TO authenticated;
GRANT ALL ON TABLE public.journal_trade_plans TO service_role;

-- public.journal_trade_reviews
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_trade_reviews');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_reviews_select_own', 'journal_trade_reviews');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_reviews_insert_own', 'journal_trade_reviews');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_reviews_update_own', 'journal_trade_reviews');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_reviews_delete_own', 'journal_trade_reviews');
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_reviews_select_own"
  ON public.journal_trade_reviews
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_reviews_insert_own"
  ON public.journal_trade_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_reviews_update_own"
  ON public.journal_trade_reviews
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_reviews_delete_own"
  ON public.journal_trade_reviews
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_trade_reviews FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_trade_reviews FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_trade_reviews TO authenticated;
GRANT ALL ON TABLE public.journal_trade_reviews TO service_role;

-- public.journal_trade_context
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_trade_context');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_context_select_own', 'journal_trade_context');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_context_insert_own', 'journal_trade_context');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_context_update_own', 'journal_trade_context');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_context_delete_own', 'journal_trade_context');
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_context_select_own"
  ON public.journal_trade_context
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_context_insert_own"
  ON public.journal_trade_context
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_context_update_own"
  ON public.journal_trade_context
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_context_delete_own"
  ON public.journal_trade_context
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_trade_context FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_trade_context FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_trade_context TO authenticated;
GRANT ALL ON TABLE public.journal_trade_context TO service_role;

-- public.journal_trade_relationships
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_trade_relationships');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_relationships_select_own', 'journal_trade_relationships');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_relationships_insert_own', 'journal_trade_relationships');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_relationships_update_own', 'journal_trade_relationships');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_relationships_delete_own', 'journal_trade_relationships');
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_relationships_select_own"
  ON public.journal_trade_relationships
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_relationships_insert_own"
  ON public.journal_trade_relationships
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_relationships_update_own"
  ON public.journal_trade_relationships
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_relationships_delete_own"
  ON public.journal_trade_relationships
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_trade_relationships FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_trade_relationships FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_trade_relationships TO authenticated;
GRANT ALL ON TABLE public.journal_trade_relationships TO service_role;

-- public.journal_trade_markers
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_trade_markers');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_markers_select_own', 'journal_trade_markers');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_markers_insert_own', 'journal_trade_markers');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_markers_update_own', 'journal_trade_markers');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_markers_delete_own', 'journal_trade_markers');
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_markers_select_own"
  ON public.journal_trade_markers
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_markers_insert_own"
  ON public.journal_trade_markers
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_markers_update_own"
  ON public.journal_trade_markers
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_markers_delete_own"
  ON public.journal_trade_markers
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_trade_markers FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_trade_markers FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_trade_markers TO authenticated;
GRANT ALL ON TABLE public.journal_trade_markers TO service_role;

-- public.journal_attachments
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_attachments');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_attachments_select_own', 'journal_attachments');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_attachments_insert_own', 'journal_attachments');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_attachments_update_own', 'journal_attachments');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_attachments_delete_own', 'journal_attachments');
  EXECUTE $journal_create$
  CREATE POLICY "journal_attachments_select_own"
  ON public.journal_attachments
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_attachments_insert_own"
  ON public.journal_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_attachments_update_own"
  ON public.journal_attachments
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_attachments_delete_own"
  ON public.journal_attachments
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_attachments FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_attachments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_attachments TO authenticated;
GRANT ALL ON TABLE public.journal_attachments TO service_role;

-- public.journal_tags
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_tags');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_tags_select_own', 'journal_tags');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_tags_insert_own', 'journal_tags');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_tags_update_own', 'journal_tags');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_tags_delete_own', 'journal_tags');
  EXECUTE $journal_create$
  CREATE POLICY "journal_tags_select_own"
  ON public.journal_tags
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_tags_insert_own"
  ON public.journal_tags
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_tags_update_own"
  ON public.journal_tags
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_tags_delete_own"
  ON public.journal_tags
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_tags FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_tags FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_tags TO authenticated;
GRANT ALL ON TABLE public.journal_tags TO service_role;

-- public.journal_notebooks
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_notebooks');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_notebooks_select_own', 'journal_notebooks');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_notebooks_insert_own', 'journal_notebooks');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_notebooks_update_own', 'journal_notebooks');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_notebooks_delete_own', 'journal_notebooks');
  EXECUTE $journal_create$
  CREATE POLICY "journal_notebooks_select_own"
  ON public.journal_notebooks
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_notebooks_insert_own"
  ON public.journal_notebooks
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_notebooks_update_own"
  ON public.journal_notebooks
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_notebooks_delete_own"
  ON public.journal_notebooks
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_notebooks FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_notebooks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_notebooks TO authenticated;
GRANT ALL ON TABLE public.journal_notebooks TO service_role;

-- public.journal_notebook_entries
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_notebook_entries');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_notebook_entries_select_own', 'journal_notebook_entries');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_notebook_entries_insert_own', 'journal_notebook_entries');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_notebook_entries_update_own', 'journal_notebook_entries');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_notebook_entries_delete_own', 'journal_notebook_entries');
  EXECUTE $journal_create$
  CREATE POLICY "journal_notebook_entries_select_own"
  ON public.journal_notebook_entries
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_notebook_entries_insert_own"
  ON public.journal_notebook_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_notebook_entries_update_own"
  ON public.journal_notebook_entries
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_notebook_entries_delete_own"
  ON public.journal_notebook_entries
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_notebook_entries FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_notebook_entries FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_notebook_entries TO authenticated;
GRANT ALL ON TABLE public.journal_notebook_entries TO service_role;

-- public.journal_sessions
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_sessions');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_sessions_select_own', 'journal_sessions');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_sessions_insert_own', 'journal_sessions');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_sessions_update_own', 'journal_sessions');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_sessions_delete_own', 'journal_sessions');
  EXECUTE $journal_create$
  CREATE POLICY "journal_sessions_select_own"
  ON public.journal_sessions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_sessions_insert_own"
  ON public.journal_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_sessions_update_own"
  ON public.journal_sessions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_sessions_delete_own"
  ON public.journal_sessions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_sessions FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_sessions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_sessions TO authenticated;
GRANT ALL ON TABLE public.journal_sessions TO service_role;

-- public.journal_daily_reviews
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_daily_reviews');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_daily_reviews_select_own', 'journal_daily_reviews');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_daily_reviews_insert_own', 'journal_daily_reviews');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_daily_reviews_update_own', 'journal_daily_reviews');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_daily_reviews_delete_own', 'journal_daily_reviews');
  EXECUTE $journal_create$
  CREATE POLICY "journal_daily_reviews_select_own"
  ON public.journal_daily_reviews
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_daily_reviews_insert_own"
  ON public.journal_daily_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_daily_reviews_update_own"
  ON public.journal_daily_reviews
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_daily_reviews_delete_own"
  ON public.journal_daily_reviews
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_daily_reviews FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_daily_reviews FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_daily_reviews TO authenticated;
GRANT ALL ON TABLE public.journal_daily_reviews TO service_role;

-- public.journal_playbooks
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_playbooks');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_playbooks_select_own', 'journal_playbooks');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_playbooks_insert_own', 'journal_playbooks');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_playbooks_update_own', 'journal_playbooks');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_playbooks_delete_own', 'journal_playbooks');
  EXECUTE $journal_create$
  CREATE POLICY "journal_playbooks_select_own"
  ON public.journal_playbooks
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_playbooks_insert_own"
  ON public.journal_playbooks
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_playbooks_update_own"
  ON public.journal_playbooks
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_playbooks_delete_own"
  ON public.journal_playbooks
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_playbooks FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_playbooks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_playbooks TO authenticated;
GRANT ALL ON TABLE public.journal_playbooks TO service_role;

-- public.journal_playbook_versions
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_playbook_versions');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_playbook_versions_select_own', 'journal_playbook_versions');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_playbook_versions_insert_own', 'journal_playbook_versions');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_playbook_versions_update_own', 'journal_playbook_versions');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_playbook_versions_delete_own', 'journal_playbook_versions');
  EXECUTE $journal_create$
  CREATE POLICY "journal_playbook_versions_select_own"
  ON public.journal_playbook_versions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_playbook_versions_insert_own"
  ON public.journal_playbook_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_playbook_versions_update_own"
  ON public.journal_playbook_versions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_playbook_versions_delete_own"
  ON public.journal_playbook_versions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_playbook_versions FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_playbook_versions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_playbook_versions TO authenticated;
GRANT ALL ON TABLE public.journal_playbook_versions TO service_role;

-- public.journal_playbook_rules
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_playbook_rules');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_playbook_rules_select_own', 'journal_playbook_rules');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_playbook_rules_insert_own', 'journal_playbook_rules');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_playbook_rules_update_own', 'journal_playbook_rules');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_playbook_rules_delete_own', 'journal_playbook_rules');
  EXECUTE $journal_create$
  CREATE POLICY "journal_playbook_rules_select_own"
  ON public.journal_playbook_rules
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_playbook_rules_insert_own"
  ON public.journal_playbook_rules
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_playbook_rules_update_own"
  ON public.journal_playbook_rules
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_playbook_rules_delete_own"
  ON public.journal_playbook_rules
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_playbook_rules FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_playbook_rules FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_playbook_rules TO authenticated;
GRANT ALL ON TABLE public.journal_playbook_rules TO service_role;

-- public.journal_risk_violations
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_risk_violations');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_risk_violations_select_own', 'journal_risk_violations');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_risk_violations_insert_own', 'journal_risk_violations');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_risk_violations_update_own', 'journal_risk_violations');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_risk_violations_delete_own', 'journal_risk_violations');
  EXECUTE $journal_create$
  CREATE POLICY "journal_risk_violations_select_own"
  ON public.journal_risk_violations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_risk_violations_insert_own"
  ON public.journal_risk_violations
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_risk_violations_update_own"
  ON public.journal_risk_violations
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_risk_violations_delete_own"
  ON public.journal_risk_violations
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_risk_violations FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_risk_violations FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_risk_violations TO authenticated;
GRANT ALL ON TABLE public.journal_risk_violations TO service_role;

-- public.journal_process_scores
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_process_scores');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_process_scores_select_own', 'journal_process_scores');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_process_scores_insert_own', 'journal_process_scores');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_process_scores_update_own', 'journal_process_scores');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_process_scores_delete_own', 'journal_process_scores');
  EXECUTE $journal_create$
  CREATE POLICY "journal_process_scores_select_own"
  ON public.journal_process_scores
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_process_scores_insert_own"
  ON public.journal_process_scores
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_process_scores_update_own"
  ON public.journal_process_scores
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_process_scores_delete_own"
  ON public.journal_process_scores
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_process_scores FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_process_scores FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_process_scores TO authenticated;
GRANT ALL ON TABLE public.journal_process_scores TO service_role;

-- public.journal_saved_reports
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_saved_reports');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_saved_reports_select_own', 'journal_saved_reports');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_saved_reports_insert_own', 'journal_saved_reports');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_saved_reports_update_own', 'journal_saved_reports');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_saved_reports_delete_own', 'journal_saved_reports');
  EXECUTE $journal_create$
  CREATE POLICY "journal_saved_reports_select_own"
  ON public.journal_saved_reports
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_saved_reports_insert_own"
  ON public.journal_saved_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_saved_reports_update_own"
  ON public.journal_saved_reports
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_saved_reports_delete_own"
  ON public.journal_saved_reports
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_saved_reports FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_saved_reports FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_saved_reports TO authenticated;
GRANT ALL ON TABLE public.journal_saved_reports TO service_role;

-- public.journal_report_runs
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_report_runs');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_report_runs_select_own', 'journal_report_runs');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_report_runs_insert_own', 'journal_report_runs');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_report_runs_update_own', 'journal_report_runs');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_report_runs_delete_own', 'journal_report_runs');
  EXECUTE $journal_create$
  CREATE POLICY "journal_report_runs_select_own"
  ON public.journal_report_runs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_report_runs_insert_own"
  ON public.journal_report_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_report_runs_update_own"
  ON public.journal_report_runs
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_report_runs_delete_own"
  ON public.journal_report_runs
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_report_runs FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_report_runs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_report_runs TO authenticated;
GRANT ALL ON TABLE public.journal_report_runs TO service_role;

-- public.journal_report_exports
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_report_exports');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_report_exports_select_own', 'journal_report_exports');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_report_exports_insert_own', 'journal_report_exports');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_report_exports_update_own', 'journal_report_exports');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_report_exports_delete_own', 'journal_report_exports');
  EXECUTE $journal_create$
  CREATE POLICY "journal_report_exports_select_own"
  ON public.journal_report_exports
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_report_exports_insert_own"
  ON public.journal_report_exports
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_report_exports_update_own"
  ON public.journal_report_exports
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_report_exports_delete_own"
  ON public.journal_report_exports
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_report_exports FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_report_exports FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_report_exports TO authenticated;
GRANT ALL ON TABLE public.journal_report_exports TO service_role;

-- public.journal_report_schedules
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_report_schedules');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_report_schedules_select_own', 'journal_report_schedules');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_report_schedules_insert_own', 'journal_report_schedules');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_report_schedules_update_own', 'journal_report_schedules');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_report_schedules_delete_own', 'journal_report_schedules');
  EXECUTE $journal_create$
  CREATE POLICY "journal_report_schedules_select_own"
  ON public.journal_report_schedules
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_report_schedules_insert_own"
  ON public.journal_report_schedules
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_report_schedules_update_own"
  ON public.journal_report_schedules
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_report_schedules_delete_own"
  ON public.journal_report_schedules
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_report_schedules FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_report_schedules FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_report_schedules TO authenticated;
GRANT ALL ON TABLE public.journal_report_schedules TO service_role;

-- public.journal_market_context
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_market_context');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_market_context_select_own', 'journal_market_context');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_market_context_insert_own', 'journal_market_context');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_market_context_update_own', 'journal_market_context');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_market_context_delete_own', 'journal_market_context');
  EXECUTE $journal_create$
  CREATE POLICY "journal_market_context_select_own"
  ON public.journal_market_context
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_market_context_insert_own"
  ON public.journal_market_context
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_market_context_update_own"
  ON public.journal_market_context
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_market_context_delete_own"
  ON public.journal_market_context
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_market_context FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_market_context FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_market_context TO authenticated;
GRANT ALL ON TABLE public.journal_market_context TO service_role;

-- public.journal_price_observations
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_price_observations');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_price_observations_select_own', 'journal_price_observations');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_price_observations_insert_own', 'journal_price_observations');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_price_observations_update_own', 'journal_price_observations');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_price_observations_delete_own', 'journal_price_observations');
  EXECUTE $journal_create$
  CREATE POLICY "journal_price_observations_select_own"
  ON public.journal_price_observations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_price_observations_insert_own"
  ON public.journal_price_observations
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_price_observations_update_own"
  ON public.journal_price_observations
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_price_observations_delete_own"
  ON public.journal_price_observations
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_price_observations FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_price_observations FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_price_observations TO authenticated;
GRANT ALL ON TABLE public.journal_price_observations TO service_role;

-- public.journal_valuation_snapshots
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_valuation_snapshots');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_valuation_snapshots_select_own', 'journal_valuation_snapshots');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_valuation_snapshots_insert_own', 'journal_valuation_snapshots');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_valuation_snapshots_update_own', 'journal_valuation_snapshots');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_valuation_snapshots_delete_own', 'journal_valuation_snapshots');
  EXECUTE $journal_create$
  CREATE POLICY "journal_valuation_snapshots_select_own"
  ON public.journal_valuation_snapshots
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_valuation_snapshots_insert_own"
  ON public.journal_valuation_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_valuation_snapshots_update_own"
  ON public.journal_valuation_snapshots
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_valuation_snapshots_delete_own"
  ON public.journal_valuation_snapshots
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_valuation_snapshots FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_valuation_snapshots FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_valuation_snapshots TO authenticated;
GRANT ALL ON TABLE public.journal_valuation_snapshots TO service_role;

-- public.journal_calculation_runs
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_calculation_runs');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_calculation_runs_select_own', 'journal_calculation_runs');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_calculation_runs_insert_own', 'journal_calculation_runs');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_calculation_runs_update_own', 'journal_calculation_runs');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_calculation_runs_delete_own', 'journal_calculation_runs');
  EXECUTE $journal_create$
  CREATE POLICY "journal_calculation_runs_select_own"
  ON public.journal_calculation_runs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_calculation_runs_insert_own"
  ON public.journal_calculation_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_calculation_runs_update_own"
  ON public.journal_calculation_runs
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_calculation_runs_delete_own"
  ON public.journal_calculation_runs
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_calculation_runs FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_calculation_runs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_calculation_runs TO authenticated;
GRANT ALL ON TABLE public.journal_calculation_runs TO service_role;

-- public.journal_trade_sequence_metrics
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_trade_sequence_metrics');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_sequence_metrics_select_own', 'journal_trade_sequence_metrics');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_sequence_metrics_insert_own', 'journal_trade_sequence_metrics');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_sequence_metrics_update_own', 'journal_trade_sequence_metrics');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_sequence_metrics_delete_own', 'journal_trade_sequence_metrics');
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_sequence_metrics_select_own"
  ON public.journal_trade_sequence_metrics
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_sequence_metrics_insert_own"
  ON public.journal_trade_sequence_metrics
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_sequence_metrics_update_own"
  ON public.journal_trade_sequence_metrics
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_sequence_metrics_delete_own"
  ON public.journal_trade_sequence_metrics
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_trade_sequence_metrics FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_trade_sequence_metrics FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_trade_sequence_metrics TO authenticated;
GRANT ALL ON TABLE public.journal_trade_sequence_metrics TO service_role;

-- public.journal_data_quality_issues
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_data_quality_issues');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_data_quality_issues_select_own', 'journal_data_quality_issues');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_data_quality_issues_insert_own', 'journal_data_quality_issues');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_data_quality_issues_update_own', 'journal_data_quality_issues');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_data_quality_issues_delete_own', 'journal_data_quality_issues');
  EXECUTE $journal_create$
  CREATE POLICY "journal_data_quality_issues_select_own"
  ON public.journal_data_quality_issues
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_data_quality_issues_insert_own"
  ON public.journal_data_quality_issues
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_data_quality_issues_update_own"
  ON public.journal_data_quality_issues
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_data_quality_issues_delete_own"
  ON public.journal_data_quality_issues
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_data_quality_issues FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_data_quality_issues FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_data_quality_issues TO authenticated;
GRANT ALL ON TABLE public.journal_data_quality_issues TO service_role;

-- public.journal_daily_metrics
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_daily_metrics');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_daily_metrics_select_own', 'journal_daily_metrics');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_daily_metrics_insert_own', 'journal_daily_metrics');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_daily_metrics_update_own', 'journal_daily_metrics');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_daily_metrics_delete_own', 'journal_daily_metrics');
  EXECUTE $journal_create$
  CREATE POLICY "journal_daily_metrics_select_own"
  ON public.journal_daily_metrics
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_daily_metrics_insert_own"
  ON public.journal_daily_metrics
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_daily_metrics_update_own"
  ON public.journal_daily_metrics
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_daily_metrics_delete_own"
  ON public.journal_daily_metrics
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_daily_metrics FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_daily_metrics FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_daily_metrics TO authenticated;
GRANT ALL ON TABLE public.journal_daily_metrics TO service_role;

-- public.journal_analytics_cache
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_analytics_cache');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_analytics_cache_select_own', 'journal_analytics_cache');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_analytics_cache_insert_own', 'journal_analytics_cache');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_analytics_cache_update_own', 'journal_analytics_cache');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_analytics_cache_delete_own', 'journal_analytics_cache');
  EXECUTE $journal_create$
  CREATE POLICY "journal_analytics_cache_select_own"
  ON public.journal_analytics_cache
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_analytics_cache_insert_own"
  ON public.journal_analytics_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_analytics_cache_update_own"
  ON public.journal_analytics_cache
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_analytics_cache_delete_own"
  ON public.journal_analytics_cache
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_analytics_cache FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_analytics_cache FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_analytics_cache TO authenticated;
GRANT ALL ON TABLE public.journal_analytics_cache TO service_role;

-- public.journal_performance_insights
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_performance_insights');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_performance_insights_select_own', 'journal_performance_insights');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_performance_insights_insert_own', 'journal_performance_insights');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_performance_insights_update_own', 'journal_performance_insights');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_performance_insights_delete_own', 'journal_performance_insights');
  EXECUTE $journal_create$
  CREATE POLICY "journal_performance_insights_select_own"
  ON public.journal_performance_insights
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_performance_insights_insert_own"
  ON public.journal_performance_insights
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_performance_insights_update_own"
  ON public.journal_performance_insights
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_performance_insights_delete_own"
  ON public.journal_performance_insights
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_performance_insights FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_performance_insights FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_performance_insights TO authenticated;
GRANT ALL ON TABLE public.journal_performance_insights TO service_role;

-- public.journal_ai_memories
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_ai_memories');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_memories_select_own', 'journal_ai_memories');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_memories_insert_own', 'journal_ai_memories');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_memories_update_own', 'journal_ai_memories');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_memories_delete_own', 'journal_ai_memories');
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_memories_select_own"
  ON public.journal_ai_memories
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_memories_insert_own"
  ON public.journal_ai_memories
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_memories_update_own"
  ON public.journal_ai_memories
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_memories_delete_own"
  ON public.journal_ai_memories
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_ai_memories FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_ai_memories FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_ai_memories TO authenticated;
GRANT ALL ON TABLE public.journal_ai_memories TO service_role;

-- public.journal_ai_insights
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_ai_insights');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_insights_select_own', 'journal_ai_insights');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_insights_insert_own', 'journal_ai_insights');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_insights_update_own', 'journal_ai_insights');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_insights_delete_own', 'journal_ai_insights');
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_insights_select_own"
  ON public.journal_ai_insights
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_insights_insert_own"
  ON public.journal_ai_insights
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_insights_update_own"
  ON public.journal_ai_insights
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_insights_delete_own"
  ON public.journal_ai_insights
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_ai_insights FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_ai_insights FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_ai_insights TO authenticated;
GRANT ALL ON TABLE public.journal_ai_insights TO service_role;

-- public.journal_ai_conversations
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_ai_conversations');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_conversations_select_own', 'journal_ai_conversations');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_conversations_insert_own', 'journal_ai_conversations');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_conversations_update_own', 'journal_ai_conversations');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_conversations_delete_own', 'journal_ai_conversations');
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_conversations_select_own"
  ON public.journal_ai_conversations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_conversations_insert_own"
  ON public.journal_ai_conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_conversations_update_own"
  ON public.journal_ai_conversations
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_conversations_delete_own"
  ON public.journal_ai_conversations
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_ai_conversations FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_ai_conversations FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_ai_conversations TO authenticated;
GRANT ALL ON TABLE public.journal_ai_conversations TO service_role;

-- public.journal_ai_feedback
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_ai_feedback');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_feedback_select_own', 'journal_ai_feedback');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_feedback_insert_own', 'journal_ai_feedback');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_feedback_update_own', 'journal_ai_feedback');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_feedback_delete_own', 'journal_ai_feedback');
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_feedback_select_own"
  ON public.journal_ai_feedback
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_feedback_insert_own"
  ON public.journal_ai_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_feedback_update_own"
  ON public.journal_ai_feedback
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_feedback_delete_own"
  ON public.journal_ai_feedback
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_ai_feedback FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_ai_feedback FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_ai_feedback TO authenticated;
GRANT ALL ON TABLE public.journal_ai_feedback TO service_role;

-- public.journal_ai_jobs
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_ai_jobs');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_jobs_select_own', 'journal_ai_jobs');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_jobs_insert_own', 'journal_ai_jobs');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_jobs_update_own', 'journal_ai_jobs');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_jobs_delete_own', 'journal_ai_jobs');
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_jobs_select_own"
  ON public.journal_ai_jobs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_jobs_insert_own"
  ON public.journal_ai_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_jobs_update_own"
  ON public.journal_ai_jobs
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_jobs_delete_own"
  ON public.journal_ai_jobs
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_ai_jobs FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_ai_jobs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_ai_jobs TO authenticated;
GRANT ALL ON TABLE public.journal_ai_jobs TO service_role;

-- public.journal_ai_usage
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_ai_usage');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_usage_select_own', 'journal_ai_usage');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_usage_insert_own', 'journal_ai_usage');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_usage_update_own', 'journal_ai_usage');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_usage_delete_own', 'journal_ai_usage');
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_usage_select_own"
  ON public.journal_ai_usage
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_usage_insert_own"
  ON public.journal_ai_usage
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_usage_update_own"
  ON public.journal_ai_usage
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_usage_delete_own"
  ON public.journal_ai_usage
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_ai_usage FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_ai_usage FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_ai_usage TO authenticated;
GRANT ALL ON TABLE public.journal_ai_usage TO service_role;

-- public.journal_import_jobs
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_import_jobs');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_import_jobs_select_own', 'journal_import_jobs');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_import_jobs_insert_own', 'journal_import_jobs');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_import_jobs_update_own', 'journal_import_jobs');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_import_jobs_delete_own', 'journal_import_jobs');
  EXECUTE $journal_create$
  CREATE POLICY "journal_import_jobs_select_own"
  ON public.journal_import_jobs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_import_jobs_insert_own"
  ON public.journal_import_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_import_jobs_update_own"
  ON public.journal_import_jobs
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_import_jobs_delete_own"
  ON public.journal_import_jobs
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_import_jobs FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_import_jobs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_import_jobs TO authenticated;
GRANT ALL ON TABLE public.journal_import_jobs TO service_role;

-- public.journal_import_mappings
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_import_mappings');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_import_mappings_select_own', 'journal_import_mappings');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_import_mappings_insert_own', 'journal_import_mappings');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_import_mappings_update_own', 'journal_import_mappings');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_import_mappings_delete_own', 'journal_import_mappings');
  EXECUTE $journal_create$
  CREATE POLICY "journal_import_mappings_select_own"
  ON public.journal_import_mappings
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_import_mappings_insert_own"
  ON public.journal_import_mappings
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_import_mappings_update_own"
  ON public.journal_import_mappings
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_import_mappings_delete_own"
  ON public.journal_import_mappings
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_import_mappings FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_import_mappings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_import_mappings TO authenticated;
GRANT ALL ON TABLE public.journal_import_mappings TO service_role;

-- public.journal_integrations
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_integrations');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_integrations_select_own', 'journal_integrations');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_integrations_insert_own', 'journal_integrations');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_integrations_update_own', 'journal_integrations');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_integrations_delete_own', 'journal_integrations');
  EXECUTE $journal_create$
  CREATE POLICY "journal_integrations_select_own"
  ON public.journal_integrations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_integrations_insert_own"
  ON public.journal_integrations
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_integrations_update_own"
  ON public.journal_integrations
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_integrations_delete_own"
  ON public.journal_integrations
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_integrations FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_integrations FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_integrations TO authenticated;
GRANT ALL ON TABLE public.journal_integrations TO service_role;

-- public.journal_webhook_endpoints
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_webhook_endpoints');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_webhook_endpoints_select_own', 'journal_webhook_endpoints');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_webhook_endpoints_insert_own', 'journal_webhook_endpoints');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_webhook_endpoints_update_own', 'journal_webhook_endpoints');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_webhook_endpoints_delete_own', 'journal_webhook_endpoints');
  EXECUTE $journal_create$
  CREATE POLICY "journal_webhook_endpoints_select_own"
  ON public.journal_webhook_endpoints
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_webhook_endpoints_insert_own"
  ON public.journal_webhook_endpoints
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_webhook_endpoints_update_own"
  ON public.journal_webhook_endpoints
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_webhook_endpoints_delete_own"
  ON public.journal_webhook_endpoints
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_webhook_endpoints FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_webhook_endpoints FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_webhook_endpoints TO authenticated;
GRANT ALL ON TABLE public.journal_webhook_endpoints TO service_role;

-- public.journal_domain_events
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_domain_events');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_domain_events_select_own', 'journal_domain_events');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_domain_events_insert_own', 'journal_domain_events');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_domain_events_update_own', 'journal_domain_events');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_domain_events_delete_own', 'journal_domain_events');
  EXECUTE $journal_create$
  CREATE POLICY "journal_domain_events_select_own"
  ON public.journal_domain_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_domain_events_insert_own"
  ON public.journal_domain_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_domain_events_update_own"
  ON public.journal_domain_events
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_domain_events_delete_own"
  ON public.journal_domain_events
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_domain_events FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_domain_events FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_domain_events TO authenticated;
GRANT ALL ON TABLE public.journal_domain_events TO service_role;

-- public.journal_event_outbox
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_event_outbox');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_event_outbox_select_own', 'journal_event_outbox');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_event_outbox_insert_own', 'journal_event_outbox');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_event_outbox_update_own', 'journal_event_outbox');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_event_outbox_delete_own', 'journal_event_outbox');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_event_outbox_service_role_all', 'journal_event_outbox');
  EXECUTE $journal_create$
  CREATE POLICY "journal_event_outbox_select_own"
  ON public.journal_event_outbox
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_event_outbox_insert_own"
  ON public.journal_event_outbox
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_event_outbox_update_own"
  ON public.journal_event_outbox
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_event_outbox_delete_own"
  ON public.journal_event_outbox
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_event_outbox_service_role_all"
  ON public.journal_event_outbox
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true)
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_event_outbox FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_event_outbox FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_event_outbox TO authenticated;
GRANT ALL ON TABLE public.journal_event_outbox TO service_role;

-- public.journal_audit_log
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_audit_log');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_audit_log_select_own', 'journal_audit_log');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_audit_log_insert_own', 'journal_audit_log');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_audit_log_update_own', 'journal_audit_log');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_audit_log_delete_own', 'journal_audit_log');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_audit_log_service_role_all', 'journal_audit_log');
  EXECUTE $journal_create$
  CREATE POLICY "journal_audit_log_select_own"
  ON public.journal_audit_log
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_audit_log_insert_own"
  ON public.journal_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_audit_log_update_own"
  ON public.journal_audit_log
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_audit_log_delete_own"
  ON public.journal_audit_log
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_audit_log_service_role_all"
  ON public.journal_audit_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true)
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_audit_log FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_audit_log FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_audit_log TO authenticated;
GRANT ALL ON TABLE public.journal_audit_log TO service_role;

-- public.journal_metric_definitions
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_metric_definitions');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_metric_definitions_select_own', 'journal_metric_definitions');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_metric_definitions_insert_own', 'journal_metric_definitions');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_metric_definitions_update_own', 'journal_metric_definitions');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_metric_definitions_delete_own', 'journal_metric_definitions');
  EXECUTE $journal_create$
  CREATE POLICY "journal_metric_definitions_select_own"
  ON public.journal_metric_definitions
  FOR SELECT
  TO authenticated
  USING ((user_id IS NULL OR user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_metric_definitions_insert_own"
  ON public.journal_metric_definitions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_metric_definitions_update_own"
  ON public.journal_metric_definitions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_metric_definitions_delete_own"
  ON public.journal_metric_definitions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_metric_definitions FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_metric_definitions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_metric_definitions TO authenticated;
GRANT ALL ON TABLE public.journal_metric_definitions TO service_role;

-- public.journal_report_templates
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_report_templates');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_report_templates_select_own', 'journal_report_templates');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_report_templates_insert_own', 'journal_report_templates');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_report_templates_update_own', 'journal_report_templates');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_report_templates_delete_own', 'journal_report_templates');
  EXECUTE $journal_create$
  CREATE POLICY "journal_report_templates_select_own"
  ON public.journal_report_templates
  FOR SELECT
  TO authenticated
  USING ((user_id IS NULL OR user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_report_templates_insert_own"
  ON public.journal_report_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_report_templates_update_own"
  ON public.journal_report_templates
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_report_templates_delete_own"
  ON public.journal_report_templates
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_report_templates FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_report_templates FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_report_templates TO authenticated;
GRANT ALL ON TABLE public.journal_report_templates TO service_role;

-- public.journal_trade_legs
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_trade_legs');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_legs_select_own', 'journal_trade_legs');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_legs_insert_own', 'journal_trade_legs');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_legs_update_own', 'journal_trade_legs');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_legs_delete_own', 'journal_trade_legs');
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_legs_select_own"
  ON public.journal_trade_legs
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_trade_legs.trade_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_legs_insert_own"
  ON public.journal_trade_legs
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_trade_legs.trade_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_legs_update_own"
  ON public.journal_trade_legs
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_trade_legs.trade_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_trade_legs.trade_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_legs_delete_own"
  ON public.journal_trade_legs
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_trade_legs.trade_id AND p.user_id = auth.uid()))
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_trade_legs FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_trade_legs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_trade_legs TO authenticated;
GRANT ALL ON TABLE public.journal_trade_legs TO service_role;

-- public.journal_executions
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_executions');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_executions_select_own', 'journal_executions');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_executions_insert_own', 'journal_executions');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_executions_update_own', 'journal_executions');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_executions_delete_own', 'journal_executions');
  EXECUTE $journal_create$
  CREATE POLICY "journal_executions_select_own"
  ON public.journal_executions
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_executions.trade_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_executions_insert_own"
  ON public.journal_executions
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_executions.trade_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_executions_update_own"
  ON public.journal_executions
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_executions.trade_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_executions.trade_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_executions_delete_own"
  ON public.journal_executions
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_executions.trade_id AND p.user_id = auth.uid()))
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_executions FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_executions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_executions TO authenticated;
GRANT ALL ON TABLE public.journal_executions TO service_role;

-- public.journal_execution_fees
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_execution_fees');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_execution_fees_select_own', 'journal_execution_fees');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_execution_fees_insert_own', 'journal_execution_fees');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_execution_fees_update_own', 'journal_execution_fees');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_execution_fees_delete_own', 'journal_execution_fees');
  EXECUTE $journal_create$
  CREATE POLICY "journal_execution_fees_select_own"
  ON public.journal_execution_fees
  FOR SELECT
  TO authenticated
  USING (EXISTS (
      SELECT 1 FROM public.journal_executions e
      JOIN public.journal_trades p ON p.id = e.trade_id
      WHERE e.id = journal_execution_fees.execution_id AND p.user_id = auth.uid()
    ))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_execution_fees_insert_own"
  ON public.journal_execution_fees
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
      SELECT 1 FROM public.journal_executions e
      JOIN public.journal_trades p ON p.id = e.trade_id
      WHERE e.id = journal_execution_fees.execution_id AND p.user_id = auth.uid()
    ))
  $journal_create$;
  EXECUTE $journal_create$
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
    ))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_execution_fees_delete_own"
  ON public.journal_execution_fees
  FOR DELETE
  TO authenticated
  USING (EXISTS (
      SELECT 1 FROM public.journal_executions e
      JOIN public.journal_trades p ON p.id = e.trade_id
      WHERE e.id = journal_execution_fees.execution_id AND p.user_id = auth.uid()
    ))
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_execution_fees FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_execution_fees FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_execution_fees TO authenticated;
GRANT ALL ON TABLE public.journal_execution_fees TO service_role;

-- public.journal_trade_cash_flows
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_trade_cash_flows');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_cash_flows_select_own', 'journal_trade_cash_flows');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_cash_flows_insert_own', 'journal_trade_cash_flows');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_cash_flows_update_own', 'journal_trade_cash_flows');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_trade_cash_flows_delete_own', 'journal_trade_cash_flows');
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_cash_flows_select_own"
  ON public.journal_trade_cash_flows
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_trade_cash_flows.trade_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_cash_flows_insert_own"
  ON public.journal_trade_cash_flows
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_trade_cash_flows.trade_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_cash_flows_update_own"
  ON public.journal_trade_cash_flows
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_trade_cash_flows.trade_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_trade_cash_flows.trade_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_trade_cash_flows_delete_own"
  ON public.journal_trade_cash_flows
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_trade_cash_flows.trade_id AND p.user_id = auth.uid()))
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_trade_cash_flows FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_trade_cash_flows FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_trade_cash_flows TO authenticated;
GRANT ALL ON TABLE public.journal_trade_cash_flows TO service_role;

-- public.journal_tag_assignments
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_tag_assignments');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_tag_assignments_select_own', 'journal_tag_assignments');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_tag_assignments_insert_own', 'journal_tag_assignments');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_tag_assignments_update_own', 'journal_tag_assignments');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_tag_assignments_delete_own', 'journal_tag_assignments');
  EXECUTE $journal_create$
  CREATE POLICY "journal_tag_assignments_select_own"
  ON public.journal_tag_assignments
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_tag_assignments.trade_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_tag_assignments_insert_own"
  ON public.journal_tag_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_tag_assignments.trade_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_tag_assignments_update_own"
  ON public.journal_tag_assignments
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_tag_assignments.trade_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_tag_assignments.trade_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_tag_assignments_delete_own"
  ON public.journal_tag_assignments
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_tag_assignments.trade_id AND p.user_id = auth.uid()))
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_tag_assignments FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_tag_assignments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_tag_assignments TO authenticated;
GRANT ALL ON TABLE public.journal_tag_assignments TO service_role;

-- public.journal_notebook_links
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_notebook_links');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_notebook_links_select_own', 'journal_notebook_links');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_notebook_links_insert_own', 'journal_notebook_links');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_notebook_links_update_own', 'journal_notebook_links');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_notebook_links_delete_own', 'journal_notebook_links');
  EXECUTE $journal_create$
  CREATE POLICY "journal_notebook_links_select_own"
  ON public.journal_notebook_links
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_notebook_entries p WHERE p.id = journal_notebook_links.entry_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_notebook_links_insert_own"
  ON public.journal_notebook_links
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_notebook_entries p WHERE p.id = journal_notebook_links.entry_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_notebook_links_update_own"
  ON public.journal_notebook_links
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_notebook_entries p WHERE p.id = journal_notebook_links.entry_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_notebook_entries p WHERE p.id = journal_notebook_links.entry_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_notebook_links_delete_own"
  ON public.journal_notebook_links
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_notebook_entries p WHERE p.id = journal_notebook_links.entry_id AND p.user_id = auth.uid()))
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_notebook_links FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_notebook_links FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_notebook_links TO authenticated;
GRANT ALL ON TABLE public.journal_notebook_links TO service_role;

-- public.journal_playbook_check_results
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_playbook_check_results');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_playbook_check_results_select_own', 'journal_playbook_check_results');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_playbook_check_results_insert_own', 'journal_playbook_check_results');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_playbook_check_results_update_own', 'journal_playbook_check_results');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_playbook_check_results_delete_own', 'journal_playbook_check_results');
  EXECUTE $journal_create$
  CREATE POLICY "journal_playbook_check_results_select_own"
  ON public.journal_playbook_check_results
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_playbook_check_results.trade_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_playbook_check_results_insert_own"
  ON public.journal_playbook_check_results
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_playbook_check_results.trade_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_playbook_check_results_update_own"
  ON public.journal_playbook_check_results
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_playbook_check_results.trade_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_playbook_check_results.trade_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_playbook_check_results_delete_own"
  ON public.journal_playbook_check_results
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_trades p WHERE p.id = journal_playbook_check_results.trade_id AND p.user_id = auth.uid()))
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_playbook_check_results FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_playbook_check_results FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_playbook_check_results TO authenticated;
GRANT ALL ON TABLE public.journal_playbook_check_results TO service_role;

-- public.journal_process_score_components
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_process_score_components');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_process_score_components_select_own', 'journal_process_score_components');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_process_score_components_insert_own', 'journal_process_score_components');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_process_score_components_update_own', 'journal_process_score_components');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_process_score_components_delete_own', 'journal_process_score_components');
  EXECUTE $journal_create$
  CREATE POLICY "journal_process_score_components_select_own"
  ON public.journal_process_score_components
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_process_scores p WHERE p.id = journal_process_score_components.process_score_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_process_score_components_insert_own"
  ON public.journal_process_score_components
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_process_scores p WHERE p.id = journal_process_score_components.process_score_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_process_score_components_update_own"
  ON public.journal_process_score_components
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_process_scores p WHERE p.id = journal_process_score_components.process_score_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_process_scores p WHERE p.id = journal_process_score_components.process_score_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_process_score_components_delete_own"
  ON public.journal_process_score_components
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_process_scores p WHERE p.id = journal_process_score_components.process_score_id AND p.user_id = auth.uid()))
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_process_score_components FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_process_score_components FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_process_score_components TO authenticated;
GRANT ALL ON TABLE public.journal_process_score_components TO service_role;

-- public.journal_metric_formula_versions
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_metric_formula_versions');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_metric_formula_versions_select_own', 'journal_metric_formula_versions');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_metric_formula_versions_insert_own', 'journal_metric_formula_versions');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_metric_formula_versions_update_own', 'journal_metric_formula_versions');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_metric_formula_versions_delete_own', 'journal_metric_formula_versions');
  EXECUTE $journal_create$
  CREATE POLICY "journal_metric_formula_versions_select_own"
  ON public.journal_metric_formula_versions
  FOR SELECT
  TO authenticated
  USING (EXISTS (
      SELECT 1 FROM public.journal_metric_definitions p
      WHERE p.id = journal_metric_formula_versions.metric_definition_id
        AND (p.user_id IS NULL OR p.user_id = auth.uid())
    ))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_metric_formula_versions_insert_own"
  ON public.journal_metric_formula_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
      SELECT 1 FROM public.journal_metric_definitions p
      WHERE p.id = journal_metric_formula_versions.metric_definition_id
        AND p.user_id = auth.uid()
    ))
  $journal_create$;
  EXECUTE $journal_create$
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
    ))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_metric_formula_versions_delete_own"
  ON public.journal_metric_formula_versions
  FOR DELETE
  TO authenticated
  USING (EXISTS (
      SELECT 1 FROM public.journal_metric_definitions p
      WHERE p.id = journal_metric_formula_versions.metric_definition_id
        AND p.user_id = auth.uid()
    ))
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_metric_formula_versions FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_metric_formula_versions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_metric_formula_versions TO authenticated;
GRANT ALL ON TABLE public.journal_metric_formula_versions TO service_role;

-- public.journal_report_run_rows
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_report_run_rows');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_report_run_rows_select_own', 'journal_report_run_rows');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_report_run_rows_insert_own', 'journal_report_run_rows');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_report_run_rows_update_own', 'journal_report_run_rows');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_report_run_rows_delete_own', 'journal_report_run_rows');
  EXECUTE $journal_create$
  CREATE POLICY "journal_report_run_rows_select_own"
  ON public.journal_report_run_rows
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_report_runs p WHERE p.id = journal_report_run_rows.report_run_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_report_run_rows_insert_own"
  ON public.journal_report_run_rows
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_report_runs p WHERE p.id = journal_report_run_rows.report_run_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_report_run_rows_update_own"
  ON public.journal_report_run_rows
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_report_runs p WHERE p.id = journal_report_run_rows.report_run_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_report_runs p WHERE p.id = journal_report_run_rows.report_run_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_report_run_rows_delete_own"
  ON public.journal_report_run_rows
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_report_runs p WHERE p.id = journal_report_run_rows.report_run_id AND p.user_id = auth.uid()))
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_report_run_rows FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_report_run_rows FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_report_run_rows TO authenticated;
GRANT ALL ON TABLE public.journal_report_run_rows TO service_role;

-- public.journal_market_context_sources
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_market_context_sources');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_market_context_sources_select_own', 'journal_market_context_sources');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_market_context_sources_insert_own', 'journal_market_context_sources');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_market_context_sources_update_own', 'journal_market_context_sources');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_market_context_sources_delete_own', 'journal_market_context_sources');
  EXECUTE $journal_create$
  CREATE POLICY "journal_market_context_sources_select_own"
  ON public.journal_market_context_sources
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_market_context p WHERE p.id = journal_market_context_sources.market_context_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_market_context_sources_insert_own"
  ON public.journal_market_context_sources
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_market_context p WHERE p.id = journal_market_context_sources.market_context_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_market_context_sources_update_own"
  ON public.journal_market_context_sources
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_market_context p WHERE p.id = journal_market_context_sources.market_context_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_market_context p WHERE p.id = journal_market_context_sources.market_context_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_market_context_sources_delete_own"
  ON public.journal_market_context_sources
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_market_context p WHERE p.id = journal_market_context_sources.market_context_id AND p.user_id = auth.uid()))
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_market_context_sources FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_market_context_sources FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_market_context_sources TO authenticated;
GRANT ALL ON TABLE public.journal_market_context_sources TO service_role;

-- public.journal_calculation_lineage
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_calculation_lineage');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_calculation_lineage_select_own', 'journal_calculation_lineage');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_calculation_lineage_insert_own', 'journal_calculation_lineage');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_calculation_lineage_update_own', 'journal_calculation_lineage');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_calculation_lineage_delete_own', 'journal_calculation_lineage');
  EXECUTE $journal_create$
  CREATE POLICY "journal_calculation_lineage_select_own"
  ON public.journal_calculation_lineage
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_calculation_runs p WHERE p.id = journal_calculation_lineage.calculation_run_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_calculation_lineage_insert_own"
  ON public.journal_calculation_lineage
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_calculation_runs p WHERE p.id = journal_calculation_lineage.calculation_run_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_calculation_lineage_update_own"
  ON public.journal_calculation_lineage
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_calculation_runs p WHERE p.id = journal_calculation_lineage.calculation_run_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_calculation_runs p WHERE p.id = journal_calculation_lineage.calculation_run_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_calculation_lineage_delete_own"
  ON public.journal_calculation_lineage
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_calculation_runs p WHERE p.id = journal_calculation_lineage.calculation_run_id AND p.user_id = auth.uid()))
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_calculation_lineage FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_calculation_lineage FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_calculation_lineage TO authenticated;
GRANT ALL ON TABLE public.journal_calculation_lineage TO service_role;

-- public.journal_ai_memory_evidence
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_ai_memory_evidence');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_memory_evidence_select_own', 'journal_ai_memory_evidence');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_memory_evidence_insert_own', 'journal_ai_memory_evidence');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_memory_evidence_update_own', 'journal_ai_memory_evidence');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_memory_evidence_delete_own', 'journal_ai_memory_evidence');
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_memory_evidence_select_own"
  ON public.journal_ai_memory_evidence
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_ai_memories p WHERE p.id = journal_ai_memory_evidence.memory_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_memory_evidence_insert_own"
  ON public.journal_ai_memory_evidence
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_ai_memories p WHERE p.id = journal_ai_memory_evidence.memory_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_memory_evidence_update_own"
  ON public.journal_ai_memory_evidence
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_ai_memories p WHERE p.id = journal_ai_memory_evidence.memory_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_ai_memories p WHERE p.id = journal_ai_memory_evidence.memory_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_memory_evidence_delete_own"
  ON public.journal_ai_memory_evidence
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_ai_memories p WHERE p.id = journal_ai_memory_evidence.memory_id AND p.user_id = auth.uid()))
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_ai_memory_evidence FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_ai_memory_evidence FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_ai_memory_evidence TO authenticated;
GRANT ALL ON TABLE public.journal_ai_memory_evidence TO service_role;

-- public.journal_ai_messages
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_ai_messages');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_messages_select_own', 'journal_ai_messages');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_messages_insert_own', 'journal_ai_messages');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_messages_update_own', 'journal_ai_messages');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_ai_messages_delete_own', 'journal_ai_messages');
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_messages_select_own"
  ON public.journal_ai_messages
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_ai_conversations p WHERE p.id = journal_ai_messages.conversation_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_messages_insert_own"
  ON public.journal_ai_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_ai_conversations p WHERE p.id = journal_ai_messages.conversation_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_messages_update_own"
  ON public.journal_ai_messages
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_ai_conversations p WHERE p.id = journal_ai_messages.conversation_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_ai_conversations p WHERE p.id = journal_ai_messages.conversation_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_ai_messages_delete_own"
  ON public.journal_ai_messages
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_ai_conversations p WHERE p.id = journal_ai_messages.conversation_id AND p.user_id = auth.uid()))
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_ai_messages FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_ai_messages FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_ai_messages TO authenticated;
GRANT ALL ON TABLE public.journal_ai_messages TO service_role;

-- public.journal_import_rows
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_import_rows');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_import_rows_select_own', 'journal_import_rows');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_import_rows_insert_own', 'journal_import_rows');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_import_rows_update_own', 'journal_import_rows');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_import_rows_delete_own', 'journal_import_rows');
  EXECUTE $journal_create$
  CREATE POLICY "journal_import_rows_select_own"
  ON public.journal_import_rows
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_import_jobs p WHERE p.id = journal_import_rows.import_job_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_import_rows_insert_own"
  ON public.journal_import_rows
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_import_jobs p WHERE p.id = journal_import_rows.import_job_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_import_rows_update_own"
  ON public.journal_import_rows
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_import_jobs p WHERE p.id = journal_import_rows.import_job_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_import_jobs p WHERE p.id = journal_import_rows.import_job_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_import_rows_delete_own"
  ON public.journal_import_rows
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_import_jobs p WHERE p.id = journal_import_rows.import_job_id AND p.user_id = auth.uid()))
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_import_rows FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_import_rows FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_import_rows TO authenticated;
GRANT ALL ON TABLE public.journal_import_rows TO service_role;

-- public.journal_provider_accounts
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_provider_accounts');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_provider_accounts_select_own', 'journal_provider_accounts');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_provider_accounts_insert_own', 'journal_provider_accounts');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_provider_accounts_update_own', 'journal_provider_accounts');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_provider_accounts_delete_own', 'journal_provider_accounts');
  EXECUTE $journal_create$
  CREATE POLICY "journal_provider_accounts_select_own"
  ON public.journal_provider_accounts
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_integrations p WHERE p.id = journal_provider_accounts.integration_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_provider_accounts_insert_own"
  ON public.journal_provider_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_integrations p WHERE p.id = journal_provider_accounts.integration_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_provider_accounts_update_own"
  ON public.journal_provider_accounts
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_integrations p WHERE p.id = journal_provider_accounts.integration_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_integrations p WHERE p.id = journal_provider_accounts.integration_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_provider_accounts_delete_own"
  ON public.journal_provider_accounts
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_integrations p WHERE p.id = journal_provider_accounts.integration_id AND p.user_id = auth.uid()))
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_provider_accounts FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_provider_accounts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_provider_accounts TO authenticated;
GRANT ALL ON TABLE public.journal_provider_accounts TO service_role;

-- public.journal_sync_cursors
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_sync_cursors');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_sync_cursors_select_own', 'journal_sync_cursors');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_sync_cursors_insert_own', 'journal_sync_cursors');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_sync_cursors_update_own', 'journal_sync_cursors');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_sync_cursors_delete_own', 'journal_sync_cursors');
  EXECUTE $journal_create$
  CREATE POLICY "journal_sync_cursors_select_own"
  ON public.journal_sync_cursors
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_integrations p WHERE p.id = journal_sync_cursors.integration_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_sync_cursors_insert_own"
  ON public.journal_sync_cursors
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_integrations p WHERE p.id = journal_sync_cursors.integration_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_sync_cursors_update_own"
  ON public.journal_sync_cursors
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_integrations p WHERE p.id = journal_sync_cursors.integration_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_integrations p WHERE p.id = journal_sync_cursors.integration_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_sync_cursors_delete_own"
  ON public.journal_sync_cursors
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_integrations p WHERE p.id = journal_sync_cursors.integration_id AND p.user_id = auth.uid()))
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_sync_cursors FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_sync_cursors FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_sync_cursors TO authenticated;
GRANT ALL ON TABLE public.journal_sync_cursors TO service_role;

-- public.journal_webhook_deliveries
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_webhook_deliveries');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_webhook_deliveries_select_own', 'journal_webhook_deliveries');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_webhook_deliveries_insert_own', 'journal_webhook_deliveries');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_webhook_deliveries_update_own', 'journal_webhook_deliveries');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_webhook_deliveries_delete_own', 'journal_webhook_deliveries');
  EXECUTE $journal_create$
  CREATE POLICY "journal_webhook_deliveries_select_own"
  ON public.journal_webhook_deliveries
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_webhook_endpoints p WHERE p.id = journal_webhook_deliveries.endpoint_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_webhook_deliveries_insert_own"
  ON public.journal_webhook_deliveries
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_webhook_endpoints p WHERE p.id = journal_webhook_deliveries.endpoint_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_webhook_deliveries_update_own"
  ON public.journal_webhook_deliveries
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_webhook_endpoints p WHERE p.id = journal_webhook_deliveries.endpoint_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_webhook_endpoints p WHERE p.id = journal_webhook_deliveries.endpoint_id AND p.user_id = auth.uid()))
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_webhook_deliveries_delete_own"
  ON public.journal_webhook_deliveries
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_webhook_endpoints p WHERE p.id = journal_webhook_deliveries.endpoint_id AND p.user_id = auth.uid()))
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_webhook_deliveries FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_webhook_deliveries FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_webhook_deliveries TO authenticated;
GRANT ALL ON TABLE public.journal_webhook_deliveries TO service_role;

-- public.journal_dead_letters
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_dead_letters');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_dead_letters_select_own', 'journal_dead_letters');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_dead_letters_insert_own', 'journal_dead_letters');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_dead_letters_update_own', 'journal_dead_letters');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_dead_letters_delete_own', 'journal_dead_letters');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_dead_letters_service_role_all', 'journal_dead_letters');
  EXECUTE $journal_create$
  CREATE POLICY "journal_dead_letters_select_own"
  ON public.journal_dead_letters
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_dead_letters_insert_own"
  ON public.journal_dead_letters
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_dead_letters_update_own"
  ON public.journal_dead_letters
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_dead_letters_delete_own"
  ON public.journal_dead_letters
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_dead_letters_service_role_all"
  ON public.journal_dead_letters
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true)
  $journal_create$;
END;
$journal_pol$;
REVOKE ALL ON TABLE public.journal_dead_letters FROM PUBLIC;
REVOKE ALL ON TABLE public.journal_dead_letters FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_dead_letters TO authenticated;
GRANT ALL ON TABLE public.journal_dead_letters TO service_role;

-- journal-private must be created separately through Lovable's supported
-- storage tooling. The bucket must be private. This migration defines the
-- storage.objects policies but intentionally does not create the bucket.
-- Object paths: {user_id}/imports/, {user_id}/attachments/, {user_id}/exports/

-- storage.objects
-- The migration role is not the owner of this catalog table, so this
-- block does not enable RLS here. Supabase already has RLS enabled.
-- Replace only the four journal-private policy names.
DO $journal_pol$
BEGIN
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
$journal_pol$;
