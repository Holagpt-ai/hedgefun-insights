-- Batch 190.4: six-arg chunk advance must not be callable by PUBLIC / anon / authenticated.
-- 28220000 introduced a new function signature without REVOKE/GRANT (default PUBLIC EXECUTE).

REVOKE ALL ON FUNCTION public.advance_screener_sync_chunk_v1(
  uuid, uuid, integer, integer, jsonb, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_screener_sync_chunk_v1(
  uuid, uuid, integer, integer, jsonb, timestamptz
) FROM anon;
REVOKE ALL ON FUNCTION public.advance_screener_sync_chunk_v1(
  uuid, uuid, integer, integer, jsonb, timestamptz
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.advance_screener_sync_chunk_v1(
  uuid, uuid, integer, integer, jsonb, timestamptz
) TO service_role;
