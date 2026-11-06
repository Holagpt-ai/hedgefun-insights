-- Batch 190.12: post-publication reconciliation for stranded finalizing jobs (ISS-034).
-- Forward-only. Lovable Cloud applies when approved with sync-screener-data Edge deploy.

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

REVOKE ALL ON FUNCTION public.reconcile_screener_sync_staged_publish_v1(
  uuid, integer, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_screener_sync_staged_publish_v1(
  uuid, integer, timestamptz
) TO service_role;
