/**
 * Batch 36 — read-only production prerequisite verification (zcjptaolpumhtlwhlemq).
 * Requires HISTORICAL_PRODUCTION_DATABASE_URL (or LOVABLE_DB_MIGRATION_URL / SUPABASE_DB_URL / DATABASE_URL).
 * Does not mutate schema or data.
 */
import {
  loadDotEnvFiles,
  openProductionSql,
  requireProductionDatabaseUrl,
} from "../../src/lib/persistence/production-database.ts";

loadDotEnvFiles();

const sql = openProductionSql(requireProductionDatabaseUrl());

try {
  const migrations = await sql<{ version: string; name: string | null }[]>`
    SELECT version, name
    FROM supabase_migrations.schema_migrations
    WHERE version IN (
      '20260907180000',
      '20260930120000',
      '20261020143000',
      '20261021183000',
      '20261022103000',
      '20261022120000'
    )
    ORDER BY version
  `;

  const statementTimeout = await sql<{ proname: string; proconfig: string[] | null }[]>`
    SELECT p.proname, p.proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'replace_radar_v22_candidates_v1'
    LIMIT 1
  `;

  const identityFn = await sql<{ proname: string }[]>`
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'historical_symbol_history_facts_match',
        'historical_identity_apply_diff',
        'historical_rollout_symbols_current_through'
      )
    ORDER BY p.proname
  `;

  const secTable = await sql<
    { relname: string; rls_enabled: boolean }[]
  >`
    SELECT c.relname, c.relrowsecurity AS rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'sec_edgar_sync_state'
  `;

  const catalystTables = await sql<{ relname: string }[]>`
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('catalyst_events', 'catalyst_intel_sources')
    ORDER BY c.relname
  `;

  const secRowCount = secTable.length > 0
    ? await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM public.sec_edgar_sync_state`
    : [{ n: null as unknown as number }];

  const secEdgarEvents = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM public.catalyst_events
    WHERE provider = 'sec_edgar'
  `;

  const intelSources = await sql<
    { source_key: string; source_type: string; enabled: boolean }[]
  >`
    SELECT source_key, source_type, enabled
    FROM public.catalyst_intel_sources
    WHERE source_type ILIKE '%sec%' OR source_key ILIKE '%sec%'
    ORDER BY source_key
  `;

  console.log(
    JSON.stringify(
      {
        project: "zcjptaolpumhtlwhlemq",
        migrations,
        replace_radar_v22_candidates_v1: statementTimeout[0] ?? null,
        historical_identity_functions: identityFn.map((r) => r.proname),
        sec_edgar_sync_state: {
          present: secTable.length > 0,
          rls_enabled: secTable[0]?.rls_enabled ?? null,
          row_count: secRowCount[0]?.n ?? null,
        },
        catalyst_schema: {
          tables_present: catalystTables.map((r) => r.relname),
        },
        catalyst_events_sec_edgar_count: secEdgarEvents[0]?.n ?? null,
        catalyst_intel_sources_sec_related: intelSources,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
