import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertGeneratedMatchesMap,
  canonicalRecord,
  segmentByKind,
  writeIntegrityManifest,
} from "./canonical.mjs";
import {
  extractFunction,
  md5Statements,
  SIZE_LIMIT,
  sliceBetween,
  splitSqlStatements,
  toLf,
  utf8Bytes,
  wrapAtomic,
} from "./sql-pack.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = resolve(ROOT, "scripts/journal/approved-baseline");
const OUT = resolve(ROOT, "supabase/migrations");

const OLD_FILES = [
  "20260816190000_journal_foundation_schema.sql",
  "20260816190100_journal_rls_storage.sql",
  "20260816190200_journal_functions_backfill.sql",
];

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

const PARENTS = [
  ["journal_trade_legs", "journal_trades", "trade_id"],
  ["journal_executions", "journal_trades", "trade_id"],
  ["journal_trade_cash_flows", "journal_trades", "trade_id"],
  ["journal_tag_assignments", "journal_trades", "trade_id"],
  ["journal_notebook_links", "journal_notebook_entries", "entry_id"],
  ["journal_playbook_check_results", "journal_trades", "trade_id"],
  ["journal_process_score_components", "journal_process_scores", "process_score_id"],
  ["journal_report_run_rows", "journal_report_runs", "report_run_id"],
  ["journal_market_context_sources", "journal_market_context", "market_context_id"],
  ["journal_calculation_lineage", "journal_calculation_runs", "calculation_run_id"],
  ["journal_ai_memory_evidence", "journal_ai_memories", "memory_id"],
  ["journal_ai_messages", "journal_ai_conversations", "conversation_id"],
  ["journal_import_rows", "journal_import_jobs", "import_job_id"],
  ["journal_provider_accounts", "journal_integrations", "integration_id"],
  ["journal_sync_cursors", "journal_integrations", "integration_id"],
  ["journal_webhook_deliveries", "journal_webhook_endpoints", "endpoint_id"],
];

const LEGACY = [
  ["journal_trades", "Users can manage own trades"],
  ["journal_notes", "Users can manage own notes"],
  ["journal_equity_snapshots", "Users can manage own equity snapshots"],
  ["journal_imports", "Users can manage own imports"],
  ["journal_stats_cache", "Users can manage own stats cache"],
];

const SERVICE = ["journal_event_outbox", "journal_audit_log", "journal_dead_letters"];

const NOTES_PRED = `journal_notes.user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.journal_trades t
      WHERE t.id = journal_notes.trade_id
        AND t.user_id = auth.uid()
    )`;

const FEES_PRED = `EXISTS (
      SELECT 1 FROM public.journal_executions e
      JOIN public.journal_trades p ON p.id = e.trade_id
      WHERE e.id = journal_execution_fees.execution_id AND p.user_id = auth.uid()
    )`;

const USER_PRED = "user_id = auth.uid()";
const CATALOG = ["journal_metric_definitions", "journal_report_templates"];
const CATALOG_SELECT_PRED = "(user_id IS NULL OR user_id = auth.uid())";
const FORMULA_SELECT_PRED = `EXISTS (
      SELECT 1 FROM public.journal_metric_definitions p
      WHERE p.id = journal_metric_formula_versions.metric_definition_id
        AND (p.user_id IS NULL OR p.user_id = auth.uid())
    )`;
const FORMULA_WRITE_PRED = `EXISTS (
      SELECT 1 FROM public.journal_metric_definitions p
      WHERE p.id = journal_metric_formula_versions.metric_definition_id
        AND p.user_id = auth.uid()
    )`;
const PARENT_TEMPLATE =
  "EXISTS (SELECT 1 FROM public.%I p WHERE p.id = %I.%I AND p.user_id = auth.uid())";
const NO_USER_ID_SPECIAL = ["journal_execution_fees", "journal_metric_formula_versions"];

const files = [];

function emit(formerName, sql, extra = {}) {
  const generatedBytes = utf8Bytes(toLf(sql));
  if (generatedBytes > SIZE_LIMIT) {
    throw new Error(`${formerName} generated ${generatedBytes} bytes, exceeds ${SIZE_LIMIT}`);
  }
  assertGeneratedMatchesMap(formerName, extra.digest ?? null);
  const rec = canonicalRecord(formerName, extra.kind);
  files.push(rec);
  console.log(`verified ${rec.file} ${rec.bytes} ${rec.digest} (canonical SQL not rewritten)`);
  return rec;
}

