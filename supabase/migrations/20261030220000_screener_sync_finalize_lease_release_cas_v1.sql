-- Batch 190.7: atomic CAS release of stranded finalize leases (pre-publish only).
-- NOT APPLIED in Cursor — Lovable Cloud applies when approved with Edge 190.7.

CREATE OR REPLACE FUNCTION public.release_screener_sync_finalize_lease_cas_v1(
  p_job_id uuid,
  p_expected_state_version integer,
  p_expected_finalize_lease_token uuid,
  p_now timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  IF p_job_id IS NULL OR p_expected_finalize_lease_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  UPDATE public.screener_sync_generation_jobs j
  SET
    finalize_lease_token = NULL,
    finalize_lease_expires_at = NULL,
    lease_token = NULL,
    lease_expires_at = NULL,
    updated_at = clock_timestamp()
  WHERE j.id = p_job_id
    AND j.status = 'finalizing'
    AND j.publish_rows_inserted IS NULL
    AND j.state_version = p_expected_state_version
    AND j.finalize_lease_token IS NOT DISTINCT FROM p_expected_finalize_lease_token;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 1 THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  RETURN jsonb_build_object('ok', false, 'reason', 'release_cas_rejected');
END;
$$;

REVOKE ALL ON FUNCTION public.release_screener_sync_finalize_lease_cas_v1(
  uuid, integer, uuid, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_screener_sync_finalize_lease_cas_v1(
  uuid, integer, uuid, timestamptz
) TO service_role;
