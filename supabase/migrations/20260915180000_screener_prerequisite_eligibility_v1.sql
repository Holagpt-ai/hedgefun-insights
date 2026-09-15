-- Screener Prerequisite Eligibility V1:
-- retain policy-exclusion evidence for below-min-session baseline symbols,
-- and fail closed when a legacy/direct publisher supplies none.
-- Forward-only. Does not edit historical migrations.

-- ── Policy-exclusion evidence (service-managed; never expose to clients) ──

CREATE TABLE IF NOT EXISTS public.screener_52w_baseline_exclusions (
  generation_id uuid NOT NULL,
  symbol text NOT NULL,
  reason text NOT NULL,
  sessions_observed integer NOT NULL,
  min_sessions integer NOT NULL,
  provider_as_of timestamptz NOT NULL,
  PRIMARY KEY (generation_id, symbol),
  CONSTRAINT screener_52w_baseline_exclusions_symbol_check
    CHECK (symbol ~ '^[A-Z][A-Z0-9.\-]*$' AND char_length(symbol) <= 12),
  CONSTRAINT screener_52w_baseline_exclusions_sessions_observed
    CHECK (sessions_observed >= 1),
  CONSTRAINT screener_52w_baseline_exclusions_min_sessions
    CHECK (min_sessions >= 1),
  CONSTRAINT screener_52w_baseline_exclusions_below_min
    CHECK (sessions_observed < min_sessions),
  CONSTRAINT screener_52w_baseline_exclusions_reason_check
    CHECK (reason IN ('insufficient_sessions'))
);

COMMENT ON TABLE public.screener_52w_baseline_exclusions IS
  'Per-symbol policy exclusions from a finalized 52-week baseline generation. Symbols observed during the trailing window but below BASELINE_MIN_SESSIONS. Service-role only.';

CREATE INDEX IF NOT EXISTS screener_52w_baseline_exclusions_generation_idx
  ON public.screener_52w_baseline_exclusions (generation_id);

ALTER TABLE public.screener_52w_baseline_exclusions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.screener_52w_baseline_exclusions FROM PUBLIC;
REVOKE ALL ON TABLE public.screener_52w_baseline_exclusions FROM anon;
REVOKE ALL ON TABLE public.screener_52w_baseline_exclusions FROM authenticated;
GRANT ALL ON TABLE public.screener_52w_baseline_exclusions TO service_role;

-- ── Compact integrity metadata on the current-generation pointer ──

ALTER TABLE public.screener_52w_baseline_state
  ADD COLUMN IF NOT EXISTS policy_min_sessions integer NULL,
  ADD COLUMN IF NOT EXISTS policy_excluded_count integer NULL;

COMMENT ON COLUMN public.screener_52w_baseline_state.policy_min_sessions IS
  'Min-session policy used to persist exclusion evidence for the current generation. NULL means exclusion evidence is unavailable.';

COMMENT ON COLUMN public.screener_52w_baseline_state.policy_excluded_count IS
  'Count of policy-exclusion rows for the current generation. NULL means exclusion evidence is unavailable. Must match persisted exclusion rows when present.';

ALTER TABLE public.screener_52w_baseline_state
  DROP CONSTRAINT IF EXISTS screener_52w_baseline_state_policy_min_sessions_positive;
ALTER TABLE public.screener_52w_baseline_state
  ADD CONSTRAINT screener_52w_baseline_state_policy_min_sessions_positive
  CHECK (policy_min_sessions IS NULL OR policy_min_sessions >= 1);

ALTER TABLE public.screener_52w_baseline_state
  DROP CONSTRAINT IF EXISTS screener_52w_baseline_state_policy_excluded_count_nonneg;
ALTER TABLE public.screener_52w_baseline_state
  ADD CONSTRAINT screener_52w_baseline_state_policy_excluded_count_nonneg
  CHECK (policy_excluded_count IS NULL OR policy_excluded_count >= 0);