function wrapFile(name, statements, header, kind) {
  const wrapped = wrapAtomic(statements, { header });
  return emit(name, wrapped.sql, { digest: wrapped.digest, kind });
}

function packageFoundation(src) {
  const guardHeader = `-- Stocksist Trading Journal foundation guard.
-- Additive / idempotent-safe-ish. Does not drop existing journal_* or legacy trade tables.
--
-- Fail-closed under an unproven migration runner that may autocommit each
-- top-level statement. This file creates no functions, trigger functions,
-- sequences, views, or types. Triggers reuse public.set_updated_at() only.
--
-- Recovery if this sequence stops after default-privilege quarantine and before
-- restore: existing tables stay operational (ALTER DEFAULT PRIVILEGES does
-- not change them). Partially created Journal tables stay inaccessible to
-- anon/authenticated. Retry the remaining foundation migrations, or restore
-- defaults as the same role that applied the quarantine:
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
-- Do not GRANT table defaults to PUBLIC. Do not create public rollback tables.
--
-- This segment contains only live-state preflight and default TABLE privilege
-- quarantine. No table creation happens here.
`;

  const preflight = splitSqlStatements(
    sliceBetween(src, "-- Preflight:", "-- Quarantine default TABLE privileges"),
  );
  const quarantine = splitSqlStatements(
    sliceBetween(src, "-- Quarantine default TABLE privileges", "-- Existing canonical tables"),
  );
  wrapFile(
    "20260816191000_journal_foundation_guard.sql",
    [...preflight, ...quarantine],
    guardHeader,
    "foundation-guard",
  );

  const live = splitSqlStatements(
    sliceBetween(src, "-- Existing canonical tables", "-- Extend journal_trades"),
  );
  wrapFile(
    "20260816191010_journal_foundation_live_tables.sql",
    live,
    `-- Existing canonical tables (create only if a fresh environment is missing them).
-- Live grants/policies on these five are not revoked or replaced here.
-- Default TABLE privileges remain quarantined until foundation finalization.
`,
    "foundation-live",
  );

  const extend = splitSqlStatements(
    sliceBetween(src, "-- Extend journal_trades", "-- Identity, accounts, goals, risk"),
  );
  wrapFile(
    "20260816191020_journal_foundation_trades_extend.sql",
    extend,
    `-- Extend journal_trades without breaking side / status / qty.
-- DROP and recreate of journal_trades_source_not_demo stay in this atomic segment.
`,
    "foundation-extend",
  );

  const batches = [
    [
      "20260816191030_journal_foundation_identity.sql",
      "-- Identity, accounts, goals, risk",
      "-- Cash / balances / FX",
    ],
    [
      "20260816191040_journal_foundation_cash.sql",
      "-- Cash / balances / FX",
      "-- Trade graph (children of journal_trades)",
    ],
    [
      "20260816191050_journal_foundation_trade_graph.sql",
      "-- Trade graph (children of journal_trades)",
      "-- Notebooks, sessions, playbooks, process",
    ],
    [
      "20260816191060_journal_foundation_notebooks.sql",
      "-- Notebooks, sessions, playbooks, process",
      "-- Metrics, reports",
    ],
    [
      "20260816191070_journal_foundation_metrics.sql",
      "-- Metrics, reports",
      "-- Market context, calculations, analytics",
    ],
    [
      "20260816191080_journal_foundation_market.sql",
      "-- Market context, calculations, analytics",
      "-- AI",
    ],
    [
      "20260816191090_journal_foundation_ai.sql",
      "-- AI",
      "-- Imports / integrations (no secrets)",
    ],
    [
      "20260816191100_journal_foundation_imports.sql",
      "-- Imports / integrations (no secrets)",
      "-- Domain events / outbox / audit",
    ],
    [
      "20260816191110_journal_foundation_events.sql",
      "-- Domain events / outbox / audit",
      "-- Late FKs for journal_trades and notebook links",
    ],
  ];

  for (const [name, start, end] of batches) {
    wrapFile(
      name,
      splitSqlStatements(sliceBetween(src, start, end)),
      `${start} (runner-sized atomic segment).\n-- Default TABLE privileges remain quarantined.\n`,
      "foundation-batch",
    );
  }

  const finalizeSql = src.slice(src.indexOf("-- Late FKs for journal_trades and notebook links"));
  wrapFile(
    "20260816191120_journal_foundation_finalize.sql",
    splitSqlStatements(finalizeSql),
    `-- Late foreign keys, indexes, updated_at triggers, exact 77-table harden,
-- and restore of anon/authenticated default TABLE privileges.
-- PUBLIC default table grant is never restored.
-- Harden tables created by this migration. Exact allowlist — not journal_%.
-- Live tables that already have policies keep their grants and policies.
`,
    "foundation-finalize",
  );
}

