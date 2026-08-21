-- Stocksist Trading Journal function ACL hardening.
-- Revokes leftover PUBLIC/anon EXECUTE from the three operator functions
-- that Stage C granted without REVOKE FROM PUBLIC. Does not change
-- function bodies, SECURITY INVOKER, search_path, or authenticated /
-- service_role EXECUTE. Mutation uses the exact three signatures.
-- integrity-md5: f3de4ebe810385ca63f90f7a22e116cf
DO $journal_seg$
DECLARE
  v_statements text[] := ARRAY[
    $journal_stmt$DO $journal_fn_pre$
DECLARE
  sig text;
  v_oid regprocedure;
  v_proc pg_proc%ROWTYPE;
  r record;
  v_canon constant text[] := ARRAY[
    'journal_calculate_trade_v1(uuid)',
    'journal_refresh_derived(uuid)',
    'journal_backfill_accounts_and_executions(uuid)',
    'journal_migrate_legacy_trades()',
    'journal_import_rollback(uuid)',
    'journal_save_trade_v1(jsonb)',
    'journal_import_start_v1(jsonb)',
    'journal_import_row_v1(uuid, uuid, jsonb)',
    'journal_import_finalize_v1(uuid)'
  ];
  v_targets constant text[] := ARRAY[
    'journal_backfill_accounts_and_executions(uuid)',
    'journal_migrate_legacy_trades()',
    'journal_import_rollback(uuid)'
  ];
  v_public boolean;
BEGIN
  IF cardinality(v_canon) IS DISTINCT FROM 9 THEN
    RAISE EXCEPTION 'preflight: canonical Journal function count is %', cardinality(v_canon);
  END IF;

  FOREACH sig IN ARRAY v_canon LOOP
    v_oid := to_regprocedure('public.' || sig);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'preflight: missing function public.%', sig;
    END IF;
    SELECT p.* INTO STRICT v_proc FROM pg_proc p WHERE p.oid = v_oid;
    IF v_proc.prosecdef THEN
      RAISE EXCEPTION 'preflight: public.% is SECURITY DEFINER', sig;
    END IF;
    IF v_proc.proconfig IS NULL
       OR NOT ('search_path=public' = ANY (v_proc.proconfig)) THEN
      RAISE EXCEPTION 'preflight: public.% is missing search_path=public', sig;
    END IF;
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

    IF sig = ANY (v_targets) THEN
      IF NOT v_public OR NOT has_function_privilege('anon', v_oid, 'EXECUTE') THEN
        RAISE EXCEPTION
          'preflight: public.% does not currently expose PUBLIC/anon EXECUTE',
          sig;
      END IF;
    ELSE
      IF v_public OR has_function_privilege('anon', v_oid, 'EXECUTE') THEN
        RAISE EXCEPTION
          'preflight: unexpected PUBLIC/anon EXECUTE on public.%',
          sig;
      END IF;
    END IF;

    FOR r IN
      SELECT a.grantee, a.privilege_type, a.is_grantable, g.rolname
      FROM aclexplode(coalesce(v_proc.proacl, acldefault('f', v_proc.proowner))) a
      LEFT JOIN pg_roles g ON g.oid = a.grantee
    LOOP
      IF r.is_grantable THEN
        RAISE EXCEPTION
          'preflight: unexpected grant option on public.%',
          sig;
      END IF;
      IF r.privilege_type IS DISTINCT FROM 'EXECUTE' THEN
        RAISE EXCEPTION
          'preflight: unexpected % on public.%',
          r.privilege_type,
          sig;
      END IF;
      IF r.grantee = 0 THEN
        IF NOT (sig = ANY (v_targets)) THEN
          RAISE EXCEPTION 'preflight: unexpected PUBLIC EXECUTE on public.%', sig;
        END IF;
        CONTINUE;
      END IF;
      IF r.rolname IN ('authenticated', 'service_role') THEN
        CONTINUE;
      END IF;
      IF r.grantee = v_proc.proowner THEN
        CONTINUE;
      END IF;
      RAISE EXCEPTION
        'preflight: unexpected grantee % on public.%',
        coalesce(r.rolname, r.grantee::text),
        sig;
    END LOOP;
  END LOOP;
END;
$journal_fn_pre$
$journal_stmt$,
    $journal_stmt$REVOKE ALL ON FUNCTION public.journal_backfill_accounts_and_executions(uuid) FROM PUBLIC
$journal_stmt$,
    $journal_stmt$REVOKE ALL ON FUNCTION public.journal_backfill_accounts_and_executions(uuid) FROM anon
$journal_stmt$,
    $journal_stmt$REVOKE ALL ON FUNCTION public.journal_migrate_legacy_trades() FROM PUBLIC
$journal_stmt$,
    $journal_stmt$REVOKE ALL ON FUNCTION public.journal_migrate_legacy_trades() FROM anon
$journal_stmt$,
    $journal_stmt$REVOKE ALL ON FUNCTION public.journal_import_rollback(uuid) FROM PUBLIC
$journal_stmt$,
    $journal_stmt$REVOKE ALL ON FUNCTION public.journal_import_rollback(uuid) FROM anon
$journal_stmt$,
    $journal_stmt$DO $journal_fn_post$
DECLARE
  sig text;
  v_oid regprocedure;
  v_proc pg_proc%ROWTYPE;
  v_canon constant text[] := ARRAY[
    'journal_calculate_trade_v1(uuid)',
    'journal_refresh_derived(uuid)',
    'journal_backfill_accounts_and_executions(uuid)',
    'journal_migrate_legacy_trades()',
    'journal_import_rollback(uuid)',
    'journal_save_trade_v1(jsonb)',
    'journal_import_start_v1(jsonb)',
    'journal_import_row_v1(uuid, uuid, jsonb)',
    'journal_import_finalize_v1(uuid)'
  ];
  v_public boolean;
BEGIN
  FOREACH sig IN ARRAY v_canon LOOP
    v_oid := to_regprocedure('public.' || sig);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'postcondition: missing function public.%', sig;
    END IF;
    SELECT p.* INTO STRICT v_proc FROM pg_proc p WHERE p.oid = v_oid;
    IF v_proc.prosecdef THEN
      RAISE EXCEPTION 'postcondition: public.% is SECURITY DEFINER', sig;
    END IF;
    IF v_proc.proconfig IS NULL
       OR NOT ('search_path=public' = ANY (v_proc.proconfig)) THEN
      RAISE EXCEPTION 'postcondition: public.% is missing search_path=public', sig;
    END IF;
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
  END LOOP;
END;
$journal_fn_post$
$journal_stmt$
  ];
  v_expected text := 'f3de4ebe810385ca63f90f7a22e116cf';
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
