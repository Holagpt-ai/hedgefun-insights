-- Late-session AM Inbox read RPC ACL hardening (forward-only).
-- Intended policy: authenticated + service_role EXECUTE only.
-- Upsert/expire paths were hardened in 20260923220000_launch_cleanup_security_v1;
-- list_active retained PUBLIC revoke only and was re-granted without explicit anon revoke.

REVOKE ALL ON FUNCTION public.late_session_handoff_list_active_v1(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.late_session_handoff_list_active_v1(date) TO authenticated, service_role;