ALTER TABLE public.screener_52w_baseline_state
  DROP CONSTRAINT IF EXISTS screener_52w_baseline_state_policy_exclusion_integrity;
ALTER TABLE public.screener_52w_baseline_state
  ADD CONSTRAINT screener_52w_baseline_state_policy_exclusion_integrity
  CHECK ((policy_min_sessions IS NULL) = (policy_excluded_count IS NULL));

-- ── Direct/legacy publisher: reset exclusion metadata (fail closed) ──
-- Same public signature. After a successful generation flip, policy-exclusion
-- evidence is marked unavailable so stale counts/rows cannot be inherited.

CREATE OR REPLACE FUNCTION public.replace_screener_52w_baseline_generation_v1(
  p_generation_id uuid,
  p_rows jsonb,
  p_period_start date,
  p_period_end date,
  p_provider_as_of timestamptz,
  p_status text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_len integer;
  v_now timestamptz := clock_timestamp();
  v_inserted integer := 0;
BEGIN
  IF p_generation_id IS NULL THEN
    RAISE EXCEPTION 'generation_id required';
  END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL THEN
    RAISE EXCEPTION 'period required';
  END IF;
  IF p_period_start > p_period_end THEN
    RAISE EXCEPTION 'period inverted';
  END IF;
  IF p_provider_as_of IS NULL THEN
    RAISE EXCEPTION 'provider_as_of required';
  END IF;
  IF p_provider_as_of < timestamptz '2000-01-01 00:00:00+00'
     OR p_provider_as_of > timestamptz '2100-01-01 00:00:00+00' THEN
    RAISE EXCEPTION 'provider_as_of implausible';
  END IF;
  IF p_provider_as_of > v_now + interval '5 minutes' THEN
    RAISE EXCEPTION 'provider_as_of too far in the future';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('available', 'empty') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'rows must be a JSON array';
  END IF;

  v_len := jsonb_array_length(p_rows);
  IF v_len > 20000 THEN
    RAISE EXCEPTION 'rows exceed baseline limit';
  END IF;
  IF p_status = 'empty' AND v_len <> 0 THEN
    RAISE EXCEPTION 'empty status requires zero rows';
  END IF;
  IF p_status = 'available' AND v_len = 0 THEN
    RAISE EXCEPTION 'available status requires rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) AS e
    WHERE jsonb_typeof(e) <> 'object'
  ) THEN
    RAISE EXCEPTION 'row must be an object';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) AS e
    WHERE upper(trim(COALESCE(e ->> 'symbol', ''))) = ''
       OR char_length(upper(trim(COALESCE(e ->> 'symbol', '')))) > 12
       OR upper(trim(COALESCE(e ->> 'symbol', ''))) !~ '^[A-Z][A-Z0-9.\-]*$'
  ) THEN
    RAISE EXCEPTION 'invalid symbol';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) AS e
    GROUP BY upper(trim(COALESCE(e ->> 'symbol', '')))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate symbol';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) AS e
    WHERE NULLIF(e ->> 'period_start', '')::date IS DISTINCT FROM p_period_start
       OR NULLIF(e ->> 'period_end', '')::date IS DISTINCT FROM p_period_end
  ) THEN
    RAISE EXCEPTION 'row period mismatch';
  END IF;

  BEGIN
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_rows) AS e
      WHERE (e ->> 'high_52w')::numeric IS NULL
         OR (e ->> 'low_52w')::numeric IS NULL
         OR (e ->> 'high_52w')::numeric <= 0
         OR (e ->> 'low_52w')::numeric <= 0
         OR (e ->> 'low_52w')::numeric > (e ->> 'high_52w')::numeric
    ) THEN
      RAISE EXCEPTION 'invalid high_52w/low_52w';
    END IF;
  EXCEPTION
    WHEN others THEN
      RAISE EXCEPTION 'invalid high_52w/low_52w';
  END;

  BEGIN
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_rows) AS e
      WHERE (e ->> 'sessions_observed')::integer IS NULL
         OR (e ->> 'sessions_observed')::integer < 1
    ) THEN
      RAISE EXCEPTION 'invalid sessions_observed';
    END IF;
  EXCEPTION
    WHEN others THEN
      RAISE EXCEPTION 'invalid sessions_observed';
  END;

  -- Same three-valued SQL as the prior loop: a missing candidates key is
  -- jsonb null, so `typeof <> 'array'` and `array_length < 1` are unknown
  -- and do not match. Insert then fails the table CHECK, as before.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) AS e
    WHERE jsonb_typeof(e -> 'high_candidates') <> 'array'
       OR jsonb_array_length(e -> 'high_candidates') < 1
  ) THEN
    RAISE EXCEPTION 'invalid high_candidates';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) AS e
    WHERE jsonb_typeof(e -> 'low_candidates') <> 'array'
       OR jsonb_array_length(e -> 'low_candidates') < 1
  ) THEN
    RAISE EXCEPTION 'invalid low_candidates';
  END IF;

  IF v_len > 0 THEN
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
      upper(trim(e ->> 'symbol')),
      p_period_start,
      p_period_end,
      (e ->> 'high_52w')::numeric,
      (e ->> 'low_52w')::numeric,
      e -> 'high_candidates',
      e -> 'low_candidates',
      (e ->> 'sessions_observed')::integer,
      p_provider_as_of,
      p_provider_as_of
    FROM jsonb_array_elements(p_rows) AS e;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted <> v_len THEN
      RAISE EXCEPTION 'insert count mismatch';
    END IF;
  ELSE
    v_inserted := 0;
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
    p_status,
    p_period_start,
    p_period_end,
    v_inserted,
    p_provider_as_of,
    p_provider_as_of,
    NULL,
    NULL
  )
  ON CONFLICT (state_key) DO UPDATE SET
    current_generation_id = EXCLUDED.current_generation_id,
    status = EXCLUDED.status,
    period_start = EXCLUDED.period_start,
    period_end = EXCLUDED.period_end,
    symbol_count = EXCLUDED.symbol_count,
    provider_as_of = EXCLUDED.provider_as_of,
    updated_at = EXCLUDED.updated_at,
    policy_min_sessions = NULL,
    policy_excluded_count = NULL;

  DELETE FROM public.screener_52w_baselines
  WHERE generation_id IS DISTINCT FROM p_generation_id;

  -- Direct publishers never supply exclusion evidence. Drop any leftover
  -- rows so a later reader cannot inherit another generation's exclusions.
  DELETE FROM public.screener_52w_baseline_exclusions;

  RETURN v_inserted;
