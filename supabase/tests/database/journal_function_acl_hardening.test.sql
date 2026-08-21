BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT no_plan();

-- CREATE OR REPLACE FUNCTION preserves existing ACLs. DROP FUNCTION followed
-- by CREATE FUNCTION reapplies production default privileges and may restore
-- anon and sandbox EXECUTE. Follow any future drop/recreate of these nine
-- functions with 20260816191400 or equivalent explicit revocations.
-- Do not change ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public.

CREATE TEMP TABLE journal_fn_def_snap AS
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.proowner,
  p.prolang,
  p.prorettype,
  p.prosecdef,
  p.provolatile,
  p.proconfig,
  md5(pg_get_functiondef(p.oid)) AS def_md5
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'journal_calculate_trade_v1',
    'journal_refresh_derived',
    'journal_backfill_accounts_and_executions',
    'journal_migrate_legacy_trades',
    'journal_import_rollback',
    'journal_save_trade_v1',
    'journal_import_start_v1',
    'journal_import_row_v1',
    'journal_import_finalize_v1'
  );

SELECT is((SELECT count(*)::integer FROM journal_fn_def_snap), 9, 'nine canonical functions exist');

SELECT ok(
  (
    SELECT bool_and(NOT prosecdef AND 'search_path=public' = ANY (proconfig))
    FROM journal_fn_def_snap
  ),
  'all nine remain SECURITY INVOKER with search_path=public'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.journal_backfill_accounts_and_executions(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.journal_migrate_legacy_trades()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.journal_import_rollback(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.journal_calculate_trade_v1(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.journal_refresh_derived(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.journal_save_trade_v1(jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.journal_import_start_v1(jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.journal_import_row_v1(uuid, uuid, jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.journal_import_finalize_v1(uuid)', 'EXECUTE'),
  'anon EXECUTE is false for all nine canonical functions'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.journal_backfill_accounts_and_executions(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.journal_migrate_legacy_trades()', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.journal_import_rollback(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.journal_calculate_trade_v1(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.journal_refresh_derived(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.journal_save_trade_v1(jsonb)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.journal_import_start_v1(jsonb)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.journal_import_row_v1(uuid, uuid, jsonb)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.journal_import_finalize_v1(uuid)', 'EXECUTE'),
  'authenticated EXECUTE remains true for all nine'
);

SELECT ok(
  has_function_privilege('service_role', 'public.journal_backfill_accounts_and_executions(uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.journal_migrate_legacy_trades()', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.journal_import_rollback(uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.journal_calculate_trade_v1(uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.journal_refresh_derived(uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.journal_save_trade_v1(jsonb)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.journal_import_start_v1(jsonb)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.journal_import_row_v1(uuid, uuid, jsonb)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.journal_import_finalize_v1(uuid)', 'EXECUTE'),
  'service_role EXECUTE remains true for all nine'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'journal_calculate_trade_v1',
        'journal_refresh_derived',
        'journal_backfill_accounts_and_executions',
        'journal_migrate_legacy_trades',
        'journal_import_rollback',
        'journal_save_trade_v1',
        'journal_import_start_v1',
        'journal_import_row_v1',
        'journal_import_finalize_v1'
      )
      AND a.grantee = 0
      AND a.privilege_type = 'EXECUTE'
  ),
  'PUBLIC EXECUTE is false for all nine canonical functions'
);

SELECT ok(
  NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec_zcjptaolpumhtlwhlemq')
  OR (
    has_function_privilege('sandbox_exec_zcjptaolpumhtlwhlemq', 'public.journal_calculate_trade_v1(uuid)', 'EXECUTE')
    AND has_function_privilege('sandbox_exec_zcjptaolpumhtlwhlemq', 'public.journal_refresh_derived(uuid)', 'EXECUTE')
    AND has_function_privilege('sandbox_exec_zcjptaolpumhtlwhlemq', 'public.journal_backfill_accounts_and_executions(uuid)', 'EXECUTE')
    AND has_function_privilege('sandbox_exec_zcjptaolpumhtlwhlemq', 'public.journal_migrate_legacy_trades()', 'EXECUTE')
    AND has_function_privilege('sandbox_exec_zcjptaolpumhtlwhlemq', 'public.journal_import_rollback(uuid)', 'EXECUTE')
    AND has_function_privilege('sandbox_exec_zcjptaolpumhtlwhlemq', 'public.journal_save_trade_v1(jsonb)', 'EXECUTE')
    AND has_function_privilege('sandbox_exec_zcjptaolpumhtlwhlemq', 'public.journal_import_start_v1(jsonb)', 'EXECUTE')
    AND has_function_privilege('sandbox_exec_zcjptaolpumhtlwhlemq', 'public.journal_import_row_v1(uuid, uuid, jsonb)', 'EXECUTE')
    AND has_function_privilege('sandbox_exec_zcjptaolpumhtlwhlemq', 'public.journal_import_finalize_v1(uuid)', 'EXECUTE')
    AND NOT EXISTS (
      SELECT 1 FROM pg_auth_members m
      JOIN pg_roles r ON r.oid = m.member
      WHERE r.rolname = 'sandbox_exec_zcjptaolpumhtlwhlemq'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname LIKE 'journal_%'
        AND (
          (
            SELECT count(*)
            FROM aclexplode(coalesce(c.relacl, ARRAY[]::aclitem[])) a
            JOIN pg_roles g ON g.oid = a.grantee
            WHERE g.rolname = 'sandbox_exec_zcjptaolpumhtlwhlemq'
          ) IS DISTINCT FROM 2
          OR EXISTS (
            SELECT 1
            FROM aclexplode(coalesce(c.relacl, ARRAY[]::aclitem[])) a
            JOIN pg_roles g ON g.oid = a.grantee
            WHERE g.rolname = 'sandbox_exec_zcjptaolpumhtlwhlemq'
              AND (
                a.privilege_type NOT IN ('SELECT', 'INSERT')
                OR a.is_grantable
                OR pg_get_userbyid(a.grantor) IS DISTINCT FROM 'postgres'
              )
          )
          OR has_table_privilege('sandbox_exec_zcjptaolpumhtlwhlemq', c.oid, 'UPDATE')
          OR has_table_privilege('sandbox_exec_zcjptaolpumhtlwhlemq', c.oid, 'DELETE')
          OR has_table_privilege('sandbox_exec_zcjptaolpumhtlwhlemq', c.oid, 'TRUNCATE')
          OR has_table_privilege('sandbox_exec_zcjptaolpumhtlwhlemq', c.oid, 'REFERENCES')
          OR has_table_privilege('sandbox_exec_zcjptaolpumhtlwhlemq', c.oid, 'TRIGGER')
        )
    )
  ),
  'long sandbox retains EXECUTE and the SELECT/INSERT table ACL footprint when present'
);

SELECT ok(
  NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec')
  OR (
    NOT has_function_privilege('sandbox_exec', 'public.journal_calculate_trade_v1(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('sandbox_exec', 'public.journal_refresh_derived(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('sandbox_exec', 'public.journal_backfill_accounts_and_executions(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('sandbox_exec', 'public.journal_migrate_legacy_trades()', 'EXECUTE')
    AND NOT has_function_privilege('sandbox_exec', 'public.journal_import_rollback(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('sandbox_exec', 'public.journal_save_trade_v1(jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('sandbox_exec', 'public.journal_import_start_v1(jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('sandbox_exec', 'public.journal_import_row_v1(uuid, uuid, jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('sandbox_exec', 'public.journal_import_finalize_v1(uuid)', 'EXECUTE')
  ),
  'plain sandbox_exec has no canonical function EXECUTE'
);

SELECT throws_ok(
  $miss$
  DO $journal_fn_pre$
  DECLARE
    v_oid regprocedure;
  BEGIN
    v_oid := to_regprocedure('public.journal_missing_operator_fn(uuid)');
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'preflight: missing function public.journal_missing_operator_fn(uuid)';
    END IF;
    EXECUTE 'REVOKE ALL ON FUNCTION public.journal_backfill_accounts_and_executions(uuid) FROM PUBLIC';
  END;
  $journal_fn_pre$;
  $miss$,
  'P0001',
  NULL,
  'missing target function fails before revoke'
);

SELECT throws_ok(
  $definer$
  DO $journal_fn_pre$
  DECLARE
    v_proc pg_proc%ROWTYPE;
  BEGIN
    EXECUTE 'ALTER FUNCTION public.journal_import_rollback(uuid) SECURITY DEFINER';
    SELECT p.* INTO STRICT v_proc
    FROM pg_proc p
    WHERE p.oid = 'public.journal_import_rollback(uuid)'::regprocedure;
    IF v_proc.prosecdef THEN
      RAISE EXCEPTION 'preflight: public.journal_import_rollback(uuid) is SECURITY DEFINER';
    END IF;
    EXECUTE 'REVOKE ALL ON FUNCTION public.journal_backfill_accounts_and_executions(uuid) FROM PUBLIC';
  END;
  $journal_fn_pre$;
  $definer$,
  'P0001',
  NULL,
  'SECURITY DEFINER fails before revoke'
);

SELECT throws_ok(
  $badpath$
  DO $journal_fn_pre$
  DECLARE
    v_proc pg_proc%ROWTYPE;
  BEGIN
    EXECUTE 'ALTER FUNCTION public.journal_import_rollback(uuid) SET search_path = pg_catalog';
    SELECT p.* INTO STRICT v_proc
    FROM pg_proc p
    WHERE p.oid = 'public.journal_import_rollback(uuid)'::regprocedure;
    IF v_proc.proconfig IS NULL
       OR NOT ('search_path=public' = ANY (v_proc.proconfig)) THEN
      RAISE EXCEPTION 'preflight: public.journal_import_rollback(uuid) is missing search_path=public';
    END IF;
    EXECUTE 'REVOKE ALL ON FUNCTION public.journal_backfill_accounts_and_executions(uuid) FROM PUBLIC';
  END;
  $journal_fn_pre$;
  $badpath$,
  'P0001',
  NULL,
  'altered search_path fails before revoke'
);

SELECT throws_ok(
  $nogrant$
  DO $journal_fn_pre$
  BEGIN
    EXECUTE 'REVOKE ALL ON FUNCTION public.journal_import_rollback(uuid) FROM authenticated';
    IF NOT has_function_privilege(
      'authenticated',
      'public.journal_import_rollback(uuid)'::regprocedure,
      'EXECUTE'
    ) THEN
      RAISE EXCEPTION
        'preflight: authenticated missing EXECUTE on public.journal_import_rollback(uuid)';
    END IF;
    EXECUTE 'REVOKE ALL ON FUNCTION public.journal_backfill_accounts_and_executions(uuid) FROM PUBLIC';
  END;
  $journal_fn_pre$;
  $nogrant$,
  'P0001',
  NULL,
  'missing authenticated grant fails before revoke'
);

SELECT throws_ok(
  $otherpub$
  DO $journal_fn_pre$
  DECLARE
    v_public boolean;
    v_proc pg_proc%ROWTYPE;
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.journal_calculate_trade_v1(uuid) TO PUBLIC';
    SELECT p.* INTO STRICT v_proc
    FROM pg_proc p
    WHERE p.oid = 'public.journal_calculate_trade_v1(uuid)'::regprocedure;
    SELECT EXISTS (
      SELECT 1
      FROM aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) a
      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) INTO v_public;
    IF v_public THEN
      RAISE EXCEPTION
        'preflight: unexpected PUBLIC EXECUTE on public.journal_calculate_trade_v1(uuid)';
    END IF;
    EXECUTE 'REVOKE ALL ON FUNCTION public.journal_backfill_accounts_and_executions(uuid) FROM PUBLIC';
  END;
  $journal_fn_pre$;
  $otherpub$,
  'P0001',
  NULL,
  'unexpected PUBLIC EXECUTE on another canonical function fails before revoke'
);

CREATE TEMP TABLE journal_fn_acl_before_ck AS
SELECT p.proacl
FROM pg_proc p
WHERE p.oid = 'public.journal_backfill_accounts_and_executions(uuid)'::regprocedure;

SELECT throws_ok(
  $badck$
  DO $journal_seg$
  DECLARE
    v_statements text[] := ARRAY[
      $journal_stmt$REVOKE ALL ON FUNCTION public.journal_backfill_accounts_and_executions(uuid) FROM PUBLIC
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
  'checksum mutation fails before function ACL mutation'
);

SELECT is(
  (
    SELECT p.proacl
    FROM pg_proc p
    WHERE p.oid = 'public.journal_backfill_accounts_and_executions(uuid)'::regprocedure
  ),
  (SELECT proacl FROM journal_fn_acl_before_ck),
  'checksum failure leaves operator function ACL unchanged'
);

SELECT ok(
  NOT EXISTS (
    SELECT s.proname, s.args, s.proowner, s.prolang, s.prorettype, s.prosecdef, s.provolatile, s.proconfig, s.def_md5
    FROM journal_fn_def_snap s
    EXCEPT
    SELECT
      p.proname,
      pg_get_function_identity_arguments(p.oid),
      p.proowner,
      p.prolang,
      p.prorettype,
      p.prosecdef,
      p.provolatile,
      p.proconfig,
      md5(pg_get_functiondef(p.oid))
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'journal_calculate_trade_v1',
        'journal_refresh_derived',
        'journal_backfill_accounts_and_executions',
        'journal_migrate_legacy_trades',
        'journal_import_rollback',
        'journal_save_trade_v1',
        'journal_import_start_v1',
        'journal_import_row_v1',
        'journal_import_finalize_v1'
      )
  ),
  'canonical function definitions, ownership, language, return types, and hashes remain unchanged'
);

SELECT * FROM finish();
ROLLBACK;
