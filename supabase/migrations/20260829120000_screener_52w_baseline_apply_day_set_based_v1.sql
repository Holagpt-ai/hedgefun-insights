-- Forward-only: replace row-by-row apply_screener_52w_baseline_day_v1
-- with one set-based INSERT ... SELECT ... ON CONFLICT.
-- Same public signature, grants, job validation, date idempotency,
-- high/low accumulation, and skip-invalid-row behavior.
-- Does not edit historical migrations, published baselines, or pointers.
--
-- Producer (barsToPayload over a Map) emits at most one row per symbol
-- per session date. Duplicate symbols in a hand-crafted payload are
-- collapsed with GROUP BY so ON CONFLICT cannot update the same row twice.

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

  INSERT INTO public.screener_52w_baseline_staging (
    generation_id,
    symbol,
    high_52w,
    low_52w,
    high_date,
    low_date,
    sessions_observed
  )
  SELECT
    p_generation_id,
    d.symbol,
    d.high_52w,
    d.low_52w,
    p_session_date,
    p_session_date,
    1
  FROM (
    SELECT
      v.symbol,
      MAX(v.high_52w) AS high_52w,
      MIN(v.low_52w) AS low_52w
    FROM (
      SELECT
        upper(trim(COALESCE(e.elem ->> 'symbol', ''))) AS symbol,
        CASE
          WHEN jsonb_typeof(e.elem -> 'h') = 'number'
            THEN (e.elem ->> 'h')::numeric
          WHEN jsonb_typeof(e.elem -> 'h') = 'string'
            AND btrim(e.elem ->> 'h')
              ~ '^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$'
            THEN btrim(e.elem ->> 'h')::numeric
          ELSE NULL
        END AS high_52w,
        CASE
          WHEN jsonb_typeof(e.elem -> 'l') = 'number'
            THEN (e.elem ->> 'l')::numeric
          WHEN jsonb_typeof(e.elem -> 'l') = 'string'
            AND btrim(e.elem ->> 'l')
              ~ '^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$'
            THEN btrim(e.elem ->> 'l')::numeric
          ELSE NULL
        END AS low_52w
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

REVOKE ALL ON FUNCTION public.apply_screener_52w_baseline_day_v1(uuid, date, jsonb, timestamptz)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_screener_52w_baseline_day_v1(uuid, date, jsonb, timestamptz)
  FROM anon;
REVOKE ALL ON FUNCTION public.apply_screener_52w_baseline_day_v1(uuid, date, jsonb, timestamptz)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_screener_52w_baseline_day_v1(uuid, date, jsonb, timestamptz)
  TO service_role;
