-- Batch 190.1: atomic chunk advance + finalize claim (NOT APPLIED in Cursor).

CREATE OR REPLACE FUNCTION public.claim_screener_sync_lease_v1(
  p_job_id uuid,
  p_lease_token uuid,
  p_now timestamptz,
  p_lease_expires_at timestamptz,
  p_mode text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.screener_sync_generation_jobs;
BEGIN
  IF p_mode NOT IN ('chunk', 'finalize') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_mode');
  END IF;

  SELECT * INTO v_row FROM public.screener_sync_generation_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'generation_not_found');
  END IF;

  IF v_row.status IN ('published', 'aborted', 'failed') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'generation_not_active');
  END IF;

  IF p_mode = 'finalize' THEN
    IF v_row.next_chunk_index < v_row.total_chunks THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'chunks_incomplete');
    END IF;
    IF v_row.finalize_lease_expires_at IS NOT NULL
      AND v_row.finalize_lease_expires_at > p_now
      AND v_row.finalize_lease_token IS DISTINCT FROM p_lease_token THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'finalize_owner_conflict');
    END IF;
    UPDATE public.screener_sync_generation_jobs
    SET
      status = 'finalizing',
      finalize_lease_token = p_lease_token,
      finalize_lease_expires_at = p_lease_expires_at,
      lease_token = p_lease_token,
      lease_expires_at = p_lease_expires_at,
      updated_at = clock_timestamp()
    WHERE id = p_job_id
    RETURNING * INTO v_row;
    RETURN jsonb_build_object('ok', true, 'job', to_jsonb(v_row));
  END IF;

  IF v_row.next_chunk_index >= v_row.total_chunks THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'chunks_complete');
  END IF;

  IF v_row.lease_expires_at IS NOT NULL
    AND v_row.lease_expires_at > p_now
    AND v_row.lease_token IS DISTINCT FROM p_lease_token THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'lease_owner_conflict');
  END IF;

  UPDATE public.screener_sync_generation_jobs
  SET
    lease_token = p_lease_token,
    lease_expires_at = p_lease_expires_at,
    updated_at = clock_timestamp()
  WHERE id = p_job_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'job', to_jsonb(v_row));
END;
$$;

REVOKE ALL ON FUNCTION public.claim_screener_sync_lease_v1(uuid, uuid, timestamptz, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_screener_sync_lease_v1(uuid, uuid, timestamptz, timestamptz, text) TO service_role;

CREATE OR REPLACE FUNCTION public.advance_screener_sync_chunk_v1(
  p_job_id uuid,
  p_lease_token uuid,
  p_expected_chunk_index integer,
  p_expected_state_version integer,
  p_merged_artifacts jsonb,
  p_lease_expires_at timestamptz,
  p_now timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.screener_sync_generation_jobs;
  v_next integer;
BEGIN
  UPDATE public.screener_sync_generation_jobs j
  SET
    next_chunk_index = p_expected_chunk_index + 1,
    merged_artifacts = p_merged_artifacts,
    state_version = p_expected_state_version + 1,
    lease_token = p_lease_token,
    lease_expires_at = p_lease_expires_at,
    status = CASE
      WHEN (p_expected_chunk_index + 1) >= j.total_chunks THEN 'finalizing'
      ELSE 'chunking'
    END,
    updated_at = clock_timestamp()
  WHERE j.id = p_job_id
    AND j.status IN ('chunking', 'finalizing')
    AND j.next_chunk_index = p_expected_chunk_index
    AND j.state_version = p_expected_state_version
    AND j.lease_token = p_lease_token
    AND (j.lease_expires_at IS NULL OR j.lease_expires_at > p_now)
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'chunk_advance_rejected');
  END IF;

  RETURN jsonb_build_object('ok', true, 'job', to_jsonb(v_row));
END;
$$;

REVOKE ALL ON FUNCTION public.advance_screener_sync_chunk_v1(uuid, uuid, integer, integer, jsonb, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_screener_sync_chunk_v1(uuid, uuid, integer, integer, jsonb, timestamptz, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_screener_sync_publish_v1(
  p_job_id uuid,
  p_finalize_lease_token uuid,
  p_expected_state_version integer,
  p_now timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.screener_sync_generation_jobs;
BEGIN
  UPDATE public.screener_sync_generation_jobs j
  SET
    status = 'published',
    state_version = p_expected_state_version + 1,
    lease_token = NULL,
    lease_expires_at = NULL,
    finalize_lease_token = NULL,
    finalize_lease_expires_at = NULL,
    continue_last_error = NULL,
    updated_at = clock_timestamp()
  WHERE j.id = p_job_id
    AND j.status = 'finalizing'
    AND j.state_version = p_expected_state_version
    AND j.finalize_lease_token = p_finalize_lease_token
    AND (j.finalize_lease_expires_at IS NULL OR j.finalize_lease_expires_at > p_now)
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'publish_complete_rejected');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_screener_sync_publish_v1(uuid, uuid, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_screener_sync_publish_v1(uuid, uuid, integer, timestamptz) TO service_role;
