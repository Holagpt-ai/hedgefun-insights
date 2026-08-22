import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertGeneratedMatchesMap,
  segmentByKind,
  verifyCanonicalMigrations,
} from "./canonical.mjs";
import { SIZE_LIMIT, toLf, utf8Bytes, wrapAtomic } from "./sql-pack.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(ROOT, "supabase/migrations");
const FORMER = "20260816191210_journal_legacy_acl_hardening.sql";
const NAME = segmentByKind("legacy-acl").productionFile;

const TABLE_NAMES = [
  "journal_trades",
  "journal_notes",
  "journal_stats_cache",
  "journal_equity_snapshots",
  "journal_imports",
  "journal_trader_profiles",
  "journal_accounts",
  "journal_account_balance_snapshots",
  "journal_goals",
  "journal_risk_rules",
  "journal_coaching_commitments",
  "journal_cash_ledger_entries",
  "journal_balance_reconciliations",
  "journal_currency_conversions",
  "journal_trade_legs",
  "journal_executions",
  "journal_execution_fees",
  "journal_trade_cash_flows",
  "journal_trade_plans",
  "journal_trade_reviews",
  "journal_trade_context",
  "journal_trade_relationships",
  "journal_trade_markers",
  "journal_attachments",
  "journal_tags",
  "journal_tag_assignments",
  "journal_notebooks",
  "journal_notebook_entries",
  "journal_notebook_links",
  "journal_sessions",
  "journal_daily_reviews",
  "journal_playbooks",
  "journal_playbook_versions",
  "journal_playbook_rules",
  "journal_playbook_check_results",
  "journal_risk_violations",
  "journal_process_scores",
  "journal_process_score_components",
  "journal_metric_definitions",
  "journal_metric_formula_versions",
  "journal_report_templates",
  "journal_saved_reports",
  "journal_report_runs",
  "journal_report_run_rows",
  "journal_report_exports",
  "journal_report_schedules",
  "journal_market_context",
  "journal_market_context_sources",
  "journal_price_observations",
  "journal_valuation_snapshots",
  "journal_calculation_runs",
  "journal_calculation_lineage",
  "journal_trade_sequence_metrics",
  "journal_data_quality_issues",
  "journal_daily_metrics",
  "journal_analytics_cache",
  "journal_performance_insights",
  "journal_ai_memories",
  "journal_ai_memory_evidence",
  "journal_ai_insights",
  "journal_ai_conversations",
  "journal_ai_messages",
  "journal_ai_feedback",
  "journal_ai_jobs",
  "journal_ai_usage",
  "journal_import_jobs",
  "journal_import_rows",
  "journal_import_mappings",
  "journal_integrations",
  "journal_provider_accounts",
  "journal_sync_cursors",
  "journal_webhook_endpoints",
  "journal_webhook_deliveries",
  "journal_domain_events",
  "journal_event_outbox",
  "journal_audit_log",
  "journal_dead_letters",
];

const LEGACY = [
  "journal_trades",
  "journal_notes",
  "journal_equity_snapshots",
  "journal_stats_cache",
  "journal_imports",
];

function sqlArray(values) {
  return `ARRAY[\n    ${values.map((v) => `'${v}'`).join(",\n    ")}\n  ]`;
}

const tablesSql = sqlArray(TABLE_NAMES);
const legacySql = sqlArray(LEGACY);

