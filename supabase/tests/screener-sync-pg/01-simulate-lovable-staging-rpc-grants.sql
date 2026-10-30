-- Disposable Postgres only: reproduce Lovable Cloud direct EXECUTE grants on staging RPCs
-- after Batch 190 migrations (PUBLIC revoked in git, platform roles still granted in prod).

GRANT EXECUTE ON FUNCTION public.claim_screener_sync_lease_v1(
  uuid, uuid, timestamptz, timestamptz, text
) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_screener_sync_publish_v1(
  uuid, uuid, integer, timestamptz
) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_screener_sync_publish_rpc_v1(
  uuid, uuid, integer, uuid, integer, timestamptz
) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.expire_screener_sync_stale_jobs_v1(
  timestamptz, interval
) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.publish_screener_sync_staged_generation_v1(
  uuid, uuid, integer, jsonb, uuid, timestamptz, text, jsonb, timestamptz
) TO anon, authenticated;
