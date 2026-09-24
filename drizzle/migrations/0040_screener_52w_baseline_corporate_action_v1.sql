-- see supabase/migrations/20260924120000_screener_52w_baseline_corporate_action_v1.sql
CREATE OR REPLACE FUNCTION public.screener_near_integer_scale_factor(p_ratio numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $fn$
  SELECT CASE
    WHEN p_ratio IS NULL OR p_ratio < 100 THEN NULL
    WHEN round(p_ratio) < 100 THEN NULL
    WHEN abs(p_ratio - round(p_ratio)) / round(p_ratio) <= 0.03
      THEN round(p_ratio)
    ELSE NULL
  END
$fn$;

CREATE OR REPLACE FUNCTION public.restate_screener_legacy_high(p_legacy_high numeric, p_session_high numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $fn$
  SELECT CASE
    WHEN p_legacy_high IS NULL OR p_session_high IS NULL THEN p_legacy_high
    WHEN p_legacy_high <= 0 OR p_session_high <= 0 THEN p_legacy_high
    WHEN p_legacy_high <= p_session_high * 100 THEN p_legacy_high
    ELSE COALESCE(p_legacy_high / public.screener_near_integer_scale_factor(p_legacy_high / p_session_high), p_legacy_high)
  END
$fn$;

CREATE OR REPLACE FUNCTION public.restate_screener_legacy_low(p_legacy_low numeric, p_session_low numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $fn$
  SELECT CASE
    WHEN p_legacy_low IS NULL OR p_session_low IS NULL THEN p_legacy_low
    WHEN p_legacy_low <= 0 OR p_session_low <= 0 THEN p_legacy_low
    WHEN p_session_low <= p_legacy_low * 100 THEN p_legacy_low
    ELSE COALESCE(p_legacy_low * public.screener_near_integer_scale_factor(p_session_low / p_legacy_low), p_legacy_low)
  END
$fn$;

CREATE OR REPLACE FUNCTION public.merge_screener_52w_high(p_existing_high numeric, p_bar_high numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $fn$
  SELECT GREATEST(public.restate_screener_legacy_high(p_existing_high, p_bar_high), p_bar_high)
$fn$;

CREATE OR REPLACE FUNCTION public.merge_screener_52w_low(p_existing_low numeric, p_bar_low numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $fn$
  SELECT LEAST(public.restate_screener_legacy_low(p_existing_low, p_bar_low), p_bar_low)
$fn$;

REVOKE ALL ON FUNCTION public.screener_near_integer_scale_factor(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restate_screener_legacy_high(numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restate_screener_legacy_low(numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_screener_52w_high(numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_screener_52w_low(numeric, numeric) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.apply_screener_52w_baseline_day_v1(
  p_generation_id uuid, p_session_date date, p_bars jsonb, p_provider_as_of timestamptz
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_job public.screener_52w_baseline_job%ROWTYPE;
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

  SELECT * INTO v_job FROM public.screener_52w_baseline_job WHERE job_key = 'current' FOR UPDATE;

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
    SELECT 1 FROM public.screener_52w_baseline_job_dates
    WHERE generation_id = p_generation_id AND session_date = p_session_date
  ) THEN
    RETURN jsonb_build_object('skipped', true, 'dates_applied', v_job.dates_applied, 'last_applied_date', v_job.last_applied_date);
  END IF;

  INSERT INTO public.screener_52w_baseline_staging (
    generation_id, symbol, high_52w, low_52w, high_date, low_date, sessions_observed
  )
  SELECT p_generation_id, d.symbol, d.high_52w, d.low_52w, p_session_date, p_session_date, 1
  FROM (
    SELECT v.symbol, MAX(v.high_52w) AS high_52w, MIN(v.low_52w) AS low_52w
    FROM (
      SELECT
        upper(trim(COALESCE(e.elem ->> 'symbol', ''))) AS symbol,
        public.try_screener_bar_numeric(e.elem ->> 'h') AS high_52w,
        public.try_screener_bar_numeric(e.elem ->> 'l') AS low_52w
      FROM jsonb_array_elements(p_bars) AS e(elem)
      WHERE jsonb_typeof(e.elem) = 'object'
    ) v
    WHERE v.symbol <> ''
      AND char_length(v.symbol) <= 12
      AND v.symbol ~ '^[A-Z][A-Z0-9.\-]*$'
      AND v.high_52w IS NOT NULL
      AND v.low_52w IS NOT NULL
      AND v.high_52w > 0
      AND v.low_52w > 0
      AND v.low_52w <= v.high_52w
    GROUP BY v.symbol
  ) d
  ON CONFLICT (generation_id, symbol) DO UPDATE SET
    high_date = CASE
      WHEN public.merge_screener_52w_high(public.screener_52w_baseline_staging.high_52w, EXCLUDED.high_52w) = EXCLUDED.high_52w
        AND EXCLUDED.high_52w >= public.screener_52w_baseline_staging.high_52w
      THEN EXCLUDED.high_date
      ELSE public.screener_52w_baseline_staging.high_date
    END,
    high_52w = public.merge_screener_52w_high(public.screener_52w_baseline_staging.high_52w, EXCLUDED.high_52w),
    low_date = CASE
      WHEN public.merge_screener_52w_low(public.screener_52w_baseline_staging.low_52w, EXCLUDED.low_52w) = EXCLUDED.low_52w
        AND EXCLUDED.low_52w <= public.screener_52w_baseline_staging.low_52w
      THEN EXCLUDED.low_date
      ELSE public.screener_52w_baseline_staging.low_date
    END,
    low_52w = public.merge_screener_52w_low(public.screener_52w_baseline_staging.low_52w, EXCLUDED.low_52w),
    sessions_observed = public.screener_52w_baseline_staging.sessions_observed + 1;

  INSERT INTO public.screener_52w_baseline_job_dates (generation_id, session_date)
  VALUES (p_generation_id, p_session_date);

  UPDATE public.screener_52w_baseline_job
  SET last_applied_date = p_session_date,
      dates_applied = dates_applied + 1,
      provider_as_of = p_provider_as_of,
      updated_at = v_now
  WHERE job_key = 'current'
  RETURNING * INTO v_job;

  RETURN jsonb_build_object('skipped', false, 'dates_applied', v_job.dates_applied, 'last_applied_date', v_job.last_applied_date);
END;
$fn$;

REVOKE ALL ON FUNCTION public.apply_screener_52w_baseline_day_v1(uuid, date, jsonb, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_screener_52w_baseline_day_v1(uuid, date, jsonb, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.apply_screener_52w_baseline_day_v1(uuid, date, jsonb, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_screener_52w_baseline_day_v1(uuid, date, jsonb, timestamptz) TO service_role;