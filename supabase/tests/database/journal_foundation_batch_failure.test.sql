BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT no_plan();

-- Simulated mid-foundation batch failure after a successful foundation apply.
-- Default privileges are restored at the end of foundation; this test re-enters
-- the quarantine window inside a savepoint, matching a failed later batch.

CREATE OR REPLACE FUNCTION journal_ci_auth(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION journal_ci_user(p_id uuid, p_email text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    p_id, 'authenticated', 'authenticated', p_email,
    '$2a$10$ci.placeholder.hash.value.zzzzzz', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', ''
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;

SELECT journal_ci_user('11111111-1111-4111-8111-0000000000bb', 'journal-m1-batch@example.test');

SAVEPOINT batch_fail;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;

SELECT throws_ok(
  $batch$
  DO $journal_seg$
  DECLARE
    v_statements text[] := ARRAY[
      $journal_stmt$CREATE TABLE public.journal_ci_batch_probe (id uuid PRIMARY KEY)$journal_stmt$,
      $journal_stmt$ALTER TABLE public.journal_ci_batch_probe ADD CONSTRAINT journal_ci_batch_probe_fail CHECK (__missing__)$journal_stmt$
    ];
    v_expected text;
    v_digest text;
    v_stmt text;
  BEGIN
    v_expected := md5(array_to_string(v_statements, E'\x1e'));
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
  $batch$,
  '42703',
  NULL,
  'a mid-batch invalid statement raises and rolls back the wrapper'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'journal_ci_batch_probe'
  ),
  'failed foundation batch does not leave the new table'
);

CREATE TABLE public.journal_ci_quarantine_after_batch (
  id uuid PRIMARY KEY
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.journal_ci_quarantine_after_batch', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.journal_ci_quarantine_after_batch', 'SELECT'),
  'default ACL quarantine remains in force after the simulated batch failure'
);

ROLLBACK TO SAVEPOINT batch_fail;

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN (
      'journal_ci_batch_probe',
      'journal_ci_quarantine_after_batch'
    )
  ),
  'savepoint rollback removes quarantine-window probe tables'
);

SELECT journal_ci_auth('11111111-1111-4111-8111-0000000000bb');
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $q$INSERT INTO public.journal_trades (
    user_id, symbol, side, status, qty, entry_price, entry_date
  ) VALUES (
    '11111111-1111-4111-8111-0000000000bb',
    'BATCH', 'long', 'open', 1, 1, now()
  )$q$,
  'existing live trades table remains available after a rolled-back batch'
);

SELECT throws_ok(
  $q$SELECT count(*) FROM public.journal_accounts$q$,
  '42501',
  NULL,
  'new Journal tables remain inaccessible after Migration 1'
);

RESET ROLE;

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'journal_trades'
      AND policyname = 'Users can manage own trades'
  ),
  'live trades policy remains after the simulated batch failure'
);

SELECT * FROM finish();
ROLLBACK;
