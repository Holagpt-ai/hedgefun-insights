-- Chunked 52-week baseline publication V1:
-- stage worker rows/exclusions in bounded HTTP chunks, then finalize
-- atomically through the already-approved exclusion-aware replace RPC.
-- Forward-only. Does not edit historical migrations or weaken replace
-- semantics. Does not change BASELINE_MIN_SESSIONS.

-- ── Staging: single current/in-progress worker publication job ──

CREATE TABLE IF NOT EXISTS public.screener_52w_baseline_publish_job (
  job_key text PRIMARY KEY,
  generation_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  provider_as_of timestamptz NOT NULL,
  expected_baseline_count integer NOT NULL,
  expected_exclusion_count integer NOT NULL,
  min_sessions integer NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT screener_52w_baseline_publish_job_key_current
    CHECK (job_key = 'current'),
  CONSTRAINT screener_52w_baseline_publish_job_status_check
    CHECK (status IN ('staging')),
  CONSTRAINT screener_52w_baseline_publish_job_period_order
    CHECK (period_start <= period_end),
  CONSTRAINT screener_52w_baseline_publish_job_counts_nonneg
    CHECK (expected_baseline_count >= 0 AND expected_exclusion_count >= 0),
  CONSTRAINT screener_52w_baseline_publish_job_min_sessions
    CHECK (min_sessions >= 1)
);

COMMENT ON TABLE public.screener_52w_baseline_publish_job IS
  'Single in-progress worker publication job. Staging only; production flip happens in finalize via replace_screener_52w_baseline_generation_with_exclusions_v1.';

CREATE TABLE IF NOT EXISTS public.screener_52w_baseline_publish_rows (
  generation_id uuid NOT NULL,
  symbol text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  high_52w numeric NOT NULL,
  low_52w numeric NOT NULL,
  high_candidates jsonb NOT NULL,
  low_candidates jsonb NOT NULL,
  sessions_observed integer NOT NULL,
  provider_as_of timestamptz NOT NULL,
  PRIMARY KEY (generation_id, symbol),
  CONSTRAINT screener_52w_baseline_publish_rows_symbol_check
    CHECK (symbol ~ '^[A-Z][A-Z0-9.\-]*$' AND char_length(symbol) <= 12),
  CONSTRAINT screener_52w_baseline_publish_rows_high_low_positive
    CHECK (high_52w > 0 AND low_52w > 0 AND low_52w <= high_52w),
  CONSTRAINT screener_52w_baseline_publish_rows_sessions_positive
    CHECK (sessions_observed >= 1),
  CONSTRAINT screener_52w_baseline_publish_rows_period_order
    CHECK (period_start <= period_end),
  CONSTRAINT screener_52w_baseline_publish_rows_high_candidates_array
    CHECK (jsonb_typeof(high_candidates) = 'array' AND jsonb_array_length(high_candidates) >= 1),
  CONSTRAINT screener_52w_baseline_publish_rows_low_candidates_array
    CHECK (jsonb_typeof(low_candidates) = 'array' AND jsonb_array_length(low_candidates) >= 1)
);

COMMENT ON TABLE public.screener_52w_baseline_publish_rows IS
  'Staged BaselineRow payloads for chunked worker publication. Preserves full high/low candidate arrays.';

CREATE INDEX IF NOT EXISTS screener_52w_baseline_publish_rows_generation_idx
  ON public.screener_52w_baseline_publish_rows (generation_id);

CREATE TABLE IF NOT EXISTS public.screener_52w_baseline_publish_exclusions (
  generation_id uuid NOT NULL,
  symbol text NOT NULL,
  reason text NOT NULL,
  sessions_observed integer NOT NULL,
  min_sessions integer NOT NULL,
  provider_as_of timestamptz NOT NULL,
  PRIMARY KEY (generation_id, symbol),
  CONSTRAINT screener_52w_baseline_publish_exclusions_symbol_check
    CHECK (symbol ~ '^[A-Z][A-Z0-9.\-]*$' AND char_length(symbol) <= 12),
  CONSTRAINT screener_52w_baseline_publish_exclusions_sessions_observed
    CHECK (sessions_observed >= 1),
  CONSTRAINT screener_52w_baseline_publish_exclusions_min_sessions
    CHECK (min_sessions >= 1),
  CONSTRAINT screener_52w_baseline_publish_exclusions_reason_check
    CHECK (reason IN ('insufficient_sessions'))
);

