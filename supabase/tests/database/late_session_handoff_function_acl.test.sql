BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT no_plan();

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'late_session_handoff_list_active_v1'
  ),
  'late_session_handoff_list_active_v1 exists'
);

SELECT ok(
  (
    SELECT p.prosecdef
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'late_session_handoff_list_active_v1'
      AND pg_get_function_identity_arguments(p.oid) = 'p_am_session_date date'
  ),
  'list_active remains SECURITY DEFINER'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.late_session_handoff_list_active_v1(date)',
    'EXECUTE'
  ),
  'anon cannot EXECUTE list_active'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.late_session_handoff_list_active_v1(date)',
    'EXECUTE'
  ),
  'authenticated can EXECUTE list_active'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.late_session_handoff_list_active_v1(date)',
    'EXECUTE'
  ),
  'service_role can EXECUTE list_active'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.late_session_handoff_upsert_v1(jsonb)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.late_session_handoff_expire_stale_v1(date)',
    'EXECUTE'
  ),
  'sibling handoff mutator RPCs remain non-callable by anon'
);

SELECT * FROM finish();
ROLLBACK;