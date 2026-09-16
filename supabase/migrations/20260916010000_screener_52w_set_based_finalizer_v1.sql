-- Set-based 52-week staged finalizer V1:
-- publish directly from chunked staging tables without reconstructing
-- JSONB arrays or calling replace_screener_52w_baseline_generation_with_exclusions_v1.
-- Forward-only. Does not edit historical migrations.
-- Does not change worker transport, chunk sizes, the 2,000-item append cap,
-- Radar ranking, eligibility semantics, or BASELINE_MIN_SESSIONS.

CREATE OR REPLACE FUNCTION public.finalize_screener_52w_baseline_publish_v1(
  p_generation_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
BEGIN
  IF p_generation_id IS NULL THEN
    RAISE EXCEPTION 'generation_id required';
  END IF;

  SELECT * INTO v_job
  FROM public.screener_52w_baseline_publish_job
  WHERE job_key = 'current'
  FOR UPDATE;

  -- Lost-response replay: if this generation is already the current
  -- exclusion-aware production pointer, succeed without republishing
  -- and without touching another generation's staging job.
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

  -- Serialize the production pointer before insert so a concurrent
  -- replace/catch-up cannot observe a partial flip. Job lock is already held.
  SELECT * INTO v_state
  FROM public.screener_52w_baseline_state
  WHERE state_key = 'current'
  FOR UPDATE;

  -- Set-based publish. If any statement raises, the transaction rolls
  -- back: production is unchanged, staged rows remain, and the job stays status='staging' (retryable).
  -- A same-transaction status='failed' update cannot persist.
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

  DELETE FROM public.screener_52w_baseline_publish_rows
  WHERE generation_id = p_generation_id;
  DELETE FROM public.screener_52w_baseline_publish_exclusions
  WHERE generation_id = p_generation_id;
  DELETE FROM public.screener_52w_baseline_publish_job
  WHERE job_key = 'current'
    AND generation_id = p_generation_id;

  RETURN v_inserted;
END;
$fn$;

REVOKE ALL ON FUNCTION public.finalize_screener_52w_baseline_publish_v1(uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_screener_52w_baseline_publish_v1(uuid)
  FROM anon;
REVOKE ALL ON FUNCTION public.finalize_screener_52w_baseline_publish_v1(uuid)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_screener_52w_baseline_publish_v1(uuid)
  TO service_role;
