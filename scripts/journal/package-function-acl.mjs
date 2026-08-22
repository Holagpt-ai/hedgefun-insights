import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertGeneratedMatchesMap,
  segmentByFormer,
  segmentByKind,
  verifyCanonicalMigrations,
} from "./canonical.mjs";
import { SIZE_LIMIT, toLf, utf8Bytes, wrapAtomic } from "./sql-pack.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(ROOT, "supabase/migrations");
const FORMER = "20260816191400_journal_function_acl_hardening.sql";
const NAME = segmentByKind("function-acl").productionFile;
const SANDBOX = "sandbox_exec_zcjptaolpumhtlwhlemq";

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

const CANON = [
  "journal_calculate_trade_v1(uuid)",
  "journal_refresh_derived(uuid)",
  "journal_backfill_accounts_and_executions(uuid)",
  "journal_migrate_legacy_trades()",
  "journal_import_rollback(uuid)",
  "journal_save_trade_v1(jsonb)",
  "journal_import_start_v1(jsonb)",
  "journal_import_row_v1(uuid, uuid, jsonb)",
  "journal_import_finalize_v1(uuid)",
];

const TARGETS = [
  "journal_backfill_accounts_and_executions(uuid)",
  "journal_migrate_legacy_trades()",
  "journal_import_rollback(uuid)",
];

function sqlArray(values) {
  return `ARRAY[\n    ${values.map((v) => `'${v}'`).join(",\n    ")}\n  ]`;
}

const inspectFn = `v_oid := to_regprocedure('public.' || sig);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION '%: missing function public.%', v_phase, sig;
    END IF;
    SELECT p.* INTO STRICT v_proc FROM pg_proc p WHERE p.oid = v_oid;
    IF v_proc.prosecdef THEN
      RAISE EXCEPTION '%: public.% is SECURITY DEFINER', v_phase, sig;
    END IF;
    IF v_proc.proconfig IS NULL
       OR NOT ('search_path=public' = ANY (v_proc.proconfig)) THEN
      RAISE EXCEPTION '%: public.% is missing search_path=public', v_phase, sig;
    END IF;`;

const inspectSandboxTables = `v_postgres := (SELECT oid FROM pg_roles WHERE rolname = 'postgres');
    v_extra := ARRAY[
      'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
    ];
    IF current_setting('server_version_num')::integer >= 170000 THEN
      v_extra := v_extra || ARRAY['MAINTAIN']::text[];
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_auth_members m
      WHERE m.member = v_role.oid
    ) THEN
      RAISE EXCEPTION '%: sandbox role % has unexpected memberships', v_phase, v_sandbox;
    END IF;
    FOREACH t IN ARRAY v_tables LOOP
      SELECT c.relacl INTO v_acl
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = t;
      IF NOT FOUND THEN
        RAISE EXCEPTION '%: missing Journal table public.%', v_phase, t;
      END IF;
      SELECT
        count(*) FILTER (WHERE a.privilege_type = 'SELECT'),
        count(*) FILTER (WHERE a.privilege_type = 'INSERT'),
        count(*),
        coalesce(bool_or(a.is_grantable), false),
        coalesce(bool_or(a.grantor IS DISTINCT FROM v_postgres), false)
      INTO v_sel, v_ins, v_n, v_grantable, v_bad_grantor
      FROM aclexplode(coalesce(v_acl, ARRAY[]::aclitem[])) a
      WHERE a.grantee = v_role.oid;
      IF v_sel IS DISTINCT FROM 1
         OR v_ins IS DISTINCT FROM 1
         OR v_n IS DISTINCT FROM 2 THEN
        RAISE EXCEPTION
          '%: sandbox table ACL footprint mismatch on public.%',
          v_phase,
          t;
      END IF;
      IF v_grantable THEN
        RAISE EXCEPTION '%: sandbox has grant option on public.%', v_phase, t;
      END IF;
      IF v_bad_grantor THEN
        RAISE EXCEPTION '%: sandbox table grantor is not postgres on public.%', v_phase, t;
      END IF;
      FOREACH v_priv IN ARRAY v_extra LOOP
        IF has_table_privilege(v_sandbox, 'public.' || t, v_priv) THEN
          RAISE EXCEPTION '%: sandbox has extra % on public.%', v_phase, v_priv, t;
        END IF;
      END LOOP;
    END LOOP;`;

