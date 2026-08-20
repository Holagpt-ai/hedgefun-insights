BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT no_plan();

-- Integrity-drift and atomic rollback proofs for runner-native wrappers.
-- Does not connect to the live Supabase project.

SELECT throws_ok(
  $fail$
  DO $journal_seg$
  DECLARE
    v_statements text[] := ARRAY[
      $journal_stmt$CREATE TABLE public.journal_ci_integrity_probe (id integer PRIMARY KEY)$journal_stmt$
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
  $fail$,
  'P0001',
  NULL,
  'checksum mismatch raises before DDL'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'journal_ci_integrity_probe'
  ),
  'checksum failure does not create a table'
);

SELECT throws_ok(
  $ord$
  DO $journal_seg$
  DECLARE
    v_statements text[] := ARRAY[
      $journal_stmt$CREATE TABLE public.journal_ci_reorder_probe (id integer PRIMARY KEY)$journal_stmt$,
      $journal_stmt$ALTER TABLE public.journal_ci_reorder_probe ADD COLUMN note text$journal_stmt$
    ];
    v_expected text := md5(
      array_to_string(
        ARRAY[
          $journal_stmt$ALTER TABLE public.journal_ci_reorder_probe ADD COLUMN note text$journal_stmt$,
          $journal_stmt$CREATE TABLE public.journal_ci_reorder_probe (id integer PRIMARY KEY)$journal_stmt$
        ],
        E'\x1e'
      )
    );
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
  $ord$,
  'P0001',
  NULL,
  'reordered statements fail the checksum before DDL'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'journal_ci_reorder_probe'
  ),
  'reordered checksum failure does not create a table'
);

SELECT throws_ok(
  $miss$
  DO $journal_seg$
  DECLARE
    v_statements text[] := ARRAY[
      $journal_stmt$CREATE TABLE public.journal_ci_missing_probe (id integer PRIMARY KEY)$journal_stmt$
    ];
    v_expected text := md5(
      array_to_string(
        ARRAY[
          $journal_stmt$CREATE TABLE public.journal_ci_missing_probe (id integer PRIMARY KEY)$journal_stmt$,
          $journal_stmt$ALTER TABLE public.journal_ci_missing_probe ADD COLUMN note text$journal_stmt$
        ],
        E'\x1e'
      )
    );
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
  $miss$,
  'P0001',
  NULL,
  'missing statement fails the checksum before DDL'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'journal_notes'
      AND policyname IN (
        'journal_notes_select_own',
        'journal_notes_insert_own',
        'journal_notes_update_own',
        'journal_notes_delete_own'
      )
      AND coalesce(qual, '') LIKE '%journal_notes.user_id = auth.uid()%'
      AND coalesce(qual, '') LIKE '%journal_trades%'
  ),
  3,
  'notes SELECT/UPDATE/DELETE USING retain parent-trade ownership'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'journal_notes'
      AND policyname IN (
        'journal_notes_insert_own',
        'journal_notes_update_own'
      )
      AND coalesce(with_check, '') LIKE '%journal_notes.user_id = auth.uid()%'
      AND coalesce(with_check, '') LIKE '%t.id = journal_notes.trade_id%'
  ),
  2,
  'notes INSERT/UPDATE WITH CHECK retain parent-trade ownership'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname LIKE 'journal_rollback_%'
  ),
  'no public journal_rollback_* checkpoint tables exist'
);

SELECT * FROM finish();
ROLLBACK;
