
-- Defense-in-depth for public.profiles sensitive columns.
-- 1) Ensure the protective trigger is attached (function already exists).
--    Drop duplicate then recreate a single, canonical trigger.
DROP TRIGGER IF EXISTS protect_profile_sensitive_columns_trg ON public.profiles;
DROP TRIGGER IF EXISTS protect_profile_sensitive_columns_trigger ON public.profiles;

CREATE TRIGGER protect_profile_sensitive_columns_trigger
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_sensitive_columns();

-- 2) Column-level UPDATE privileges: revoke table-wide UPDATE from
--    authenticated, then grant UPDATE only on user-editable columns.
--    service_role retains ALL for Stripe webhooks / edge functions.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, avatar_url, preferred_language, preferred_theme)
  ON public.profiles TO authenticated;

-- SELECT / INSERT / DELETE grants stay as-is (managed by existing RLS).
GRANT ALL ON public.profiles TO service_role;