const preflight = `DO $journal_fn_pre$
DECLARE
  sig text;
  t text;
  v_priv text;
  v_oid regprocedure;
  v_proc pg_proc%ROWTYPE;
  v_role pg_roles%ROWTYPE;
  r record;
  v_phase text := 'preflight';
  v_public boolean;
  v_acl aclitem[];
  v_sel int;
  v_ins int;
  v_n int;
  v_grantable boolean;
  v_bad_grantor boolean;
  v_postgres oid;
  v_extra text[];
  v_sandbox constant text := '${SANDBOX}';
  v_canon constant text[] := ${sqlArray(CANON)};
  v_targets constant text[] := ${sqlArray(TARGETS)};
  v_tables constant text[] := ${sqlArray(TABLE_NAMES)};
BEGIN
  IF cardinality(v_tables) IS DISTINCT FROM 77 THEN
    RAISE EXCEPTION 'preflight: Journal table count is %', cardinality(v_tables);
  END IF;
  IF cardinality(v_canon) IS DISTINCT FROM 9 THEN
    RAISE EXCEPTION 'preflight: canonical Journal function count is %', cardinality(v_canon);
  END IF;

  FOREACH sig IN ARRAY v_canon LOOP
    ${inspectFn}
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'preflight: authenticated missing EXECUTE on public.%', sig;
    END IF;
    IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'preflight: service_role missing EXECUTE on public.%', sig;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) a
      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) INTO v_public;
    IF v_public AND NOT (sig = ANY (v_targets)) THEN
      RAISE EXCEPTION 'preflight: unexpected PUBLIC EXECUTE on public.%', sig;
    END IF;

    FOR r IN
      SELECT a.grantee, a.privilege_type, a.is_grantable, g.rolname
      FROM aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) a
      LEFT JOIN pg_roles g ON g.oid = a.grantee
    LOOP
      IF r.is_grantable THEN
        RAISE EXCEPTION 'preflight: unexpected grant option on public.%', sig;
      END IF;
      IF r.privilege_type IS DISTINCT FROM 'EXECUTE' THEN
        RAISE EXCEPTION 'preflight: unexpected % on public.%', r.privilege_type, sig;
      END IF;
      IF r.grantee = 0 THEN
        IF NOT (sig = ANY (v_targets)) THEN
          RAISE EXCEPTION 'preflight: unexpected PUBLIC EXECUTE on public.%', sig;
        END IF;
        CONTINUE;
      END IF;
      IF r.rolname IN ('anon', 'authenticated', 'service_role') THEN
        CONTINUE;
      END IF;
      IF r.rolname = v_sandbox THEN
        CONTINUE;
      END IF;
      IF r.grantee = v_proc.proowner THEN
        CONTINUE;
      END IF;
      IF coalesce(r.rolname, '') LIKE 'sandbox_exec%' THEN
        RAISE EXCEPTION
          'preflight: unexpected sandbox_exec grantee % on public.%',
          r.rolname,
          sig;
      END IF;
      RAISE EXCEPTION
        'preflight: unexpected grantee % on public.%',
        coalesce(r.rolname, r.grantee::text),
        sig;
    END LOOP;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_sandbox) THEN
    SELECT * INTO STRICT v_role FROM pg_roles WHERE rolname = v_sandbox;
    IF v_role.rolsuper OR NOT v_role.rolinherit OR v_role.rolcreaterole
       OR v_role.rolcreatedb OR NOT v_role.rolcanlogin
       OR v_role.rolreplication OR NOT v_role.rolbypassrls THEN
      RAISE EXCEPTION 'preflight: sandbox role % has unexpected attributes', v_sandbox;
    END IF;
    FOREACH sig IN ARRAY v_canon LOOP
      IF NOT has_function_privilege(v_sandbox, 'public.' || sig, 'EXECUTE') THEN
        RAISE EXCEPTION 'preflight: sandbox missing EXECUTE on public.%', sig;
      END IF;
    END LOOP;
    ${inspectSandboxTables}
  END IF;
END;
$journal_fn_pre$`;

