-- Batch 190.3: expiry recovery, atomic staged publish, advance RPC signature cleanup.
-- NOT APPLIED in Cursor — Lovable Cloud applies when approved.

-- Gate 3: remove obsolete seven-argument chunk advance (28210000); 28220000 six-arg remains canonical.
DROP FUNCTION IF EXISTS public.advance_screener_sync_chunk_v1(
  uuid,
  uuid,
  integer,
  integer,
  jsonb,
  timestamptz,
  timestamptz
);

CREATE OR REPLACE FUNCTION public.expire_screener_sync_stale_jobs_v1(
  p_now timestamptz,
  p_job_ttl interval DEFAULT interval '25 minutes'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aborted integer := 0;
BEGIN
  IF p_job_ttl IS NULL OR p_job_ttl <= interval '0' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_ttl');
  END IF;

  UPDATE public.screener_sync_generation_jobs j
  SET
    status = 'aborted',
    lease_token = NULL,
    lease_expires_at = NULL,
    finalize_lease_token = NULL,
    finalize_lease_expires_at = NULL,
    updated_at = clock_timestamp()
  WHERE j.status IN ('chunking', 'finalizing')
    AND (
      j.created_at < p_now - p_job_ttl
      OR (
        j.status = 'finalizing'
        AND j.publish_rows_inserted IS NULL
        AND j.finalize_lease_expires_at IS NOT NULL
        AND j.finalize_lease_expires_at < p_now
      )
    )
    AND NOT (
      j.status = 'finalizing'
      AND j.publish_rows_inserted IS NOT NULL
    );

  GET DIAGNOSTICS v_aborted = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'aborted_count', v_aborted);
END;
$$;

REVOKE ALL ON FUNCTION public.expire_screener_sync_stale_jobs_v1(timestamptz, interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_screener_sync_stale_jobs_v1(timestamptz, interval) TO service_role;

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
      'job', to_jsonb(v_job)
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
      'job', to_jsonb(v_job)
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
    'job', to_jsonb(v_job)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_screener_sync_staged_generation_v1(
  uuid, uuid, integer, jsonb, uuid, timestamptz, text, jsonb, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_screener_sync_staged_generation_v1(
  uuid, uuid, integer, jsonb, uuid, timestamptz, text, jsonb, timestamptz
) TO service_role;