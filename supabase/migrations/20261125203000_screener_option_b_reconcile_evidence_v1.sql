-- ISS-024 Layer C follow-on + Option B: reconcile must accept legitimately published
-- mixed-status feed evidence (Gappers prerequisite_unavailable gap_input_coverage_incomplete)
-- when companion tabs are evaluated and zero Gappers rows exist.
-- Apply ONLY after 20261116153000 in the same activation window (or when reconcile already exists).

CREATE OR REPLACE FUNCTION public.validate_screener_feed_reconcile_evidence_v1(
  p_tab_evaluation_evidence jsonb,
  p_gappers_result_rows integer
) RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_tab text;
  v_status text;
  v_managed_non_nhl text[] := ARRAY[
    'day_trade_radar',
    'gappers',
    'gainers_losers',
    'volume_spikes',
    'unusual_volume'
  ];
  v_all_evaluated boolean := true;
  v_gappers jsonb;
  v_unresolved integer;
BEGIN
  IF p_tab_evaluation_evidence IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tab_evidence_missing');
  END IF;

  BEGIN
    PERFORM public.assert_screener_tab_evaluation_evidence_v1(p_tab_evaluation_evidence);
  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'tab_evidence_invalid');
  END;

  FOREACH v_tab IN ARRAY v_managed_non_nhl LOOP
    v_status := p_tab_evaluation_evidence -> v_tab ->> 'status';
    IF v_status IS DISTINCT FROM 'evaluated' THEN
      v_all_evaluated := false;
      EXIT;
    END IF;
  END LOOP;

  IF v_all_evaluated
    AND (p_tab_evaluation_evidence -> 'new_highs_lows' ->> 'status') = 'evaluated' THEN
    RETURN jsonb_build_object('ok', true, 'mode', 'six_tab_evaluated');
  END IF;

  v_gappers := p_tab_evaluation_evidence -> 'gappers';
  v_unresolved := COALESCE((v_gappers ->> 'unresolved_gap_input_count')::integer, 0);

  IF (v_gappers ->> 'status') = 'prerequisite_unavailable'
    AND (v_gappers ->> 'reason') = 'gap_input_coverage_incomplete'
    AND v_unresolved > 0
    AND (p_tab_evaluation_evidence -> 'gainers_losers' ->> 'status') = 'evaluated'
    AND (p_tab_evaluation_evidence -> 'new_highs_lows' ->> 'status') = 'evaluated'
    AND (p_tab_evaluation_evidence -> 'day_trade_radar' ->> 'status') = 'evaluated'
    AND (p_tab_evaluation_evidence -> 'volume_spikes' ->> 'status') = 'evaluated'
    AND (p_tab_evaluation_evidence -> 'unusual_volume' ->> 'status') = 'evaluated'
  THEN
    IF p_gappers_result_rows <> 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'option_b_gappers_rows_must_be_empty');
    END IF;
    RETURN jsonb_build_object('ok', true, 'mode', 'option_b_degraded_gappers');
  END IF;

  IF (v_gappers ->> 'status') = 'prerequisite_unavailable'
    AND (v_gappers ->> 'reason') = 'gap_input_coverage_incomplete' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'option_b_companion_tabs_not_evaluated');
  END IF;

  RETURN jsonb_build_object('ok', false, 'reason', 'tab_evidence_not_evaluated');
END;
$$;

REVOKE ALL ON FUNCTION public.validate_screener_feed_reconcile_evidence_v1(jsonb, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_screener_feed_reconcile_evidence_v1(jsonb, integer)
  TO service_role;

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
  v_gappers_rows integer;
  v_evidence_gate jsonb;
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

  SELECT count(*)::integer INTO v_gappers_rows
  FROM public.screener_results r
  WHERE r.sync_run_id = v_job.sync_run_id
    AND r.tab_id = 'gappers';

  v_evidence_gate := public.validate_screener_feed_reconcile_evidence_v1(
    v_feed.tab_evaluation_evidence,
    v_gappers_rows
  );

  IF COALESCE((v_evidence_gate ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_evidence_gate;
  END IF;

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
    'rows_inserted', v_job.publish_rows_inserted,
    'reconcile_mode', v_evidence_gate ->> 'mode'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_screener_sync_staged_publish_v1(
  uuid, integer, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_screener_sync_staged_publish_v1(
  uuid, integer, timestamptz
) TO service_role;