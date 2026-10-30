-- Batch 190.5: explicit revoke anon/authenticated EXECUTE on remaining staging sync RPCs.
-- Lovable production retained direct platform-role grants after PUBLIC revoke in git migrations.

REVOKE ALL ON FUNCTION public.claim_screener_sync_lease_v1(
  uuid, uuid, timestamptz, timestamptz, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_screener_sync_lease_v1(
  uuid, uuid, timestamptz, timestamptz, text
) TO service_role;

REVOKE ALL ON FUNCTION public.complete_screener_sync_publish_v1(
  uuid, uuid, integer, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_screener_sync_publish_v1(
  uuid, uuid, integer, timestamptz
) TO service_role;

REVOKE ALL ON FUNCTION public.record_screener_sync_publish_rpc_v1(
  uuid, uuid, integer, uuid, integer, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_screener_sync_publish_rpc_v1(
  uuid, uuid, integer, uuid, integer, timestamptz
) TO service_role;

REVOKE ALL ON FUNCTION public.expire_screener_sync_stale_jobs_v1(
  timestamptz, interval
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_screener_sync_stale_jobs_v1(
  timestamptz, interval
) TO service_role;

REVOKE ALL ON FUNCTION public.publish_screener_sync_staged_generation_v1(
  uuid, uuid, integer, jsonb, uuid, timestamptz, text, jsonb, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_screener_sync_staged_generation_v1(
  uuid, uuid, integer, jsonb, uuid, timestamptz, text, jsonb, timestamptz
) TO service_role;
