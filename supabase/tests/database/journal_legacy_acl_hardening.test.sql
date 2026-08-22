BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT no_plan();

CREATE TEMP TABLE journal_acl_trade_ids AS
SELECT id FROM public.journal_trades;

CREATE TEMP TABLE journal_acl_policy_snap AS
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE (schemaname = 'public' AND tablename LIKE 'journal_%')
   OR (schemaname = 'storage' AND policyname LIKE 'journal_private_%');

CREATE TEMP TABLE journal_acl_service_snap AS
SELECT c.relname, a.privilege_type, a.is_grantable
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, ARRAY[]::aclitem[])) a
JOIN pg_roles g ON g.oid = a.grantee
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname LIKE 'journal_%'
  AND g.rolname = 'service_role';

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.journal_trades', 'TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.journal_notes', 'TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.journal_equity_snapshots', 'TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.journal_stats_cache', 'TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.journal_imports', 'TRUNCATE'),
  'TRUNCATE is removed from all five legacy tables'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.journal_trades', 'REFERENCES')
  AND NOT has_table_privilege('authenticated', 'public.journal_notes', 'REFERENCES')
  AND NOT has_table_privilege('authenticated', 'public.journal_equity_snapshots', 'REFERENCES')
  AND NOT has_table_privilege('authenticated', 'public.journal_stats_cache', 'REFERENCES')
  AND NOT has_table_privilege('authenticated', 'public.journal_imports', 'REFERENCES'),
  'REFERENCES is removed from all five legacy tables'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.journal_trades', 'TRIGGER')
  AND NOT has_table_privilege('authenticated', 'public.journal_notes', 'TRIGGER')
  AND NOT has_table_privilege('authenticated', 'public.journal_equity_snapshots', 'TRIGGER')
  AND NOT has_table_privilege('authenticated', 'public.journal_stats_cache', 'TRIGGER')
  AND NOT has_table_privilege('authenticated', 'public.journal_imports', 'TRIGGER'),
  'TRIGGER is removed from all five legacy tables'
);

SELECT ok(
  CASE
    WHEN current_setting('server_version_num')::integer < 170000 THEN true
    ELSE
      NOT has_table_privilege('authenticated', 'public.journal_trades', 'MAINTAIN')
      AND NOT has_table_privilege('authenticated', 'public.journal_notes', 'MAINTAIN')
      AND NOT has_table_privilege('authenticated', 'public.journal_equity_snapshots', 'MAINTAIN')
      AND NOT has_table_privilege('authenticated', 'public.journal_stats_cache', 'MAINTAIN')
      AND NOT has_table_privilege('authenticated', 'public.journal_imports', 'MAINTAIN')
  END,
  'MAINTAIN is removed on PostgreSQL 17+'
);

SELECT ok(
  (
    SELECT bool_and(
      has_table_privilege('authenticated', 'public.' || c.relname, 'SELECT')
      AND has_table_privilege('authenticated', 'public.' || c.relname, 'INSERT')
      AND has_table_privilege('authenticated', 'public.' || c.relname, 'UPDATE')
      AND has_table_privilege('authenticated', 'public.' || c.relname, 'DELETE')
    )
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname IN (
        'journal_trades', 'journal_notes', 'journal_equity_snapshots',
        'journal_stats_cache', 'journal_imports', 'journal_accounts',
        'journal_executions', 'journal_goals', 'journal_event_outbox'
      )
  ),
  'authenticated retains SELECT/INSERT/UPDATE/DELETE'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename LIKE 'journal_%'
  ),
  311,
  'all 311 public Journal policies remain'
);

SELECT ok(
  NOT EXISTS (
    SELECT s.schemaname, s.tablename, s.policyname, s.cmd, s.roles, s.qual, s.with_check
    FROM journal_acl_policy_snap s
    EXCEPT
    SELECT p.schemaname, p.tablename, p.policyname, p.cmd, p.roles, p.qual, p.with_check
    FROM pg_policies p
    WHERE (p.schemaname = 'public' AND p.tablename LIKE 'journal_%')
       OR (p.schemaname = 'storage' AND p.policyname LIKE 'journal_private_%')
  )
  AND NOT EXISTS (
    SELECT p.schemaname, p.tablename, p.policyname, p.cmd, p.roles, p.qual, p.with_check
    FROM pg_policies p
    WHERE (p.schemaname = 'public' AND p.tablename LIKE 'journal_%')
       OR (p.schemaname = 'storage' AND p.policyname LIKE 'journal_private_%')
    EXCEPT
    SELECT s.schemaname, s.tablename, s.policyname, s.cmd, s.roles, s.qual, s.with_check
    FROM journal_acl_policy_snap s
  ),
  'public Journal and journal-private storage policies remain catalog-equivalent'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname IN (
        'journal_private_select_own',
        'journal_private_insert_own',
        'journal_private_update_own',
        'journal_private_delete_own'
      )
  ),
  4,
  'all four storage policies remain'
);

