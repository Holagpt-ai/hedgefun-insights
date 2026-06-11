-- Attach the existing protection trigger AND restrict column-level UPDATE privileges
-- so authenticated users cannot self-assign billing/plan fields on profiles.

DROP TRIGGER IF EXISTS protect_profile_sensitive_columns_trigger ON public.profiles;
CREATE TRIGGER protect_profile_sensitive_columns_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_columns();

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, avatar_url, preferred_language, preferred_theme) ON public.profiles TO authenticated;