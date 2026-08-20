BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT no_plan();

-- Disposable Migration 1 gate. Apply foundation 20260816191000-20260816191120 only.
-- Never connect this test to the live Supabase project.

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

SELECT journal_ci_user('11111111-1111-4111-8111-0000000000aa', 'journal-m1-a@example.test');

SELECT ok(
  (
    SELECT bool_and(c.relrowsecurity)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname IN (
        'journal_accounts',
        'journal_executions',
        'journal_trader_profiles',
        'journal_import_jobs',
        'journal_event_outbox'
      )
  ),
  'new Journal tables are RLS-enabled after Migration 1'
);

SELECT ok(
  (
    SELECT count(*) = 0
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'journal_accounts',
        'journal_executions',
        'journal_trader_profiles',
        'journal_import_jobs',
        'journal_event_outbox'
      )
  ),
  'new Journal tables have no policies before Migration 2'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.journal_accounts', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.journal_accounts', 'INSERT')
  AND NOT has_table_privilege('anon', 'public.journal_accounts', 'UPDATE')
  AND NOT has_table_privilege('anon', 'public.journal_accounts', 'DELETE')
  AND NOT has_table_privilege('anon', 'public.journal_executions', 'SELECT'),
  'anon cannot DML new Journal tables after Migration 1'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.journal_accounts', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.journal_accounts', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.journal_accounts', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.journal_accounts', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.journal_executions', 'SELECT'),
  'authenticated cannot access new Journal tables before Migration 2'
);

SELECT ok(
  has_table_privilege('service_role', 'public.journal_accounts', 'SELECT')
  AND has_table_privilege('service_role', 'public.journal_accounts', 'INSERT')
  AND has_table_privilege('service_role', 'public.journal_accounts', 'UPDATE')
  AND has_table_privilege('service_role', 'public.journal_accounts', 'DELETE')
  AND has_table_privilege('service_role', 'public.journal_executions', 'SELECT'),
  'service_role retains required access to new Journal tables'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'journal_trades'
      AND policyname = 'Users can manage own trades'
  ),
  'stubbed live journal_trades keeps its previous RLS policy'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'journal_notes'
      AND policyname = 'Users can manage own notes'
  ),
  'stubbed live journal_notes keeps its previous RLS policy'
);

SELECT journal_ci_auth('11111111-1111-4111-8111-0000000000aa');
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $q$INSERT INTO public.journal_trades (
    user_id, symbol, side, status, qty, entry_price, entry_date
  ) VALUES (
    '11111111-1111-4111-8111-0000000000aa',
    'M1', 'long', 'open', 1, 1, now()
  )$q$,
  'authenticated can insert an owned row on the live trades table after Migration 1'
);

SELECT throws_ok(
  $q$SELECT count(*) FROM public.journal_accounts$q$,
  '42501',
  NULL,
  'authenticated SELECT on a new table is denied before Migration 2'
);

RESET ROLE;

CREATE TABLE public.journal_ci_default_priv_probe (
  id uuid PRIMARY KEY
);

SELECT ok(
  has_table_privilege('anon', 'public.journal_ci_default_priv_probe', 'SELECT')
  AND has_table_privilege('authenticated', 'public.journal_ci_default_priv_probe', 'SELECT'),
  'live-style default table privileges are restored after Migration 1 completes'
);

DROP TABLE public.journal_ci_default_priv_probe;

SAVEPOINT m1_quarantine_window;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
CREATE TABLE public.journal_ci_quarantine_probe (
  id uuid PRIMARY KEY
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.journal_ci_quarantine_probe', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.journal_ci_quarantine_probe', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.journal_ci_quarantine_probe', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.journal_ci_quarantine_probe', 'INSERT'),
  'failure after quarantine leaves a newly created table inaccessible to anon and authenticated'
);

ROLLBACK TO SAVEPOINT m1_quarantine_window;

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'journal_ci_quarantine_probe'
  ),
  'quarantine probe table does not remain after the simulated failure window'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname LIKE 'journal_rollback_%'
  ),
  'Migration 1 created no public journal_rollback_* checkpoint tables'
);

SELECT * FROM finish();
ROLLBACK;