COMMENT ON TABLE public.screener_52w_baseline_publish_exclusions IS
  'Staged insufficient_sessions exclusions for chunked worker publication.';

CREATE INDEX IF NOT EXISTS screener_52w_baseline_publish_exclusions_generation_idx
  ON public.screener_52w_baseline_publish_exclusions (generation_id);

ALTER TABLE public.screener_52w_baseline_publish_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screener_52w_baseline_publish_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screener_52w_baseline_publish_exclusions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.screener_52w_baseline_publish_job FROM PUBLIC;
REVOKE ALL ON TABLE public.screener_52w_baseline_publish_job FROM anon;
REVOKE ALL ON TABLE public.screener_52w_baseline_publish_job FROM authenticated;
GRANT ALL ON TABLE public.screener_52w_baseline_publish_job TO service_role;

REVOKE ALL ON TABLE public.screener_52w_baseline_publish_rows FROM PUBLIC;
REVOKE ALL ON TABLE public.screener_52w_baseline_publish_rows FROM anon;
REVOKE ALL ON TABLE public.screener_52w_baseline_publish_rows FROM authenticated;
GRANT ALL ON TABLE public.screener_52w_baseline_publish_rows TO service_role;

REVOKE ALL ON TABLE public.screener_52w_baseline_publish_exclusions FROM PUBLIC;
REVOKE ALL ON TABLE public.screener_52w_baseline_publish_exclusions FROM anon;
REVOKE ALL ON TABLE public.screener_52w_baseline_publish_exclusions FROM authenticated;
GRANT ALL ON TABLE public.screener_52w_baseline_publish_exclusions TO service_role;

-- ── Start / resume a staged publication ──

