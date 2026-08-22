BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT no_plan();

-- Intentional CREATE POLICY failure lives only in this test file.
-- Production migrations must not contain this injected failure.

CREATE TEMP TABLE m2_policy_snapshot AS
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('journal_accounts', 'journal_trades', 'journal_notes', 'journal_goals')
   OR (schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'journal_private_%');

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'journal_accounts'
  ),
  4,
  'journal_accounts starts with the complete target policy set'
);

SELECT throws_ok(
  $fail$
  DO $journal_pol$
  BEGIN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_accounts');
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_accounts_select_own', 'journal_accounts');
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_accounts_insert_own', 'journal_accounts');
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_accounts_update_own', 'journal_accounts');
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_accounts_delete_own', 'journal_accounts');
    EXECUTE $journal_create$
    CREATE POLICY "journal_accounts_select_own"
    ON public.journal_accounts
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid() AND __injected_failure__)
    $journal_create$;
  END;
  $journal_pol$;
  $fail$,
  '42703',
  NULL,
  'copied atomic replacement with an intentional CREATE POLICY failure raises'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'journal_accounts'
  ),
  4,
  'failing atomic statement restores every former journal_accounts policy'
);

SELECT ok(
  NOT EXISTS (
    SELECT s.policyname
    FROM m2_policy_snapshot s
    WHERE s.tablename = 'journal_accounts'
    EXCEPT
    SELECT p.policyname
    FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = 'journal_accounts'
  )
  AND NOT EXISTS (
    SELECT p.policyname
    FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = 'journal_accounts'
    EXCEPT
    SELECT s.policyname
    FROM m2_policy_snapshot s
    WHERE s.tablename = 'journal_accounts'
  ),
  'journal_accounts policy names match the pre-failure snapshot'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'journal_trades'
  ),
  (
    SELECT count(*)::integer
    FROM m2_policy_snapshot
    WHERE tablename = 'journal_trades'
  ),
  'policies on other existing tables were untouched'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'journal_notes'
  ),
  (
    SELECT count(*)::integer
    FROM m2_policy_snapshot
    WHERE tablename = 'journal_notes'
  ),
  'unrelated live-table policies remain after the injected failure'
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
  'storage journal-private policies were not modified by the table-level failure'
);

CREATE POLICY unexpected_ci_policy ON public.journal_tags
  FOR SELECT TO authenticated USING (true);

SELECT throws_ok(
  $pre$
  DO $journal_pre$
  DECLARE
    r record;
  BEGIN
    FOR r IN
      SELECT p.schemaname, p.tablename, p.policyname
      FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = 'journal_tags'
    LOOP
      IF r.policyname NOT IN (
        'journal_tags_select_own',
        'journal_tags_insert_own',
        'journal_tags_update_own',
        'journal_tags_delete_own'
      ) THEN
        RAISE EXCEPTION
          'preflight: unexpected policy %.% %',
          r.schemaname, r.tablename, r.policyname;
      END IF;
    END LOOP;
  END;
  $journal_pre$;
  $pre$,
  'P0001',
  NULL,
  'unexpected policies cause a pre-mutation exception'
);

DROP POLICY unexpected_ci_policy ON public.journal_tags;

-- Successful idempotent replacement for the same table, copied from Migration 2.
DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_accounts');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_accounts_select_own', 'journal_accounts');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_accounts_insert_own', 'journal_accounts');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_accounts_update_own', 'journal_accounts');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_accounts_delete_own', 'journal_accounts');
  EXECUTE $journal_create$
  CREATE POLICY "journal_accounts_select_own"
  ON public.journal_accounts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_accounts_insert_own"
  ON public.journal_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_accounts_update_own"
  ON public.journal_accounts
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_accounts_delete_own"
  ON public.journal_accounts
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'journal_accounts'
  ),
  4,
  'idempotent retry does not duplicate journal_accounts policies'
);

SELECT ok(
  (
    SELECT bool_and(qual LIKE '%auth.uid()%')
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'journal_accounts'
      AND policyname IN (
        'journal_accounts_select_own',
        'journal_accounts_update_own',
        'journal_accounts_delete_own'
      )
  ),
  'idempotent retry preserves auth.uid() ownership predicates'
);

-- Install the reviewed live legacy policy, then fail the table's atomic
-- replacement. Statement rollback must restore that complete legacy policy.
DROP POLICY IF EXISTS "journal_stats_cache_select_own" ON public.journal_stats_cache;
DROP POLICY IF EXISTS "journal_stats_cache_insert_own" ON public.journal_stats_cache;
DROP POLICY IF EXISTS "journal_stats_cache_update_own" ON public.journal_stats_cache;
DROP POLICY IF EXISTS "journal_stats_cache_delete_own" ON public.journal_stats_cache;
CREATE POLICY "Users can manage own stats cache"
  ON public.journal_stats_cache
  FOR ALL
  TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'journal_stats_cache'
  ),
  1,
  'legacy stats-cache policy is installed for failure injection'
);

SELECT throws_ok(
  $fail$
  DO $journal_pol$
  BEGIN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_stats_cache');
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Users can manage own stats cache', 'journal_stats_cache');
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_stats_cache_select_own', 'journal_stats_cache');
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_stats_cache_insert_own', 'journal_stats_cache');
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_stats_cache_update_own', 'journal_stats_cache');
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_stats_cache_delete_own', 'journal_stats_cache');
    EXECUTE $journal_create$
    CREATE POLICY "journal_stats_cache_select_own"
    ON public.journal_stats_cache
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid() AND __injected_failure__)
    $journal_create$;
  END;
  $journal_pol$;
  $fail$,
  '42703',
  NULL,
  'failing stats-cache replacement raises inside the atomic DO'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'journal_stats_cache'
  ),
  1,
  'atomic failure restores the complete legacy stats-cache policy'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'journal_stats_cache'
      AND policyname = 'Users can manage own stats cache'
  ),
  'restored policy is the reviewed live legacy name'
);

DO $journal_pol$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', 'journal_stats_cache');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Users can manage own stats cache', 'journal_stats_cache');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_stats_cache_select_own', 'journal_stats_cache');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_stats_cache_insert_own', 'journal_stats_cache');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_stats_cache_update_own', 'journal_stats_cache');
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'journal_stats_cache_delete_own', 'journal_stats_cache');
  EXECUTE $journal_create$
  CREATE POLICY "journal_stats_cache_select_own"
  ON public.journal_stats_cache
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_stats_cache_insert_own"
  ON public.journal_stats_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_stats_cache_update_own"
  ON public.journal_stats_cache
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid())
  $journal_create$;
  EXECUTE $journal_create$
  CREATE POLICY "journal_stats_cache_delete_own"
  ON public.journal_stats_cache
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid())
  $journal_create$;
END;
$journal_pol$;

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'journal_stats_cache'
  ),
  4,
  'supported idempotent path reinstalls the complete target stats-cache set'
);

SELECT * FROM finish();
ROLLBACK;
