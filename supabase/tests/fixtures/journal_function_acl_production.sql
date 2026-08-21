-- Production-faithful Journal function ACL fixture for disposable tests.
-- Mirrors verified production defaults:
--   direct EXECUTE for anon and sandbox_exec_zcjptaolpumhtlwhlemq on all nine
--   PUBLIC EXECUTE on the three operator functions
--   direct SELECT+INSERT on all 77 Journal tables for
--     sandbox_exec_zcjptaolpumhtlwhlemq and sandbox_exec
--   no canonical function EXECUTE for plain sandbox_exec
--   no role memberships for the long sandbox role
-- CREATE OR REPLACE FUNCTION preserves existing ACLs. DROP+CREATE would
-- reapply production default privileges and may restore anon/sandbox EXECUTE.
DO $fixture$
DECLARE
  sig text;
  t text;
  r text;
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
  v_sandbox constant text := 'sandbox_exec_zcjptaolpumhtlwhlemq';
  v_plain constant text := 'sandbox_exec';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_sandbox) THEN
    EXECUTE format(
      'CREATE ROLE %I LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS',
      v_sandbox
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_plain) THEN
    EXECUTE format(
      'CREATE ROLE %I NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
      v_plain
    );
  END IF;

  -- Disposable CREATE ROLE may attach platform memberships. Production has none.
  FOR r IN
    SELECT g.rolname
    FROM pg_auth_members m
    JOIN pg_roles g ON g.oid = m.roleid
    JOIN pg_roles u ON u.oid = m.member
    WHERE u.rolname = v_sandbox
  LOOP
    EXECUTE format('REVOKE %I FROM %I', r, v_sandbox);
  END LOOP;

  FOREACH sig IN ARRAY v_canon LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO %I', sig, v_sandbox);
  END LOOP;

  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname LIKE 'journal_%'
    ORDER BY 1
  LOOP
    EXECUTE format('GRANT SELECT, INSERT ON TABLE public.%I TO %I', t, v_sandbox);
    EXECUTE format('GRANT SELECT, INSERT ON TABLE public.%I TO %I', t, v_plain);
  END LOOP;

  EXECUTE 'GRANT EXECUTE ON FUNCTION public.journal_backfill_accounts_and_executions(uuid) TO PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.journal_migrate_legacy_trades() TO PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.journal_import_rollback(uuid) TO PUBLIC';
END;
$fixture$;