CREATE OR REPLACE FUNCTION public.start_screener_52w_baseline_publish_v1(
  p_generation_id uuid,
  p_period_start date,
  p_period_end date,
  p_provider_as_of timestamptz,
  p_expected_baseline_count integer,
  p_expected_exclusion_count integer,
  p_min_sessions integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_job public.screener_52w_baseline_publish_job%ROWTYPE;
  v_resumed boolean := false;
BEGIN
  IF p_generation_id IS NULL THEN
    RAISE EXCEPTION 'generation_id required';
  END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_start > p_period_end THEN
    RAISE EXCEPTION 'invalid period';
  END IF;
  IF p_provider_as_of IS NULL THEN
    RAISE EXCEPTION 'provider_as_of required';
  END IF;
  IF p_expected_baseline_count IS NULL OR p_expected_baseline_count < 0 THEN
    RAISE EXCEPTION 'invalid expected_baseline_count';
  END IF;
  IF p_expected_exclusion_count IS NULL OR p_expected_exclusion_count < 0 THEN
    RAISE EXCEPTION 'invalid expected_exclusion_count';
  END IF;
  IF p_min_sessions IS NULL OR p_min_sessions < 1 THEN
    RAISE EXCEPTION 'invalid min_sessions';
  END IF;

  SELECT * INTO v_job
  FROM public.screener_52w_baseline_publish_job
  WHERE job_key = 'current'
  FOR UPDATE;

  IF FOUND THEN
    IF v_job.generation_id = p_generation_id THEN
      IF v_job.period_start IS DISTINCT FROM p_period_start
         OR v_job.period_end IS DISTINCT FROM p_period_end
         OR v_job.provider_as_of IS DISTINCT FROM p_provider_as_of
         OR v_job.expected_baseline_count IS DISTINCT FROM p_expected_baseline_count
         OR v_job.expected_exclusion_count IS DISTINCT FROM p_expected_exclusion_count
         OR v_job.min_sessions IS DISTINCT FROM p_min_sessions THEN
        RAISE EXCEPTION 'generation metadata mismatch';
      END IF;
      UPDATE public.screener_52w_baseline_publish_job
      SET status = 'staging',
          updated_at = clock_timestamp()
      WHERE job_key = 'current';
      v_resumed := true;
      RETURN jsonb_build_object(
        'ok', true,
        'generation_id', p_generation_id,
        'resumed', true
      );
    END IF;

    DELETE FROM public.screener_52w_baseline_publish_rows
    WHERE generation_id = v_job.generation_id;
    DELETE FROM public.screener_52w_baseline_publish_exclusions
    WHERE generation_id = v_job.generation_id;
  END IF;

  INSERT INTO public.screener_52w_baseline_publish_job (
    job_key,
    generation_id,
    period_start,
    period_end,
    provider_as_of,
    expected_baseline_count,
    expected_exclusion_count,
    min_sessions,
    status,
    created_at,
    updated_at
  ) VALUES (
    'current',
    p_generation_id,
    p_period_start,
    p_period_end,
    p_provider_as_of,
    p_expected_baseline_count,
    p_expected_exclusion_count,
    p_min_sessions,
    'staging',
    clock_timestamp(),
    clock_timestamp()
  )
  ON CONFLICT (job_key) DO UPDATE SET
    generation_id = EXCLUDED.generation_id,
    period_start = EXCLUDED.period_start,
    period_end = EXCLUDED.period_end,
    provider_as_of = EXCLUDED.provider_as_of,
    expected_baseline_count = EXCLUDED.expected_baseline_count,
    expected_exclusion_count = EXCLUDED.expected_exclusion_count,
    min_sessions = EXCLUDED.min_sessions,
    status = 'staging',
    created_at = clock_timestamp(),
    updated_at = clock_timestamp();

  RETURN jsonb_build_object(
    'ok', true,
    'generation_id', p_generation_id,
    'resumed', v_resumed
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.start_screener_52w_baseline_publish_v1(uuid, date, date, timestamptz, integer, integer, integer)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_screener_52w_baseline_publish_v1(uuid, date, date, timestamptz, integer, integer, integer)
  FROM anon;
REVOKE ALL ON FUNCTION public.start_screener_52w_baseline_publish_v1(uuid, date, date, timestamptz, integer, integer, integer)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.start_screener_52w_baseline_publish_v1(uuid, date, date, timestamptz, integer, integer, integer)
  TO service_role;

-- ── Append a bounded baseline-row chunk ──

CREATE OR REPLACE FUNCTION public.append_screener_52w_baseline_rows_v1(
  p_generation_id uuid,
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_job public.screener_52w_baseline_publish_job%ROWTYPE;
  v_len integer := 0;
  v_upserted integer := 0;
BEGIN
  IF p_generation_id IS NULL THEN
    RAISE EXCEPTION 'generation_id required';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'rows must be a JSON array';
  END IF;
  v_len := jsonb_array_length(p_rows);
  IF v_len < 1 THEN
    RAISE EXCEPTION 'empty row chunk';
  END IF;
  IF v_len > 2000 THEN
    RAISE EXCEPTION 'row chunk exceeds limit';
  END IF;

  SELECT * INTO v_job
  FROM public.screener_52w_baseline_publish_job
  WHERE job_key = 'current'
  FOR UPDATE;

  IF NOT FOUND OR v_job.generation_id IS DISTINCT FROM p_generation_id THEN
    RAISE EXCEPTION 'wrong generation';
  END IF;
  IF v_job.status <> 'staging' THEN
    RAISE EXCEPTION 'job not staging';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) AS r
    WHERE jsonb_typeof(r) <> 'object'
  ) THEN
    RAISE EXCEPTION 'row must be an object';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) AS r
    WHERE upper(trim(COALESCE(r ->> 'symbol', ''))) = ''
       OR char_length(upper(trim(COALESCE(r ->> 'symbol', '')))) > 12
       OR upper(trim(COALESCE(r ->> 'symbol', ''))) !~ '^[A-Z][A-Z0-9.\-]*$'
  ) THEN
    RAISE EXCEPTION 'invalid baseline symbol';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) AS r
    GROUP BY upper(trim(COALESCE(r ->> 'symbol', '')))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate baseline symbol';
  END IF;

  BEGIN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_rows) AS r
      WHERE (r ->> 'sessions_observed')::integer IS NULL
         OR (r ->> 'sessions_observed')::integer < 1
    ) THEN
      RAISE EXCEPTION 'invalid sessions_observed';
    END IF;
  EXCEPTION
    WHEN others THEN
      RAISE EXCEPTION 'invalid sessions_observed';
  END;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) AS r
    WHERE jsonb_typeof(r -> 'high_candidates') <> 'array'
       OR jsonb_array_length(r -> 'high_candidates') < 1
       OR jsonb_typeof(r -> 'low_candidates') <> 'array'
       OR jsonb_array_length(r -> 'low_candidates') < 1
  ) THEN
    RAISE EXCEPTION 'invalid candidates';
  END IF;

  -- Identical (generation_id, symbol) retries are accepted. Different
  -- content for an already-staged symbol fails closed.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) AS r
    JOIN public.screener_52w_baseline_publish_rows s
      ON s.generation_id = p_generation_id
     AND s.symbol = upper(trim(r ->> 'symbol'))
    WHERE s.period_start IS DISTINCT FROM v_job.period_start
       OR s.period_end IS DISTINCT FROM v_job.period_end
       OR s.high_52w IS DISTINCT FROM (r ->> 'high_52w')::numeric
       OR s.low_52w IS DISTINCT FROM (r ->> 'low_52w')::numeric
       OR s.high_candidates IS DISTINCT FROM (r -> 'high_candidates')
       OR s.low_candidates IS DISTINCT FROM (r -> 'low_candidates')
       OR s.sessions_observed IS DISTINCT FROM (r ->> 'sessions_observed')::integer
       OR s.provider_as_of IS DISTINCT FROM v_job.provider_as_of
  ) THEN
    RAISE EXCEPTION 'conflicting staged baseline row';
  END IF;

  INSERT INTO public.screener_52w_baseline_publish_rows (
    generation_id,
    symbol,
    period_start,
    period_end,
    high_52w,
    low_52w,
    high_candidates,
    low_candidates,
    sessions_observed,
    provider_as_of
  )
  SELECT
    p_generation_id,
    upper(trim(r ->> 'symbol')),
    v_job.period_start,
    v_job.period_end,
    (r ->> 'high_52w')::numeric,
    (r ->> 'low_52w')::numeric,
    r -> 'high_candidates',
    r -> 'low_candidates',
    (r ->> 'sessions_observed')::integer,
    v_job.provider_as_of
  FROM jsonb_array_elements(p_rows) AS r
  ON CONFLICT (generation_id, symbol) DO NOTHING;

  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  UPDATE public.screener_52w_baseline_publish_job
  SET status = 'staging',
      updated_at = clock_timestamp()
  WHERE job_key = 'current';

  RETURN v_upserted;
