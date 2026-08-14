-- Resumable 52-week baseline job: checkpoint, staging, date idempotency, atomic finalize.
-- Forward-only. Does not edit historical migrations or published baseline RLS.

CREATE TABLE IF NOT EXISTS public.screener_52w_baseline_job (
  job_key text PRIMARY KEY,
  generation_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL,
  last_applied_date date NULL,
  dates_total integer NOT NULL,
  dates_applied integer NOT NULL,
  provider_as_of timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT screener_52w_baseline_job_key_current CHECK (job_key = 'current'),
  CONSTRAINT screener_52w_baseline_job_status_check
    CHECK (status IN ('running', 'idle')),
  CONSTRAINT screener_52w_baseline_job_dates_nonneg
    CHECK (dates_total >= 0 AND dates_applied >= 0 AND dates_applied <= dates_total),
  CONSTRAINT screener_52w_baseline_job_period_order
    CHECK (period_start <= period_end)
);

COMMENT ON TABLE public.screener_52w_baseline_job IS
  'Single-row checkpoint for the in-progress 52-week baseline build.';

CREATE TABLE IF NOT EXISTS public.screener_52w_baseline_staging (
  generation_id uuid NOT NULL,
  symbol text NOT NULL,
  high_52w numeric NOT NULL,
  low_52w numeric NOT NULL,
  high_date date NOT NULL,
  low_date date NOT NULL,
  sessions_observed integer NOT NULL,
  PRIMARY KEY (generation_id, symbol),
  CONSTRAINT screener_52w_baseline_staging_symbol_check
    CHECK (symbol ~ '^[A-Z][A-Z0-9.\-]*$' AND char_length(symbol) <= 12),
  CONSTRAINT screener_52w_baseline_staging_high_low
    CHECK (high_52w > 0 AND low_52w > 0 AND low_52w <= high_52w),
  CONSTRAINT screener_52w_baseline_staging_sessions
    CHECK (sessions_observed >= 1)
);

CREATE TABLE IF NOT EXISTS public.screener_52w_baseline_job_dates (
  generation_id uuid NOT NULL,
  session_date date NOT NULL,
  PRIMARY KEY (generation_id, session_date)
);

CREATE INDEX IF NOT EXISTS screener_52w_baseline_staging_generation_idx
  ON public.screener_52w_baseline_staging (generation_id);

ALTER TABLE public.screener_52w_baseline_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screener_52w_baseline_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screener_52w_baseline_job_dates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.screener_52w_baseline_job FROM PUBLIC;
REVOKE ALL ON TABLE public.screener_52w_baseline_job FROM anon;
REVOKE ALL ON TABLE public.screener_52w_baseline_job FROM authenticated;
GRANT ALL ON TABLE public.screener_52w_baseline_job TO service_role;

REVOKE ALL ON TABLE public.screener_52w_baseline_staging FROM PUBLIC;
REVOKE ALL ON TABLE public.screener_52w_baseline_staging FROM anon;
REVOKE ALL ON TABLE public.screener_52w_baseline_staging FROM authenticated;
GRANT ALL ON TABLE public.screener_52w_baseline_staging TO service_role;

REVOKE ALL ON TABLE public.screener_52w_baseline_job_dates FROM PUBLIC;
REVOKE ALL ON TABLE public.screener_52w_baseline_job_dates FROM anon;
REVOKE ALL ON TABLE public.screener_52w_baseline_job_dates FROM authenticated;
GRANT ALL ON TABLE public.screener_52w_baseline_job_dates TO service_role;

