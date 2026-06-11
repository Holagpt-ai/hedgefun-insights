
-- 1. Restrict daily_briefs SELECT to service_role only; clients receive content via edge function
DROP POLICY IF EXISTS "Authenticated users can read daily briefs" ON public.daily_briefs;
DROP POLICY IF EXISTS "daily_briefs_select_authenticated" ON public.daily_briefs;
DROP POLICY IF EXISTS "Anyone authenticated can view briefs" ON public.daily_briefs;
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='daily_briefs' AND cmd='SELECT' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.daily_briefs', pol.policyname);
  END LOOP;
END $$;
REVOKE SELECT ON public.daily_briefs FROM authenticated, anon;

-- 2. Attach trigger that protects sensitive profile columns from client UPDATE
DROP TRIGGER IF EXISTS protect_profile_sensitive_columns_trigger ON public.profiles;
CREATE TRIGGER protect_profile_sensitive_columns_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_columns();

-- 3. Watchlists: enforce NOT NULL user_id and tighten policy
DELETE FROM public.watchlists WHERE user_id IS NULL;
ALTER TABLE public.watchlists ALTER COLUMN user_id SET NOT NULL;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='watchlists' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.watchlists', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users manage own watchlist"
  ON public.watchlists FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);