const preflight = `DO $journal_acl_pre$
DECLARE
  t text;
  v_priv text;
  v_has boolean;
  v_rel pg_class%ROWTYPE;
  r record;
  v_pg17 boolean := current_setting('server_version_num')::integer >= 170000;
  v_tables constant text[] := ${tablesSql};
  v_legacy constant text[] := ${legacySql};
  v_crud constant text[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
  v_elev constant text[] := ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER'];
BEGIN
  FOREACH t IN ARRAY v_legacy LOOP
    SELECT c.* INTO v_rel
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = t
      AND c.relkind = 'r';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'preflight: missing table public.%', t;
    END IF;
    IF NOT v_rel.relrowsecurity THEN
      RAISE EXCEPTION 'preflight: public.% is missing row level security', t;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND policyname = t || '_select_own'
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND policyname = t || '_insert_own'
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND policyname = t || '_update_own'
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND policyname = t || '_delete_own'
    ) THEN
      RAISE EXCEPTION
        'preflight: public.% is missing the four authenticated CRUD policies',
        t;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'journal_notes'
      AND policyname = 'journal_notes_select_own'
      AND coalesce(qual, '') LIKE '%user_id = auth.uid()%'
      AND coalesce(qual, '') LIKE '%EXISTS%'
      AND coalesce(qual, '') LIKE '%t.id = journal_notes.trade_id%'
      AND coalesce(qual, '') LIKE '%t.user_id = auth.uid()%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'journal_notes'
      AND policyname = 'journal_notes_insert_own'
      AND coalesce(with_check, '') LIKE '%user_id = auth.uid()%'
      AND coalesce(with_check, '') LIKE '%t.id = journal_notes.trade_id%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'journal_notes'
      AND policyname = 'journal_notes_update_own'
      AND coalesce(qual, '') LIKE '%t.id = journal_notes.trade_id%'
      AND coalesce(with_check, '') LIKE '%t.id = journal_notes.trade_id%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'journal_notes'
      AND policyname = 'journal_notes_delete_own'
      AND coalesce(qual, '') LIKE '%t.id = journal_notes.trade_id%'
  ) THEN
    RAISE EXCEPTION
      'preflight: journal_notes is missing parent-trade ownership predicates';
  END IF;

  FOREACH t IN ARRAY v_tables LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t
        AND c.relkind = 'r'
    ) THEN
      RAISE EXCEPTION 'preflight: missing table public.%', t;
    END IF;

    FOREACH v_priv IN ARRAY v_crud LOOP
      IF NOT has_table_privilege('authenticated', 'public.' || t, v_priv) THEN
        RAISE EXCEPTION
          'preflight: authenticated missing % on public.%',
          v_priv,
          t;
      END IF;
    END LOOP;

    FOREACH v_priv IN ARRAY v_elev LOOP
      v_has := has_table_privilege('authenticated', 'public.' || t, v_priv);
      IF v_has AND NOT (t = ANY (v_legacy)) THEN
        RAISE EXCEPTION
          'preflight: unexpected authenticated % on public.%',
          v_priv,
          t;
      END IF;
    END LOOP;

    IF v_pg17 THEN
      v_has := has_table_privilege('authenticated', 'public.' || t, 'MAINTAIN');
      IF v_has AND NOT (t = ANY (v_legacy)) THEN
        RAISE EXCEPTION
          'preflight: unexpected authenticated MAINTAIN on public.%',
          t;
      END IF;
    END IF;
  END LOOP;

  FOR r IN
    SELECT c.relname, a.privilege_type, a.is_grantable
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, ARRAY[]::aclitem[])) a
    JOIN pg_roles g ON g.oid = a.grantee
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname = ANY (v_tables)
      AND g.rolname = 'authenticated'
  LOOP
    IF r.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE') THEN
      IF r.is_grantable THEN
        RAISE EXCEPTION
          'preflight: unexpected grant option for authenticated % on public.%',
          r.privilege_type,
          r.relname;
      END IF;
      CONTINUE;
    END IF;
    IF r.privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')
       AND r.relname = ANY (v_legacy)
    THEN
      CONTINUE;
    END IF;
    RAISE EXCEPTION
      'preflight: unexpected authenticated % on public.%',
      r.privilege_type,
      r.relname;
  END LOOP;
END;
$journal_acl_pre$`;

const mutate = `DO $journal_acl_mut$
DECLARE
  t text;
  v_legacy constant text[] := ${legacySql};
  v_pg17 boolean := current_setting('server_version_num')::integer >= 170000;
BEGIN
  FOREACH t IN ARRAY v_legacy LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM authenticated',
      t
    );
    IF v_pg17 THEN
      EXECUTE format(
        'REVOKE MAINTAIN ON TABLE public.%I FROM authenticated',
        t
      );
    END IF;
  END LOOP;
END;
$journal_acl_mut$`;

const header = `-- Stocksist Trading Journal legacy ACL hardening.
-- Revokes leftover authenticated TRUNCATE/REFERENCES/TRIGGER/MAINTAIN from
-- the five live tables only. CRUD remains. Does not change policies, RLS,
-- service_role, anon, PUBLIC, defaults, functions, or storage.
-- Mutation uses the exact five-table list, not journal_%.
-- MAINTAIN is revoked through dynamic SQL only on PostgreSQL 17+.
`;

const wrapped = wrapAtomic([preflight, mutate], { header });
const sql = toLf(wrapped.sql);
const bytes = utf8Bytes(sql);
if (bytes > SIZE_LIMIT) {
  throw new Error(`${NAME} generated ${bytes} bytes, exceeds ${SIZE_LIMIT}`);
}
assertGeneratedMatchesMap(FORMER, wrapped.digest);
if (!existsSync(resolve(OUT, segmentByKind("policy").productionFile))) {
  throw new Error("policy migration missing");
}
verifyCanonicalMigrations();
console.log(`verified ${NAME} ${bytes} ${wrapped.digest} (canonical SQL not rewritten)`);