SELECT ok(
  NOT EXISTS (
    SELECT s.relname, s.privilege_type, s.is_grantable
    FROM journal_acl_service_snap s
    EXCEPT
    SELECT c.relname, a.privilege_type, a.is_grantable
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, ARRAY[]::aclitem[])) a
    JOIN pg_roles g ON g.oid = a.grantee
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname LIKE 'journal_%'
      AND g.rolname = 'service_role'
  )
  AND NOT EXISTS (
    SELECT c.relname, a.privilege_type, a.is_grantable
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, ARRAY[]::aclitem[])) a
    JOIN pg_roles g ON g.oid = a.grantee
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname LIKE 'journal_%'
      AND g.rolname = 'service_role'
    EXCEPT
    SELECT s.relname, s.privilege_type, s.is_grantable
    FROM journal_acl_service_snap s
  ),
  'service_role privileges remain unchanged'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name LIKE 'journal_%'
      AND grantee IN ('anon', 'PUBLIC')
  )
  AND NOT has_table_privilege('anon', 'public.journal_trades', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.journal_accounts', 'SELECT'),
  'anon and PUBLIC remain without Journal table access'
);

SELECT ok(
  (
    SELECT bool_and(c.relrowsecurity)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname LIKE 'journal_%'
      AND c.relname NOT LIKE 'journal_ci_%'
      AND c.relname NOT LIKE 'journal_rollback_%'
  ),
  'RLS remains enabled on all 77 Journal tables'
);

SELECT is(
  (SELECT count(*)::integer FROM public.journal_trades),
  (SELECT count(*)::integer FROM journal_acl_trade_ids),
  'existing row counts remain unchanged'
);

SELECT ok(
  NOT EXISTS (
    SELECT id FROM journal_acl_trade_ids
    EXCEPT
    SELECT id FROM public.journal_trades
  )
  AND NOT EXISTS (
    SELECT id FROM public.journal_trades
    EXCEPT
    SELECT id FROM journal_acl_trade_ids
  ),
  'existing trade IDs remain unchanged'
);

SELECT is(
  (SELECT count(*)::integer FROM public.journal_accounts),
  0,
  'journal_accounts remains empty'
);

SELECT is(
  (SELECT count(*)::integer FROM public.journal_executions),
  0,
  'journal_executions remains empty'
);

SELECT throws_ok(
  $trunc$
  SET LOCAL ROLE authenticated;
  TRUNCATE TABLE public.journal_trades;
  $trunc$,
  '42501',
  NULL,
  'authenticated TRUNCATE fails'
);

SELECT is(
  (SELECT count(*)::integer FROM public.journal_trades),
  (SELECT count(*)::integer FROM journal_acl_trade_ids),
  'failed authenticated TRUNCATE does not change data'
);

CREATE TEMP TABLE journal_acl_trades_before AS
SELECT c.relacl
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'journal_trades';

SELECT throws_ok(
  $badck$
  DO $journal_seg$
  DECLARE
    v_statements text[] := ARRAY[
      $journal_stmt$REVOKE TRUNCATE ON TABLE public.journal_trades FROM authenticated
$journal_stmt$
    ];
    v_expected text := 'deadbeefdeadbeefdeadbeefdeadbeef';
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
  $badck$,
  'P0001',
  NULL,
  'checksum mutation fails before ACL mutation'
);

SELECT is(
  (
    SELECT c.relacl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'journal_trades'
  ),
  (SELECT relacl FROM journal_acl_trades_before),
  'checksum failure leaves journal_trades ACL unchanged'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'pg_temp'
      AND p.proname LIKE 'journal_%'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname LIKE 'journal_rollback_%'
  ),
  'no function or backfill helper objects were created'
);

SELECT * FROM finish();
ROLLBACK;