const postcondition = `DO $journal_fn_post$
DECLARE
  sig text;
  t text;
  v_priv text;
  v_oid regprocedure;
  v_proc pg_proc%ROWTYPE;
  v_role pg_roles%ROWTYPE;
  r record;
  v_phase text := 'postcondition';
  v_public boolean;
  v_acl aclitem[];
  v_sel int;
  v_ins int;
  v_n int;
  v_grantable boolean;
  v_bad_grantor boolean;
  v_postgres oid;
  v_extra text[];
  v_sandbox constant text := '${SANDBOX}';
  v_canon constant text[] := ${sqlArray(CANON)};
  v_tables constant text[] := ${sqlArray(TABLE_NAMES)};
BEGIN
  FOREACH sig IN ARRAY v_canon LOOP
    ${inspectFn}
    SELECT EXISTS (
      SELECT 1
      FROM aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) a
      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) INTO v_public;
    IF v_public THEN
      RAISE EXCEPTION 'postcondition: PUBLIC still has EXECUTE on public.%', sig;
    END IF;
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'postcondition: anon still has EXECUTE on public.%', sig;
    END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'postcondition: authenticated lost EXECUTE on public.%', sig;
    END IF;
    IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'postcondition: service_role lost EXECUTE on public.%', sig;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_sandbox)
       AND NOT has_function_privilege(v_sandbox, v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'postcondition: sandbox lost EXECUTE on public.%', sig;
    END IF;
    FOR r IN
      SELECT a.grantee, a.privilege_type, a.is_grantable, g.rolname
      FROM aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) a
      LEFT JOIN pg_roles g ON g.oid = a.grantee
    LOOP
      IF r.is_grantable OR r.privilege_type IS DISTINCT FROM 'EXECUTE' THEN
        RAISE EXCEPTION 'postcondition: unexpected privilege state on public.%', sig;
      END IF;
      IF r.grantee = 0 OR r.rolname = 'anon' THEN
        RAISE EXCEPTION 'postcondition: PUBLIC/anon EXECUTE remains on public.%', sig;
      END IF;
      IF r.rolname IN ('authenticated', 'service_role')
         OR r.rolname = v_sandbox
         OR r.grantee = v_proc.proowner THEN
        CONTINUE;
      END IF;
      RAISE EXCEPTION
        'postcondition: unexpected grantee % on public.%',
        coalesce(r.rolname, r.grantee::text),
        sig;
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_sandbox) THEN
    SELECT * INTO STRICT v_role FROM pg_roles WHERE rolname = v_sandbox;
    ${inspectSandboxTables}
  END IF;
END;
$journal_fn_post$`;

const revokes = [
  ...TARGETS.map((sig) => `REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC`),
  ...CANON.map((sig) => `REVOKE ALL ON FUNCTION public.${sig} FROM anon`),
];

const header = `-- Stocksist Trading Journal function ACL hardening.
-- Twelve targeted revokes: PUBLIC EXECUTE from the three operator
-- functions, and anon EXECUTE from all nine canonical functions.
-- Preserves authenticated, service_role, owner, and
-- sandbox_exec_zcjptaolpumhtlwhlemq EXECUTE plus that role's
-- production SELECT/INSERT table ACL footprint. Does not GRANT
-- or REVOKE table privileges. Plain sandbox_exec is not a function grantee.
-- CREATE OR REPLACE FUNCTION preserves existing ACLs. A future
-- DROP FUNCTION followed by CREATE FUNCTION reapplies production
-- default privileges and may restore anon and sandbox EXECUTE.
-- Any future drop/recreate of these nine functions must be followed
-- by this hardening migration or equivalent explicit revocations.
-- Do not change ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public.
`;

const wrapped = wrapAtomic([preflight, ...revokes, postcondition], { header });
const sql = toLf(wrapped.sql);
const bytes = utf8Bytes(sql);
if (bytes > SIZE_LIMIT) {
  throw new Error(`${NAME} generated ${bytes} bytes, exceeds ${SIZE_LIMIT}`);
}
assertGeneratedMatchesMap(FORMER, wrapped.digest);
if (!existsSync(resolve(OUT, segmentByFormer("20260816191390_journal_fn_import_finalize.sql").productionFile))) {
  throw new Error("import finalize migration missing");
}
verifyCanonicalMigrations();
console.log(`verified ${NAME} ${bytes} ${wrapped.digest} (canonical SQL not rewritten)`);