CREATE OR REPLACE FUNCTION public.start_screener_52w_baseline_job_v1(
  p_generation_id uuid,
  p_period_start date,
  p_period_end date,
  p_dates_total integer,
  p_provider_as_of timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_job public.screener_52w_baseline_job%ROWTYPE;
  v_old uuid;
BEGIN
  IF p_generation_id IS NULL THEN
    RAISE EXCEPTION 'generation_id required';
  END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_start > p_period_end THEN
    RAISE EXCEPTION 'invalid period';
  END IF;
  IF p_dates_total IS NULL OR p_dates_total < 0 OR p_dates_total > 400 THEN
    RAISE EXCEPTION 'invalid dates_total';
  END IF;
  IF p_provider_as_of IS NULL THEN
    RAISE EXCEPTION 'provider_as_of required';
  END IF;
  IF p_provider_as_of > v_now + interval '5 minutes' THEN
    RAISE EXCEPTION 'provider_as_of too far in the future';
  END IF;

  SELECT * INTO v_job
  FROM public.screener_52w_baseline_job
  WHERE job_key = 'current';

  IF FOUND
     AND v_job.status = 'running'
     AND v_job.period_start = p_period_start
     AND v_job.period_end = p_period_end THEN
    RETURN jsonb_build_object(
      'generation_id', v_job.generation_id,
      'period_start', v_job.period_start,
      'period_end', v_job.period_end,
      'status', v_job.status,
      'last_applied_date', v_job.last_applied_date,
      'dates_total', v_job.dates_total,
      'dates_applied', v_job.dates_applied,
      'resumed', true
    );
  END IF;

  IF FOUND THEN
    v_old := v_job.generation_id;
    DELETE FROM public.screener_52w_baseline_staging WHERE generation_id = v_old;
    DELETE FROM public.screener_52w_baseline_job_dates WHERE generation_id = v_old;
  END IF;

  INSERT INTO public.screener_52w_baseline_job (
    job_key,
    generation_id,
    period_start,
    period_end,
    status,
    last_applied_date,
    dates_total,
    dates_applied,
    provider_as_of,
    updated_at
  ) VALUES (
    'current',
    p_generation_id,
    p_period_start,
    p_period_end,
    'running',
    NULL,
    p_dates_total,
    0,
    p_provider_as_of,
    v_now
  )
  ON CONFLICT (job_key) DO UPDATE SET
    generation_id = EXCLUDED.generation_id,
    period_start = EXCLUDED.period_start,
    period_end = EXCLUDED.period_end,
    status = 'running',
    last_applied_date = NULL,
    dates_total = EXCLUDED.dates_total,
    dates_applied = 0,
    provider_as_of = EXCLUDED.provider_as_of,
    updated_at = EXCLUDED.updated_at;

  RETURN jsonb_build_object(
    'generation_id', p_generation_id,
    'period_start', p_period_start,
    'period_end', p_period_end,
    'status', 'running',
    'last_applied_date', NULL,
    'dates_total', p_dates_total,
    'dates_applied', 0,
    'resumed', false
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.apply_screener_52w_baseline_day_v1(
  p_generation_id uuid,
  p_session_date date,
  p_bars jsonb,
  p_provider_as_of timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_job public.screener_52w_baseline_job%ROWTYPE;
  v_elem jsonb;
  v_symbol text;
  v_high numeric;
  v_low numeric;
  v_len integer;
BEGIN
  IF p_generation_id IS NULL OR p_session_date IS NULL THEN
    RAISE EXCEPTION 'generation_id and session_date required';
  END IF;
  IF p_provider_as_of IS NULL THEN
    RAISE EXCEPTION 'provider_as_of required';
  END IF;
  IF p_bars IS NULL OR jsonb_typeof(p_bars) <> 'array' THEN
    RAISE EXCEPTION 'bars must be a JSON array';
  END IF;
  v_len := jsonb_array_length(p_bars);
  IF v_len > 20000 THEN
    RAISE EXCEPTION 'bars exceed day limit';
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
  IF p_session_date < v_job.period_start OR p_session_date > v_job.period_end THEN
    RAISE EXCEPTION 'session_date outside period';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.screener_52w_baseline_job_dates
    WHERE generation_id = p_generation_id
      AND session_date = p_session_date
  ) THEN
    RETURN jsonb_build_object(
      'skipped', true,
      'dates_applied', v_job.dates_applied,
      'last_applied_date', v_job.last_applied_date
    );
  END IF;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_bars)
  LOOP
    IF jsonb_typeof(v_elem) <> 'object' THEN
      CONTINUE;
    END IF;
    v_symbol := upper(trim(COALESCE(v_elem ->> 'symbol', '')));
    IF v_symbol = '' OR char_length(v_symbol) > 12
       OR v_symbol !~ '^[A-Z][A-Z0-9.\-]*$' THEN
      CONTINUE;
    END IF;
    BEGIN
      v_high := (v_elem ->> 'h')::numeric;
      v_low := (v_elem ->> 'l')::numeric;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
    IF v_high IS NULL OR v_low IS NULL OR v_high <= 0 OR v_low <= 0
       OR v_low > v_high THEN
      CONTINUE;
    END IF;

    INSERT INTO public.screener_52w_baseline_staging (
      generation_id,
      symbol,
      high_52w,
      low_52w,
      high_date,
      low_date,
      sessions_observed
    ) VALUES (
      p_generation_id,
      v_symbol,
      v_high,
      v_low,
      p_session_date,
      p_session_date,
      1
    )
    ON CONFLICT (generation_id, symbol) DO UPDATE SET
      high_date = CASE
        WHEN EXCLUDED.high_52w >= public.screener_52w_baseline_staging.high_52w
        THEN EXCLUDED.high_date
        ELSE public.screener_52w_baseline_staging.high_date
      END,
      high_52w = CASE
        WHEN EXCLUDED.high_52w >= public.screener_52w_baseline_staging.high_52w
        THEN EXCLUDED.high_52w
        ELSE public.screener_52w_baseline_staging.high_52w
      END,
      low_date = CASE
        WHEN EXCLUDED.low_52w <= public.screener_52w_baseline_staging.low_52w
        THEN EXCLUDED.low_date
        ELSE public.screener_52w_baseline_staging.low_date
      END,
      low_52w = CASE
        WHEN EXCLUDED.low_52w <= public.screener_52w_baseline_staging.low_52w
        THEN EXCLUDED.low_52w
        ELSE public.screener_52w_baseline_staging.low_52w
      END,
      sessions_observed = public.screener_52w_baseline_staging.sessions_observed + 1;
  END LOOP;

  INSERT INTO public.screener_52w_baseline_job_dates (generation_id, session_date)
  VALUES (p_generation_id, p_session_date);

  UPDATE public.screener_52w_baseline_job
  SET last_applied_date = p_session_date,
      dates_applied = dates_applied + 1,
      provider_as_of = p_provider_as_of,
      updated_at = v_now
  WHERE job_key = 'current'
  RETURNING * INTO v_job;

  RETURN jsonb_build_object(
    'skipped', false,
    'dates_applied', v_job.dates_applied,
    'last_applied_date', v_job.last_applied_date
  );
END;
$fn$;

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
    'status', v_status
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.start_screener_52w_baseline_job_v1(uuid, date, date, integer, timestamptz)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_screener_52w_baseline_job_v1(uuid, date, date, integer, timestamptz)
  FROM anon;
REVOKE ALL ON FUNCTION public.start_screener_52w_baseline_job_v1(uuid, date, date, integer, timestamptz)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.start_screener_52w_baseline_job_v1(uuid, date, date, integer, timestamptz)
  TO service_role;

REVOKE ALL ON FUNCTION public.apply_screener_52w_baseline_day_v1(uuid, date, jsonb, timestamptz)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_screener_52w_baseline_day_v1(uuid, date, jsonb, timestamptz)
  FROM anon;
REVOKE ALL ON FUNCTION public.apply_screener_52w_baseline_day_v1(uuid, date, jsonb, timestamptz)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_screener_52w_baseline_day_v1(uuid, date, jsonb, timestamptz)
  TO service_role;

REVOKE ALL ON FUNCTION public.finalize_screener_52w_baseline_job_v1(uuid, integer, timestamptz)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_screener_52w_baseline_job_v1(uuid, integer, timestamptz)
  FROM anon;
REVOKE ALL ON FUNCTION public.finalize_screener_52w_baseline_job_v1(uuid, integer, timestamptz)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_screener_52w_baseline_job_v1(uuid, integer, timestamptz)
  TO service_role;