END;
$fn$;

REVOKE ALL ON FUNCTION public.replace_screener_52w_baseline_generation_v1(uuid, jsonb, date, date, timestamptz, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_screener_52w_baseline_generation_v1(uuid, jsonb, date, date, timestamptz, text)
  FROM anon;
REVOKE ALL ON FUNCTION public.replace_screener_52w_baseline_generation_v1(uuid, jsonb, date, date, timestamptz, text)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.replace_screener_52w_baseline_generation_v1(uuid, jsonb, date, date, timestamptz, text)
  TO service_role;

-- ── Finalizer: publish qualifying baselines, then retain exclusion evidence ──

CREATE OR REPLACE FUNCTION public.finalize_screener_52w_baseline_job_v1(
  p_generation_id uuid,
  p_min_sessions integer,
  p_provider_as_of timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_job public.screener_52w_baseline_job%ROWTYPE;
  v_rows jsonb;
  v_count integer;
  v_status text;
  v_inserted integer;
  v_excluded integer;
BEGIN
  IF p_generation_id IS NULL THEN
    RAISE EXCEPTION 'generation_id required';
  END IF;
  IF p_min_sessions IS NULL OR p_min_sessions < 1 THEN
    RAISE EXCEPTION 'invalid min_sessions';
  END IF;
  IF p_provider_as_of IS NULL THEN
    RAISE EXCEPTION 'provider_as_of required';
  END IF;

  SELECT * INTO v_job
  FROM public.screener_52w_baseline_job
  WHERE job_key = 'current'
  FOR UPDATE;

  IF NOT FOUND OR v_job.generation_id IS DISTINCT FROM p_generation_id THEN
    RAISE EXCEPTION 'job generation mismatch';
  END IF;
  IF v_job.status <> 'running' THEN
    RAISE EXCEPTION 'job is not running';
  END IF;
  IF v_job.dates_applied <> v_job.dates_total THEN
    RAISE EXCEPTION 'job incomplete';
  END IF;

  SELECT COALESCE(jsonb_agg(row_payload ORDER BY symbol), '[]'::jsonb), COUNT(*)
    INTO v_rows, v_count
  FROM (
    SELECT
      s.symbol,
      jsonb_build_object(
        'symbol', s.symbol,
        'period_start', v_job.period_start,
        'period_end', v_job.period_end,
        'high_52w', s.high_52w,
        'low_52w', s.low_52w,
        'high_candidates', jsonb_build_array(
          jsonb_build_object('d', s.high_date, 'v', s.high_52w)
        ),
        'low_candidates', jsonb_build_array(
          jsonb_build_object('d', s.low_date, 'v', s.low_52w)
        ),
        'sessions_observed', s.sessions_observed,
        'provider_as_of', p_provider_as_of
      ) AS row_payload
    FROM public.screener_52w_baseline_staging s
    WHERE s.generation_id = p_generation_id
      AND s.sessions_observed >= p_min_sessions
      AND s.high_52w > 0
      AND s.low_52w > 0
      AND s.low_52w <= s.high_52w
  ) q;

  v_status := CASE WHEN v_count = 0 THEN 'empty' ELSE 'available' END;

  v_inserted := public.replace_screener_52w_baseline_generation_v1(
    p_generation_id,
    v_rows,
    v_job.period_start,
    v_job.period_end,
    p_provider_as_of,
    v_status
  );

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
    s.symbol,
    'insufficient_sessions',
    s.sessions_observed,
    p_min_sessions,
    p_provider_as_of
  FROM public.screener_52w_baseline_staging s
  WHERE s.generation_id = p_generation_id
    AND s.sessions_observed < p_min_sessions;

  GET DIAGNOSTICS v_excluded = ROW_COUNT;

  UPDATE public.screener_52w_baseline_state
  SET policy_min_sessions = p_min_sessions,
      policy_excluded_count = v_excluded
  WHERE state_key = 'current'
    AND current_generation_id = p_generation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'baseline state generation mismatch';
  END IF;

  DELETE FROM public.screener_52w_baseline_exclusions
  WHERE generation_id IS DISTINCT FROM p_generation_id;

  UPDATE public.screener_52w_baseline_job
  SET status = 'idle',
      provider_as_of = p_provider_as_of,
      updated_at = clock_timestamp()
  WHERE job_key = 'current';

  DELETE FROM public.screener_52w_baseline_staging WHERE generation_id = p_generation_id;
  DELETE FROM public.screener_52w_baseline_job_dates WHERE generation_id = p_generation_id;

  RETURN jsonb_build_object(
    'published', true,
    'symbol_count', v_inserted,
    'status', v_status,
    'policy_excluded_count', v_excluded,
    'policy_min_sessions', p_min_sessions
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.finalize_screener_52w_baseline_job_v1(uuid, integer, timestamptz)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_screener_52w_baseline_job_v1(uuid, integer, timestamptz)
  FROM anon;
REVOKE ALL ON FUNCTION public.finalize_screener_52w_baseline_job_v1(uuid, integer, timestamptz)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_screener_52w_baseline_job_v1(uuid, integer, timestamptz)
  TO service_role;