function sqlArray(values) {
  return `ARRAY[\n    ${values.map((v) => `'${v.replaceAll("'", "''")}'`).join(",\n    ")}\n  ]`;
}

function tablesWithoutUserId(src) {
  const missing = [];
  const re = /CREATE TABLE IF NOT EXISTS public\.([a-z0-9_]+) \(([\s\S]*?)\n\)/g;
  let match;
  while ((match = re.exec(src))) {
    if (!/\buser_id\b/.test(match[2])) missing.push(match[1]);
  }
  return missing;
}

function assertChildPolicyCoverage(foundationSrc) {
  const parentChildren = new Set(PARENTS.map((row) => row[0]));
  const special = new Set(NO_USER_ID_SPECIAL);
  const uncovered = tablesWithoutUserId(foundationSrc).filter(
    (name) => !parentChildren.has(name) && !special.has(name),
  );
  if (uncovered.length) {
    throw new Error(`tables without user_id missing policy mapping: ${uncovered.join(", ")}`);
  }
}

function packagePolicies() {
  const parentRows = PARENTS.map(
    ([child, parent, fk]) => `    ('${child}', '${parent}', '${fk}')`,
  ).join(",\n");
  const legacyRows = LEGACY.map(
    ([table, name]) => `    ('public', '${table}', '${name.replaceAll("'", "''")}')`,
  ).join(",\n");
  const tablesSql = sqlArray(TABLE_NAMES);
  const serviceSql = sqlArray(SERVICE);
  const catalogSql = sqlArray(CATALOG);

  const manifestParts = [
    TABLE_NAMES.join(","),
    LEGACY.map(([t, n]) => `${t}=${n}`).join("|"),
    PARENTS.map((row) => row.join(".")).join("|"),
    `notes:${toLf(NOTES_PRED)}`,
    `fees:${toLf(FEES_PRED)}`,
    `user:${USER_PRED}`,
    `parent_template:${PARENT_TEMPLATE}`,
    `catalog:${CATALOG.join(",")}`,
    `catalog_select:${CATALOG_SELECT_PRED}`,
    `formula_select:${toLf(FORMULA_SELECT_PRED)}`,
    `formula_write:${toLf(FORMULA_WRITE_PRED)}`,
    `service:${SERVICE.join(",")}`,
    "storage:journal_private_select_own,journal_private_insert_own,journal_private_update_own,journal_private_delete_own",
  ].map(toLf);
  const digest = md5Statements(manifestParts);
  const manifestSql = manifestParts
    .map((part) => `    $journal_man$${part}$journal_man$`)
    .join(",\n");

  const sql = `-- Stocksist Trading Journal RLS + private storage.
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

-- integrity-md5: ${digest}
DO $journal_rls$
DECLARE
  r record;
  t text;
  select_pred text;
  write_pred text;
  parent_table text;
  parent_fk text;
  v_digest text;
  v_expected text := '${digest}';
  v_tables constant text[] := ${tablesSql};
  v_service constant text[] := ${serviceSql};
  v_catalog constant text[] := ${catalogSql};
  v_manifest constant text[] := ARRAY[
${manifestSql}
  ];
BEGIN
  v_digest := md5(array_to_string(v_manifest, E'\\x1e'));
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
${legacyRows}
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
${parentRows}
    ) AS p(child, parent, fk)
    WHERE p.child = t;

    IF t = 'journal_notes' THEN
      select_pred := $journal_notes_pred$
${NOTES_PRED}
      $journal_notes_pred$;
      write_pred := select_pred;
    ELSIF t = 'journal_execution_fees' THEN
      select_pred := $journal_fees_pred$
${FEES_PRED}
      $journal_fees_pred$;
      write_pred := select_pred;
    ELSIF t = 'journal_metric_formula_versions' THEN
      select_pred := $journal_formula_sel$
${FORMULA_SELECT_PRED}
      $journal_formula_sel$;
      write_pred := $journal_formula_wr$
${FORMULA_WRITE_PRED}
      $journal_formula_wr$;
    ELSIF t = ANY (v_catalog) THEN
      select_pred := '${CATALOG_SELECT_PRED}';
      write_pred := '${USER_PRED}';
    ELSIF parent_table IS NOT NULL THEN
      select_pred := format('${PARENT_TEMPLATE}', parent_table, t, parent_fk);
      write_pred := select_pred;
    ELSE
      select_pred := '${USER_PRED}';
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
`;

  emit("20260816191200_journal_rls_storage.sql", sql, {
    digest,
    kind: "policy",
    manifestParts,
  });
  return manifestParts;
}

