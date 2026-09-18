CREATE OR REPLACE FUNCTION public.copy_screener_daily_volume_history_for_finalize_v1(
  p_target_generation_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $copyfin$
DECLARE
  v_source uuid;
  v_inserted integer := 0;
  v_symbols text[];
BEGIN
  IF p_target_generation_id IS NULL THEN
    RAISE EXCEPTION 'generation_id required';
  END IF;

  SELECT h.generation_id INTO v_source
  FROM public.screener_daily_volume_history h
  WHERE h.generation_id IS DISTINCT FROM p_target_generation_id
  GROUP BY h.generation_id
  ORDER BY MAX(h.session_date) DESC, COUNT(*) DESC, h.generation_id
  LIMIT 1;

  IF v_source IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.screener_daily_volume_history (
    generation_id,
    symbol,
    session_date,
    volume,
    provider_as_of,
    created_at
  )
  SELECT
    p_target_generation_id,
    h.symbol,
    h.session_date,
    h.volume,
    h.provider_as_of,
    clock_timestamp()
  FROM public.screener_daily_volume_history h
  WHERE h.generation_id = v_source
    AND h.volume IS NOT NULL
    AND h.volume > 0
  ON CONFLICT (generation_id, symbol, session_date) DO UPDATE SET
    volume = EXCLUDED.volume,
    provider_as_of = EXCLUDED.provider_as_of,
    created_at = EXCLUDED.created_at;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT COALESCE(array_agg(DISTINCT h.symbol), ARRAY[]::text[])
    INTO v_symbols
  FROM public.screener_daily_volume_history h
  WHERE h.generation_id = p_target_generation_id;

  IF array_length(v_symbols, 1) IS NOT NULL THEN
    PERFORM public.trim_screener_daily_volume_history_v1(
      p_target_generation_id,
      v_symbols
    );
  END IF;

  RETURN v_inserted;
END;
$copyfin$;

REVOKE ALL ON FUNCTION public.copy_screener_daily_volume_history_for_finalize_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.copy_screener_daily_volume_history_for_finalize_v1(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_screener_52w_baseline_publish_v1(p_generation_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
DECLARE
  v_job public.screener_52w_baseline_publish_job%ROWTYPE;
  v_state public.screener_52w_baseline_state%ROWTYPE;
  v_row_count integer := 0;
  v_excl_count integer := 0;
  v_actual_rows integer := 0;
  v_actual_excl integer := 0;
  v_status text;
  v_inserted integer := 0;
  v_excluded integer := 0;
  v_volume_published integer := 0;
  v_volume_copied integer := 0;
BEGIN
  IF p_generation_id IS NULL THEN
    RAISE EXCEPTION 'generation_id required';
  END IF;

  SELECT * INTO v_job
  FROM public.screener_52w_baseline_publish_job
  WHERE job_key = 'current'
  FOR UPDATE;

  IF NOT FOUND OR v_job.generation_id IS DISTINCT FROM p_generation_id THEN
    SELECT * INTO v_state
    FROM public.screener_52w_baseline_state
    WHERE state_key = 'current'
    FOR UPDATE;

    IF FOUND
       AND v_state.current_generation_id IS NOT DISTINCT FROM p_generation_id
       AND v_state.status IN ('available', 'empty')
       AND v_state.policy_min_sessions IS NOT NULL
       AND v_state.policy_excluded_count IS NOT NULL THEN
      SELECT COUNT(*) INTO v_actual_rows
      FROM public.screener_52w_baselines
      WHERE generation_id = p_generation_id;
      SELECT COUNT(*) INTO v_actual_excl
      FROM public.screener_52w_baseline_exclusions
      WHERE generation_id = p_generation_id;
      IF v_actual_rows IS NOT DISTINCT FROM v_state.symbol_count
         AND v_actual_excl IS NOT DISTINCT FROM v_state.policy_excluded_count THEN
        RETURN v_state.symbol_count;
      END IF;
    END IF;

    RAISE EXCEPTION 'wrong generation';
  END IF;

  SELECT COUNT(*) INTO v_row_count
  FROM public.screener_52w_baseline_publish_rows
  WHERE generation_id = p_generation_id;

  SELECT COUNT(*) INTO v_excl_count
  FROM public.screener_52w_baseline_publish_exclusions
  WHERE generation_id = p_generation_id;

  IF v_row_count IS DISTINCT FROM v_job.expected_baseline_count THEN
    RAISE EXCEPTION 'expected/actual baseline count mismatch';
  END IF;
  IF v_excl_count IS DISTINCT FROM v_job.expected_exclusion_count THEN
    RAISE EXCEPTION 'expected/actual exclusion count mismatch';
  END IF;
  IF v_row_count > 20000 THEN
    RAISE EXCEPTION 'rows exceed baseline limit';
  END IF;
  IF v_excl_count > 20000 THEN
    RAISE EXCEPTION 'exclusions exceed baseline limit';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.screener_52w_baseline_publish_rows r
    JOIN public.screener_52w_baseline_publish_exclusions e
      ON e.generation_id = r.generation_id
     AND e.symbol = r.symbol
    WHERE r.generation_id = p_generation_id
  ) THEN
    RAISE EXCEPTION 'exclusion symbol overlaps baseline';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.screener_52w_baseline_publish_rows
    WHERE generation_id = p_generation_id
      AND sessions_observed < v_job.min_sessions
  ) THEN
    RAISE EXCEPTION 'invalid baseline session counts';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.screener_52w_baseline_publish_exclusions
    WHERE generation_id = p_generation_id
      AND (
        reason IS DISTINCT FROM 'insufficient_sessions'
        OR sessions_observed < 1
        OR sessions_observed >= v_job.min_sessions
        OR min_sessions IS DISTINCT FROM v_job.min_sessions
      )
  ) THEN
    RAISE EXCEPTION 'invalid exclusion session counts';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.screener_52w_baseline_publish_rows
    WHERE generation_id = p_generation_id
      AND (
        period_start IS DISTINCT FROM v_job.period_start
        OR period_end IS DISTINCT FROM v_job.period_end
        OR provider_as_of IS DISTINCT FROM v_job.provider_as_of
      )
  ) THEN
    RAISE EXCEPTION 'generation metadata mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.screener_52w_baseline_publish_exclusions
    WHERE generation_id = p_generation_id
      AND provider_as_of IS DISTINCT FROM v_job.provider_as_of
  ) THEN
    RAISE EXCEPTION 'generation metadata mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.screener_52w_baseline_publish_rows
    WHERE generation_id = p_generation_id
      AND (
        high_52w IS NULL
        OR low_52w IS NULL
        OR high_52w <= 0
        OR low_52w <= 0
        OR low_52w > high_52w
        OR jsonb_typeof(high_candidates) <> 'array'
        OR jsonb_array_length(high_candidates) < 1
        OR jsonb_typeof(low_candidates) <> 'array'
        OR jsonb_array_length(low_candidates) < 1
      )
  ) THEN
    RAISE EXCEPTION 'invalid baseline row structure';
  END IF;

  v_status := CASE WHEN v_row_count = 0 THEN 'empty' ELSE 'available' END;

  v_volume_copied := public.copy_screener_daily_volume_history_for_finalize_v1(
    p_generation_id
  );

  v_volume_published := public.publish_screener_volume_baselines_v1(
    p_generation_id,
    v_job.provider_as_of
  );

  SELECT * INTO v_state
  FROM public.screener_52w_baseline_state
  WHERE state_key = 'current'
  FOR UPDATE;

  INSERT INTO public.screener_52w_baselines (
    generation_id,
    symbol,
    period_start,
    period_end,
    high_52w,
    low_52w,
    high_candidates,
    low_candidates,
    sessions_observed,
    provider_as_of,
    updated_at
  )
  SELECT
    p_generation_id,
    r.symbol,
    v_job.period_start,
    v_job.period_end,
    r.high_52w,
    r.low_52w,
    r.high_candidates,
    r.low_candidates,
    r.sessions_observed,
    v_job.provider_as_of,
    v_job.provider_as_of
  FROM public.screener_52w_baseline_publish_rows r
  WHERE r.generation_id = p_generation_id;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted IS DISTINCT FROM v_row_count THEN
    RAISE EXCEPTION 'insert count mismatch';
  END IF;

  INSERT INTO public.screener_52w_baseline_exclusions (
    generation_id,
    symbol,
    reason,
    sessions_observed,
    min_sessions,
    provider_as_of
  )
  SELECT
    p_generation_id,
    e.symbol,
    'insufficient_sessions',
    e.sessions_observed,
    v_job.min_sessions,
    v_job.provider_as_of
  FROM public.screener_52w_baseline_publish_exclusions e
  WHERE e.generation_id = p_generation_id;

  GET DIAGNOSTICS v_excluded = ROW_COUNT;
  IF v_excluded IS DISTINCT FROM v_excl_count THEN
    RAISE EXCEPTION 'exclusion insert count mismatch';
  END IF;

  INSERT INTO public.screener_52w_baseline_state (
    state_key,
    current_generation_id,
    status,
    period_start,
    period_end,
    symbol_count,
    provider_as_of,
    updated_at,
    policy_min_sessions,
    policy_excluded_count
  ) VALUES (
    'current',
    p_generation_id,
    v_status,
    v_job.period_start,
    v_job.period_end,
    v_inserted,
    v_job.provider_as_of,
    v_job.provider_as_of,
    v_job.min_sessions,
    v_excluded
  )
  ON CONFLICT (state_key) DO UPDATE SET
    current_generation_id = EXCLUDED.current_generation_id,
    status = EXCLUDED.status,
    period_start = EXCLUDED.period_start,
    period_end = EXCLUDED.period_end,
    symbol_count = EXCLUDED.symbol_count,
    provider_as_of = EXCLUDED.provider_as_of,
    updated_at = EXCLUDED.updated_at,
    policy_min_sessions = EXCLUDED.policy_min_sessions,
    policy_excluded_count = EXCLUDED.policy_excluded_count;

  DELETE FROM public.screener_52w_baselines
  WHERE generation_id IS DISTINCT FROM p_generation_id;

  DELETE FROM public.screener_52w_baseline_exclusions
  WHERE generation_id IS DISTINCT FROM p_generation_id;

  IF v_volume_published > 0 THEN
    PERFORM public.cleanup_stale_screener_volume_generations_v1(p_generation_id);
  END IF;

  DELETE FROM public.screener_52w_baseline_publish_rows
  WHERE generation_id = p_generation_id;
  DELETE FROM public.screener_52w_baseline_publish_exclusions
  WHERE generation_id = p_generation_id;
  IF v_volume_published > 0 THEN
    DELETE FROM public.screener_daily_volume_job_dates
    WHERE generation_id = p_generation_id;
  END IF;
  DELETE FROM public.screener_52w_baseline_publish_job
  WHERE job_key = 'current'
    AND generation_id = p_generation_id;

  RETURN v_inserted;
END;
$fn$;