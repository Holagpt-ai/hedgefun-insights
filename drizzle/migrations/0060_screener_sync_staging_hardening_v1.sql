-- Batch 190.2: lease handoff, active-generation exclusivity, publish crash safety.
-- NOT APPLIED in Cursor — Lovable Cloud applies when approved.

ALTER TABLE public.screener_sync_generation_jobs
  ADD COLUMN IF NOT EXISTS publish_rows_inserted integer,
  ADD COLUMN IF NOT EXISTS publish_rpc_recorded_at timestamptz;

COMMENT ON COLUMN public.screener_sync_generation_jobs.publish_rows_inserted IS
  'Set after replace_screener_results_generation_v1 succeeds; enables idempotent finalize completion.';

CREATE UNIQUE INDEX IF NOT EXISTS screener_sync_one_active_generation_uq
  ON public.screener_sync_generation_jobs ((1))
  WHERE status IN ('chunking', 'finalizing');

CREATE OR REPLACE FUNCTION public.advance_screener_sync_chunk_v1(
  p_job_id uuid,
  p_lease_token uuid,
  p_expected_chunk_index integer,
  p_expected_state_version integer,
  p_merged_artifacts jsonb,
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
    next_chunk_index = p_expected_chunk_index + 1,
    merged_artifacts = p_merged_artifacts,
    state_version = p_expected_state_version + 1,
    lease_token = NULL,
    lease_expires_at = NULL,
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

CREATE OR REPLACE FUNCTION public.record_screener_sync_publish_rpc_v1(
  p_job_id uuid,
  p_finalize_lease_token uuid,
  p_expected_state_version integer,
  p_sync_run_id uuid,
  p_rows_inserted integer,
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
    publish_rows_inserted = p_rows_inserted,
    publish_rpc_recorded_at = p_now,
    state_version = p_expected_state_version + 1,
    updated_at = clock_timestamp()
  WHERE j.id = p_job_id
    AND j.status = 'finalizing'
    AND j.state_version = p_expected_state_version
    AND j.finalize_lease_token = p_finalize_lease_token
    AND (j.finalize_lease_expires_at IS NULL OR j.finalize_lease_expires_at > p_now)
    AND j.sync_run_id = p_sync_run_id
    AND (j.publish_rows_inserted IS NULL OR j.publish_rows_inserted = p_rows_inserted)
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'publish_rpc_record_rejected');
  END IF;

  RETURN jsonb_build_object('ok', true, 'job', to_jsonb(v_row));
END;
$$;

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
    AND j.publish_rows_inserted IS NOT NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'publish_complete_rejected');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.record_screener_sync_publish_rpc_v1(uuid, uuid, integer, uuid, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_screener_sync_publish_rpc_v1(uuid, uuid, integer, uuid, integer, timestamptz) TO service_role;