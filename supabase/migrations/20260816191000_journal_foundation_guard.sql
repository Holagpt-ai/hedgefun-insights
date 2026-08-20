-- Stocksist Trading Journal foundation guard.
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
-- integrity-md5: 707bf9d90ba303bd7796d4dfd971211d
DO $journal_seg$
DECLARE
  v_statements text[] := ARRAY[
    $journal_stmt$DO $$
DECLARE
  t text;
  v_live constant text[] := ARRAY[
    'journal_trades',
    'journal_notes',
    'journal_equity_snapshots',
    'journal_stats_cache',
    'journal_imports'
  ];
  v_rel pg_class%ROWTYPE;
  v_policy_count integer;
  v_uid_policy_count integer;
BEGIN
  FOREACH t IN ARRAY v_live LOOP
    SELECT c.* INTO v_rel
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = t
      AND c.relkind = 'r';

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF NOT v_rel.relrowsecurity THEN
      RAISE EXCEPTION
        'preflight: public.% is missing row level security',
        t;
    END IF;

    SELECT count(*) INTO v_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = t;

    IF v_policy_count < 1 THEN
      RAISE EXCEPTION
        'preflight: public.% is RLS-enabled but has no policies',
        t;
    END IF;

    SELECT count(*) INTO v_uid_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = t
      AND (
        coalesce(qual, '') LIKE '%auth.uid()%'
        OR coalesce(with_check, '') LIKE '%auth.uid()%'
      );

    IF v_uid_policy_count < 1 THEN
      RAISE EXCEPTION
        'preflight: public.% has no auth.uid() policy',
        t;
    END IF;

    IF t = 'journal_notes'
       AND NOT EXISTS (
         SELECT 1
         FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'journal_notes'
           AND policyname = 'Users can manage own notes'
       )
    THEN
      RAISE EXCEPTION
        'preflight: public.journal_notes is missing policy "Users can manage own notes"';
    END IF;
  END LOOP;
END;
$$
$journal_stmt$,
    $journal_stmt$ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon
$journal_stmt$,
    $journal_stmt$ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated
$journal_stmt$,
    $journal_stmt$ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC
$journal_stmt$
  ];
  v_expected text := '707bf9d90ba303bd7796d4dfd971211d';
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