END;
$fn$;

REVOKE ALL ON FUNCTION public.append_screener_52w_baseline_rows_v1(uuid, jsonb)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.append_screener_52w_baseline_rows_v1(uuid, jsonb)
  FROM anon;
REVOKE ALL ON FUNCTION public.append_screener_52w_baseline_rows_v1(uuid, jsonb)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.append_screener_52w_baseline_rows_v1(uuid, jsonb)
  TO service_role;

-- ── Append a bounded exclusion chunk ──

CREATE OR REPLACE FUNCTION public.append_screener_52w_baseline_exclusions_v1(
  p_generation_id uuid,
  p_exclusions jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_job public.screener_52w_baseline_publish_job%ROWTYPE;
  v_len integer := 0;
  v_upserted integer := 0;
BEGIN
  IF p_generation_id IS NULL THEN
    RAISE EXCEPTION 'generation_id required';
  END IF;
  IF p_exclusions IS NULL OR jsonb_typeof(p_exclusions) <> 'array' THEN
    RAISE EXCEPTION 'exclusions must be a JSON array';
  END IF;
  v_len := jsonb_array_length(p_exclusions);
  IF v_len < 1 THEN
    RAISE EXCEPTION 'empty exclusion chunk';
  END IF;
  IF v_len > 2000 THEN
    RAISE EXCEPTION 'exclusion chunk exceeds limit';
  END IF;

  SELECT * INTO v_job
  FROM public.screener_52w_baseline_publish_job
  WHERE job_key = 'current'
  FOR UPDATE;

  IF NOT FOUND OR v_job.generation_id IS DISTINCT FROM p_generation_id THEN
    RAISE EXCEPTION 'wrong generation';
  END IF;
  IF v_job.status <> 'staging' THEN
    RAISE EXCEPTION 'job not staging';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_exclusions) AS e
    WHERE jsonb_typeof(e) <> 'object'
  ) THEN
    RAISE EXCEPTION 'exclusion must be an object';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_exclusions) AS e
    WHERE upper(trim(COALESCE(e ->> 'symbol', ''))) = ''
       OR char_length(upper(trim(COALESCE(e ->> 'symbol', '')))) > 12
       OR upper(trim(COALESCE(e ->> 'symbol', ''))) !~ '^[A-Z][A-Z0-9.\-]*$'
  ) THEN
    RAISE EXCEPTION 'invalid exclusion symbol';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_exclusions) AS e
    GROUP BY upper(trim(COALESCE(e ->> 'symbol', '')))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate exclusion symbol';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_exclusions) AS e
    WHERE COALESCE(e ->> 'reason', '') IS DISTINCT FROM 'insufficient_sessions'
  ) THEN
    RAISE EXCEPTION 'unrecognized exclusion reason';
  END IF;

  -- Identical (generation_id, symbol) retries are accepted. Different
  -- content for an already-staged symbol fails closed.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_exclusions) AS e
    JOIN public.screener_52w_baseline_publish_exclusions s
      ON s.generation_id = p_generation_id
     AND s.symbol = upper(trim(e ->> 'symbol'))
    WHERE s.reason IS DISTINCT FROM 'insufficient_sessions'
       OR s.sessions_observed IS DISTINCT FROM (e ->> 'sessions_observed')::integer
       OR s.min_sessions IS DISTINCT FROM v_job.min_sessions
       OR s.provider_as_of IS DISTINCT FROM v_job.provider_as_of
  ) THEN
    RAISE EXCEPTION 'conflicting staged exclusion';
  END IF;

  INSERT INTO public.screener_52w_baseline_publish_exclusions (
    generation_id,
    symbol,
    reason,
    sessions_observed,
    min_sessions,
    provider_as_of
  )
  SELECT
    p_generation_id,
    upper(trim(e ->> 'symbol')),
    'insufficient_sessions',
    (e ->> 'sessions_observed')::integer,
    v_job.min_sessions,
    v_job.provider_as_of
  FROM jsonb_array_elements(p_exclusions) AS e
  ON CONFLICT (generation_id, symbol) DO NOTHING;

  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  UPDATE public.screener_52w_baseline_publish_job
  SET status = 'staging',
      updated_at = clock_timestamp()
  WHERE job_key = 'current';

  RETURN v_upserted;
