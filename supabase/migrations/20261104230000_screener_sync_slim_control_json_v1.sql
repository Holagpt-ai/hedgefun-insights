-- Batch 190.15: staging RPCs that callers use only for lease/CAS state
-- return a control object. Claim still returns the full job row because
-- chunk and finalize consumers read all_tickers, gainers, losers, merged
-- artifacts, and the frozen NHL snapshot.
-- NOT APPLIED in Cursor. Lovable Cloud applies when approved.

CREATE OR REPLACE FUNCTION public.screener_sync_job_control_v1(
  j public.screener_sync_generation_jobs
) RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', j.id,
    'status', j.status,
    'state_version', j.state_version,
    'next_chunk_index', j.next_chunk_index,
    'total_chunks', j.total_chunks,
    'chunk_size', j.chunk_size,
    'sync_run_id', j.sync_run_id,
    'publish_rows_inserted', j.publish_rows_inserted,
    'publish_rpc_recorded_at', j.publish_rpc_recorded_at,
    'finalize_lease_token', j.finalize_lease_token,
    'finalize_lease_expires_at', j.finalize_lease_expires_at,
    'lease_token', j.lease_token,
    'lease_expires_at', j.lease_expires_at
  );
$$;

REVOKE ALL ON FUNCTION public.screener_sync_job_control_v1(public.screener_sync_generation_jobs) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.screener_sync_job_control_v1(public.screener_sync_generation_jobs) TO service_role;

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

  RETURN jsonb_build_object(
    'ok', true,
    'control', public.screener_sync_job_control_v1(v_row)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.advance_screener_sync_chunk_v1(
  uuid, uuid, integer, integer, jsonb, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_screener_sync_chunk_v1(
  uuid, uuid, integer, integer, jsonb, timestamptz
) TO service_role;

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

  RETURN jsonb_build_object(
    'ok', true,
    'control', public.screener_sync_job_control_v1(v_row)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_screener_sync_publish_rpc_v1(
  uuid, uuid, integer, uuid, integer, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_screener_sync_publish_rpc_v1(
  uuid, uuid, integer, uuid, integer, timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION public.publish_screener_sync_staged_generation_v1(
  p_job_id uuid,
  p_finalize_lease_token uuid,
  p_expected_state_version integer,
  p_rows jsonb,
  p_sync_run_id uuid,
  p_synced_at timestamptz,
  p_nhl_baseline_status text,
  p_tab_evaluation_evidence jsonb,
  p_now timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.screener_sync_generation_jobs;
  v_feed_sync_run uuid;
  v_feed_synced_at timestamptz;
  v_inserted integer;
  v_expected_rows integer;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_rows');
  END IF;
  v_expected_rows := jsonb_array_length(p_rows);

  SELECT * INTO v_job
  FROM public.screener_sync_generation_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'generation_not_found');
  END IF;

  IF v_job.status = 'published' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'rows_inserted', v_job.publish_rows_inserted,
      'control', public.screener_sync_job_control_v1(v_job)
    );
  END IF;

  IF v_job.status <> 'finalizing' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_finalizing');
  END IF;

  IF v_job.sync_run_id IS DISTINCT FROM p_sync_run_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sync_run_id_mismatch');
  END IF;

  IF v_job.finalize_lease_token IS DISTINCT FROM p_finalize_lease_token THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'finalize_owner_conflict');
  END IF;

  IF v_job.finalize_lease_expires_at IS NOT NULL
    AND v_job.finalize_lease_expires_at <= p_now THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'finalize_lease_expired');
  END IF;

  IF v_job.publish_rows_inserted IS NOT NULL THEN
    IF v_job.publish_rows_inserted <> v_expected_rows THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'publish_rows_replay_mismatch');
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'rows_inserted', v_job.publish_rows_inserted,
      'control', public.screener_sync_job_control_v1(v_job)
    );
  END IF;

  IF v_job.state_version <> p_expected_state_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'state_version_conflict');
  END IF;

  SELECT f.sync_run_id, f.synced_at
  INTO v_feed_sync_run, v_feed_synced_at
  FROM public.screener_feed_state f
  WHERE f.state_key = 'current';

  IF FOUND
    AND v_feed_sync_run IS DISTINCT FROM p_sync_run_id
    AND v_feed_synced_at >= p_synced_at THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'newer_generation_live');
  END IF;

  v_inserted := public.replace_screener_results_generation_v1(
    p_rows,
    p_sync_run_id,
    p_synced_at,
    p_nhl_baseline_status,
    p_tab_evaluation_evidence
  );

  IF v_inserted IS DISTINCT FROM v_expected_rows THEN
    RAISE EXCEPTION 'replace_generation_count_mismatch';
  END IF;

  UPDATE public.screener_sync_generation_jobs j
  SET
    publish_rows_inserted = v_inserted,
    publish_rpc_recorded_at = p_now,
    state_version = p_expected_state_version + 1,
    updated_at = clock_timestamp()
  WHERE j.id = p_job_id
    AND j.status = 'finalizing'
    AND j.state_version = p_expected_state_version
    AND j.finalize_lease_token = p_finalize_lease_token
    AND j.publish_rows_inserted IS NULL
  RETURNING * INTO v_job;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'publish_record_rejected');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'rows_inserted', v_inserted,
    'control', public.screener_sync_job_control_v1(v_job)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_screener_sync_staged_generation_v1(
  uuid, uuid, integer, jsonb, uuid, timestamptz, text, jsonb, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_screener_sync_staged_generation_v1(
  uuid, uuid, integer, jsonb, uuid, timestamptz, text, jsonb, timestamptz
) TO service_role;
