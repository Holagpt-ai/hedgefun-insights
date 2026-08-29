-- Forward-only: replace O(n^2) PL/pgSQL validation in
-- replace_screener_52w_baseline_generation_v1 with set-based SQL.
-- Same public signature, grants, generation pointer, and atomic order:
-- validate -> insert new generation -> flip pointer -> delete old generations.
-- Does not edit historical migrations or RLS.

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
    updated_at
  ) VALUES (
    'current',
    p_generation_id,
    p_status,
    p_period_start,
    p_period_end,
    v_inserted,
    p_provider_as_of,
    p_provider_as_of
  )
  ON CONFLICT (state_key) DO UPDATE SET
    current_generation_id = EXCLUDED.current_generation_id,
    status = EXCLUDED.status,
    period_start = EXCLUDED.period_start,
    period_end = EXCLUDED.period_end,
    symbol_count = EXCLUDED.symbol_count,
    provider_as_of = EXCLUDED.provider_as_of,
    updated_at = EXCLUDED.updated_at;

  DELETE FROM public.screener_52w_baselines
  WHERE generation_id IS DISTINCT FROM p_generation_id;

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