END;
$fn$;

REVOKE ALL ON FUNCTION public.append_screener_52w_baseline_exclusions_v1(uuid, jsonb)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.append_screener_52w_baseline_exclusions_v1(uuid, jsonb)
  FROM anon;
REVOKE ALL ON FUNCTION public.append_screener_52w_baseline_exclusions_v1(uuid, jsonb)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.append_screener_52w_baseline_exclusions_v1(uuid, jsonb)
  TO service_role;

-- ── Finalize: reconstruct payloads and flip production atomically ──

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
  v_row_count integer := 0;
  v_excl_count integer := 0;
  v_rows jsonb := '[]'::jsonb;
  v_exclusions jsonb := '[]'::jsonb;
  v_status text;
  v_inserted integer := 0;
BEGIN
  IF p_generation_id IS NULL THEN
    RAISE EXCEPTION 'generation_id required';
  END IF;

  SELECT * INTO v_job
  FROM public.screener_52w_baseline_publish_job
  WHERE job_key = 'current'
  FOR UPDATE;

  IF NOT FOUND OR v_job.generation_id IS DISTINCT FROM p_generation_id THEN
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

  SELECT COALESCE(jsonb_agg(payload ORDER BY symbol), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT
      symbol,
      jsonb_build_object(
        'symbol', symbol,
        'period_start', period_start,
        'period_end', period_end,
        'high_52w', high_52w,
        'low_52w', low_52w,
        'high_candidates', high_candidates,
        'low_candidates', low_candidates,
        'sessions_observed', sessions_observed,
        'provider_as_of', provider_as_of
      ) AS payload
    FROM public.screener_52w_baseline_publish_rows
    WHERE generation_id = p_generation_id
  ) q;

  SELECT COALESCE(jsonb_agg(payload ORDER BY symbol), '[]'::jsonb)
    INTO v_exclusions
  FROM (
    SELECT
      symbol,
      jsonb_build_object(
        'symbol', symbol,
        'reason', reason,
        'sessions_observed', sessions_observed,
        'min_sessions', min_sessions
      ) AS payload
    FROM public.screener_52w_baseline_publish_exclusions
    WHERE generation_id = p_generation_id
  ) q;

  v_status := CASE WHEN v_row_count = 0 THEN 'empty' ELSE 'available' END;

  -- replace_* and this finalize share one transaction. If replace raises,
  -- that transaction rolls back: production is unchanged, staged rows
  -- remain, and the job stays status='staging' (retryable). A same-
  -- transaction status='failed' update cannot persist.
  v_inserted := public.replace_screener_52w_baseline_generation_with_exclusions_v1(
    p_generation_id,
    v_rows,
    v_job.period_start,
    v_job.period_end,
    v_job.provider_as_of,
    v_status,
    v_exclusions,
    v_job.min_sessions
  );

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