function packageFunctions(src) {
  const metricStart = src.indexOf("INSERT INTO public.journal_metric_definitions");
  const calcStart = src.indexOf("CREATE OR REPLACE FUNCTION public.journal_calculate_trade_v1");
  const metricSql = src.slice(metricStart, calcStart);
  wrapFile(
    "20260816191300_journal_metric_seed.sql",
    splitSqlStatements(metricSql),
    `-- System metric catalog (English + Spanish) + journal-calc.v1 formulas.
`,
    "metric-seed",
  );

  const fns = [
    {
      file: "20260816191310_journal_fn_calculate_trade.sql",
      name: "journal_calculate_trade_v1",
      header: `-- journal_calculate_trade_v1
-- Mirrors src/journal/calc/engine.ts calculatePosition() + resolveInitialRisk().
-- SECURITY INVOKER. Authenticated callers may only calculate their own trades.
-- Service-role (auth.uid() IS NULL AND auth.role() = service_role) may calculate
-- any trade id. Cross-user access returns the same 'trade not found' error.
-- Writes begin only after a successful compute. over_exit_blocked raises first.
`,
      extra: [
        "GRANT EXECUTE ON FUNCTION public.journal_calculate_trade_v1(uuid) TO authenticated, service_role",
        "REVOKE ALL ON FUNCTION public.journal_calculate_trade_v1(uuid) FROM PUBLIC",
      ],
    },
    {
      file: "20260816191320_journal_fn_refresh_derived.sql",
      name: "journal_refresh_derived",
      header: `-- journal_refresh_derived
`,
      extra: [
        "GRANT EXECUTE ON FUNCTION public.journal_refresh_derived(uuid) TO authenticated, service_role",
        "REVOKE ALL ON FUNCTION public.journal_refresh_derived(uuid) FROM PUBLIC",
      ],
    },
    {
      file: "20260816191330_journal_fn_backfill_accounts.sql",
      name: "journal_backfill_accounts_and_executions",
      header: `-- journal_backfill_accounts_and_executions
-- Operator-controlled. This migration does not invoke the function.
--
-- Do not create public.journal_rollback_* or any equivalent permanent
-- checkpoint table in an API-exposed schema.
--
-- Deployment runbook (required). If the deployment tool cannot guarantee
-- one operator session and one transaction, the backfill remains NO-GO
-- until a private administrative ledger is separately approved.
--   1. One operator-controlled database session.
--   2. An explicit transaction.
--   3. pg_temp checkpoint tables scoped to the exact affected user and
--      exact enumerated trade IDs.
--   4. Capture original trade account_id values, pre-existing account IDs,
--      pre-existing execution IDs, exact account IDs created by the call,
--      and exact execution IDs created by the call.
--   5. Complete dry run ending in ROLLBACK.
--   6. Repeat the transaction and COMMIT only after every assertion passes.
--   7. Return exact created IDs to the operator and preserve them outside
--      the Data API.
--   8. Any later rollback must use those literal captured IDs and the
--      exact original account_id mappings.
--   9. Assertions inspect only captured deployment-created rows — not
--      every row where source = 'synthetic_backfill'.
`,
      extra: [
        "GRANT EXECUTE ON FUNCTION public.journal_backfill_accounts_and_executions(uuid) TO authenticated, service_role",
      ],
    },
    {
      file: "20260816191340_journal_fn_migrate_legacy.sql",
      name: "journal_migrate_legacy_trades",
      header: `-- journal_migrate_legacy_trades
-- Operator-controlled. This migration does not invoke the function.
`,
      extra: [
        "GRANT EXECUTE ON FUNCTION public.journal_migrate_legacy_trades() TO authenticated, service_role",
      ],
    },
    {
      file: "20260816191350_journal_fn_import_rollback.sql",
      name: "journal_import_rollback",
      header: `-- journal_import_rollback
`,
      extra: [
        "GRANT EXECUTE ON FUNCTION public.journal_import_rollback(uuid) TO authenticated, service_role",
      ],
    },
    {
      file: "20260816191360_journal_fn_save_trade.sql",
      name: "journal_save_trade_v1",
      header: `-- journal_save_trade_v1. SECURITY INVOKER; owner is always auth.uid().
`,
      extra: [
        "REVOKE ALL ON FUNCTION public.journal_save_trade_v1(jsonb) FROM PUBLIC",
        "GRANT EXECUTE ON FUNCTION public.journal_save_trade_v1(jsonb) TO authenticated, service_role",
      ],
    },
    {
      file: "20260816191370_journal_fn_import_start.sql",
      name: "journal_import_start_v1",
      header: `-- journal_import_start_v1
`,
      extra: [
        "REVOKE ALL ON FUNCTION public.journal_import_start_v1(jsonb) FROM PUBLIC",
        "GRANT EXECUTE ON FUNCTION public.journal_import_start_v1(jsonb) TO authenticated, service_role",
      ],
    },
    {
      file: "20260816191380_journal_fn_import_row.sql",
      name: "journal_import_row_v1",
      header: `-- journal_import_row_v1
`,
      extra: [
        "REVOKE ALL ON FUNCTION public.journal_import_row_v1(uuid, uuid, jsonb) FROM PUBLIC",
        "GRANT EXECUTE ON FUNCTION public.journal_import_row_v1(uuid, uuid, jsonb) TO authenticated, service_role",
      ],
    },
    {
      file: "20260816191390_journal_fn_import_finalize.sql",
      name: "journal_import_finalize_v1",
      header: `-- journal_import_finalize_v1
`,
      extra: [
        "REVOKE ALL ON FUNCTION public.journal_import_finalize_v1(uuid) FROM PUBLIC",
        "GRANT EXECUTE ON FUNCTION public.journal_import_finalize_v1(uuid) TO authenticated, service_role",
      ],
    },
  ];

  for (const spec of fns) {
    const body = extractFunction(src, spec.name);
    wrapFile(spec.file, [body, ...spec.extra], spec.header, "function");
  }
}

