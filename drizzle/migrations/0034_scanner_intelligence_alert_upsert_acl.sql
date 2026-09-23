REVOKE ALL ON FUNCTION public.scanner_intelligence_alert_upsert_v1(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scanner_intelligence_alert_upsert_v1(jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';