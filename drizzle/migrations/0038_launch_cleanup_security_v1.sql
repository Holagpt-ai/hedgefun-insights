DROP POLICY IF EXISTS late_session_handoffs_select_authenticated
  ON public.late_session_continuation_handoffs;

REVOKE ALL ON TABLE public.late_session_continuation_handoffs FROM PUBLIC;
REVOKE ALL ON TABLE public.late_session_continuation_handoffs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.late_session_continuation_handoffs TO service_role;

REVOKE ALL ON FUNCTION public.late_session_handoff_upsert_v1(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.late_session_handoff_upsert_v1(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.late_session_handoff_expire_stale_v1(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.late_session_handoff_expire_stale_v1(date) TO service_role;

GRANT EXECUTE ON FUNCTION public.late_session_handoff_list_active_v1(date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.scanner_intelligence_alert_upsert_v1(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scanner_intelligence_alert_upsert_v1(jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';