-- ISS-024 / Batch 191 Layer C: durable per-generation tab evaluation evidence on published jobs.
-- Forward-only. NOT APPLIED in Cursor — Lovable Cloud applies when approved.
-- Pre-migration published jobs retain NULL tab_evaluation_evidence (Layer C unavailable for those generations).

ALTER TABLE public.screener_sync_generation_jobs
  ADD COLUMN IF NOT EXISTS tab_evaluation_evidence jsonb,
  ADD COLUMN IF NOT EXISTS published_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_nhl_baseline_status text;

COMMENT ON COLUMN public.screener_sync_generation_jobs.tab_evaluation_evidence IS
  'Six-tab evaluation evidence snapshot at atomic publish time (same payload as screener_feed_state.tab_evaluation_evidence for this sync_run_id). NULL for jobs published before Layer C or non-publish terminal states.';

COMMENT ON COLUMN public.screener_sync_generation_jobs.published_synced_at IS
  'Feed synced_at written with replace_screener_results_generation_v1 for this job publish.';

COMMENT ON COLUMN public.screener_sync_generation_jobs.published_nhl_baseline_status IS
  'NHL baseline status at publish (mirrors replace_screener_results_generation_v1 p_nhl_baseline_status).';

ALTER TABLE public.screener_sync_generation_jobs
  DROP CONSTRAINT IF EXISTS screener_sync_generation_jobs_published_nhl_status_check;

ALTER TABLE public.screener_sync_generation_jobs
  ADD CONSTRAINT screener_sync_generation_jobs_published_nhl_status_check
  CHECK (
    published_nhl_baseline_status IS NULL
    OR published_nhl_baseline_status IN ('available', 'initializing', 'unavailable')
  );

CREATE OR REPLACE FUNCTION public.assert_screener_tab_evaluation_evidence_v1(
  p_tab_evaluation_evidence jsonb
) RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_managed_tabs text[] := ARRAY[
    'day_trade_radar',
    'gappers',
    'gainers_losers',
    'new_highs_lows',
    'volume_spikes',
    'unusual_volume'
  ];
  v_evidence_key text;
BEGIN
  IF p_tab_evaluation_evidence IS NULL THEN
    RAISE EXCEPTION 'tab_evaluation_evidence required';
  END IF;
  IF jsonb_typeof(p_tab_evaluation_evidence) <> 'object' THEN
    RAISE EXCEPTION 'tab_evaluation_evidence must be an object';
  END IF;
  FOR v_evidence_key IN SELECT jsonb_object_keys(p_tab_evaluation_evidence)
  LOOP
    IF NOT (v_evidence_key = ANY (v_managed_tabs)) THEN
      RAISE EXCEPTION 'invalid tab_evaluation_evidence key';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_screener_tab_evaluation_evidence_v1(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_screener_tab_evaluation_evidence_v1(jsonb) TO service_role;

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
    IF v_job.tab_evaluation_evidence IS NULL AND p_tab_evaluation_evidence IS NOT NULL THEN
      PERFORM public.assert_screener_tab_evaluation_evidence_v1(p_tab_evaluation_evidence);
      UPDATE public.screener_sync_generation_jobs j
      SET
        tab_evaluation_evidence = p_tab_evaluation_evidence,
        published_synced_at = COALESCE(j.published_synced_at, p_synced_at),
        published_nhl_baseline_status = COALESCE(j.published_nhl_baseline_status, p_nhl_baseline_status),
        updated_at = clock_timestamp()
      WHERE j.id = p_job_id
      RETURNING * INTO v_job;
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

  PERFORM public.assert_screener_tab_evaluation_evidence_v1(p_tab_evaluation_evidence);

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
    tab_evaluation_evidence = p_tab_evaluation_evidence,
    published_synced_at = p_synced_at,
    published_nhl_baseline_status = p_nhl_baseline_status,
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
    AND j.tab_evaluation_evidence IS NOT NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'publish_complete_rejected');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_screener_sync_staged_publish_v1(
  p_job_id uuid,
  p_expected_state_version integer,
  p_now timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.screener_sync_generation_jobs;
  v_feed public.screener_feed_state;
  v_row_count integer;
  v_tab text;
  v_required_tabs text[] := ARRAY[
    'gappers',
    'gainers_losers',
    'new_highs_lows',
    'volume_spikes',
    'unusual_volume',
    'day_trade_radar'
  ];
BEGIN
  IF p_job_id IS NULL OR p_expected_state_version IS NULL OR p_now IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  SELECT * INTO v_job
  FROM public.screener_sync_generation_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'generation_not_found');
  END IF;

  IF v_job.status = 'published' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'job_id', v_job.id);
  END IF;

  IF v_job.status <> 'finalizing' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_finalizing');
  END IF;

  IF v_job.next_chunk_index < v_job.total_chunks THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'chunks_incomplete');
  END IF;

  IF v_job.publish_rows_inserted IS NULL OR v_job.publish_rpc_recorded_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'publish_not_recorded');
  END IF;

  IF v_job.state_version IS DISTINCT FROM p_expected_state_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'state_version_conflict');
  END IF;

  IF v_job.finalize_lease_expires_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'finalize_lease_expiry_missing');
  END IF;

  IF v_job.finalize_lease_expires_at > p_now THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'finalize_lease_still_active');
  END IF;

  SELECT * INTO v_feed
  FROM public.screener_feed_state f
  WHERE f.state_key = 'current';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'feed_state_missing');
  END IF;

  IF v_feed.sync_run_id IS DISTINCT FROM v_job.sync_run_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'feed_generation_mismatch');
  END IF;

  IF v_feed.rows_inserted IS DISTINCT FROM v_job.publish_rows_inserted THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'feed_row_count_mismatch');
  END IF;

  IF v_feed.tab_evaluation_evidence IS NULL
    OR jsonb_typeof(v_feed.tab_evaluation_evidence) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tab_evidence_missing');
  END IF;

  IF v_job.tab_evaluation_evidence IS NOT NULL
    AND v_job.tab_evaluation_evidence IS DISTINCT FROM v_feed.tab_evaluation_evidence THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'job_feed_evidence_mismatch');
  END IF;

  FOREACH v_tab IN ARRAY v_required_tabs LOOP
    IF NOT (v_feed.tab_evaluation_evidence ? v_tab) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'tab_evidence_incomplete');
    END IF;
    IF COALESCE(v_feed.tab_evaluation_evidence -> v_tab ->> 'status', '') <> 'evaluated' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'tab_evidence_not_evaluated');
    END IF;
  END LOOP;

  SELECT count(*)::integer INTO v_row_count
  FROM public.screener_results r
  WHERE r.sync_run_id = v_job.sync_run_id;

  IF v_row_count IS DISTINCT FROM v_job.publish_rows_inserted THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'published_row_count_mismatch');
  END IF;

  UPDATE public.screener_sync_generation_jobs j
  SET
    status = 'published',
    tab_evaluation_evidence = COALESCE(j.tab_evaluation_evidence, v_feed.tab_evaluation_evidence),
    published_synced_at = COALESCE(j.published_synced_at, v_feed.synced_at),
    published_nhl_baseline_status = COALESCE(j.published_nhl_baseline_status, v_feed.nhl_baseline_status),
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
    AND j.publish_rows_inserted IS NOT NULL
    AND j.publish_rpc_recorded_at IS NOT NULL
  RETURNING * INTO v_job;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'reconcile_cas_rejected');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'job_id', v_job.id,
    'sync_run_id', v_job.sync_run_id,
    'rows_inserted', v_job.publish_rows_inserted
  );
END;
$$;