function copyRunbookComments(src) {
  const start = src.indexOf("-- Operator runbook");
  if (start < 0) {
    const alt = src.indexOf("pg_temp checkpoint tables");
    return alt < 0 ? "" : "";
  }
  return "";
}

const m1 = readFileSync(resolve(BASE, OLD_FILES[0]), "utf8");
const m2 = readFileSync(resolve(BASE, OLD_FILES[1]), "utf8");
const m3 = readFileSync(resolve(BASE, OLD_FILES[2]), "utf8");

if (!m2.includes("intentionally does not create the bucket")) {
  throw new Error("baseline M2 missing bucket non-creation comment");
}
void copyRunbookComments(m3);

for (const name of OLD_FILES) {
  rmSync(resolve(OUT, name), { force: true });
}

mkdirSync(OUT, { recursive: true });
packageFoundation(m1);
assertChildPolicyCoverage(m1);
const manifestParts = packagePolicies();
packageFunctions(m3);

const created = [...m1.matchAll(/CREATE TABLE IF NOT EXISTS public\.([a-z0-9_]+)/g)].map(
  (m) => m[1],
);
if (JSON.stringify(created) !== JSON.stringify(TABLE_NAMES)) {
  throw new Error("foundation CREATE TABLE order drifted from TABLE_NAMES");
}

function preserveCanonical(kind, beforeProductionPrefix) {
  const rec = canonicalRecord(segmentByKind(kind).formerFile, kind);
  if (beforeProductionPrefix) {
    const idx = files.findIndex((f) => f.file.startsWith(beforeProductionPrefix));
    files.splice(idx < 0 ? files.length : idx, 0, rec);
  } else {
    files.push(rec);
  }
  console.log(`verified ${rec.file} ${rec.bytes} ${rec.digest} (canonical SQL not rewritten)`);
}

preserveCanonical("legacy-acl", "20260821190157");
preserveCanonical("function-acl", null);

writeIntegrityManifest({
  files,
  replaced: OLD_FILES,
  policyManifestParts: manifestParts,
});

const over = files.filter((f) => f.bytes > SIZE_LIMIT);
if (over.length) {
  throw new Error(`size limit exceeded: ${over.map((f) => f.file).join(", ")}`);
}

console.log(`verified ${files.length} canonical production Journal migrations`);
