-- Provider-backed U.S. equities session calendar (exception days only).
-- Private/service-managed: stores future closed and early-close sessions.
-- Normal weekdays are not stored; readers apply 09:30/16:00/20:00 ET fallback.

CREATE TABLE IF NOT EXISTS public.market_session_calendar (
  session_date date PRIMARY KEY,
  market_status text NOT NULL,
  regular_open_et time NOT NULL,
  regular_close_et time NOT NULL,
  after_hours_end_et time NOT NULL,
  holiday_name text NULL,
  source text NOT NULL,
  provider_as_of timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT market_session_calendar_status_check
    CHECK (market_status IN ('closed', 'early_close')),
  CONSTRAINT market_session_calendar_source_nonempty
    CHECK (char_length(btrim(source)) > 0),
  CONSTRAINT market_session_calendar_open_before_close
    CHECK (regular_open_et < regular_close_et),
  CONSTRAINT market_session_calendar_close_before_ah_end
    CHECK (regular_close_et < after_hours_end_et)
);

COMMENT ON TABLE public.market_session_calendar IS
  'Service-managed U.S. equities exception calendar (closed/early-close). Normal sessions are not stored.';

ALTER TABLE public.market_session_calendar ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.market_session_calendar FROM PUBLIC;
REVOKE ALL ON TABLE public.market_session_calendar FROM anon;
REVOKE ALL ON TABLE public.market_session_calendar FROM authenticated;
GRANT ALL ON TABLE public.market_session_calendar TO service_role;

CREATE OR REPLACE FUNCTION public.replace_market_session_calendar_exceptions_v1(
  p_rows jsonb,
  p_as_of_date date,
  p_provider_as_of timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_len integer;
  v_elem jsonb;
  v_date date;
  v_status text;
  v_open time;
  v_close time;
  v_ah_end time;
  v_name text;
  v_source text;
  v_seen date[] := ARRAY[]::date[];
  v_now timestamptz := clock_timestamp();
  v_inserted integer := 0;
BEGIN
  IF p_as_of_date IS NULL THEN
    RAISE EXCEPTION 'as_of_date required';
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
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'rows must be a JSON array';
  END IF;

  v_len := jsonb_array_length(p_rows);
  IF v_len > 400 THEN
    RAISE EXCEPTION 'rows exceed calendar limit';
  END IF;

  -- Validate every element before any mutation.
  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    IF jsonb_typeof(v_elem) <> 'object' THEN
      RAISE EXCEPTION 'row must be an object';
    END IF;

    BEGIN
      v_date := (v_elem ->> 'session_date')::date;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid session_date';
    END;
    IF v_date IS NULL OR v_date < p_as_of_date THEN
      RAISE EXCEPTION 'invalid session_date';
    END IF;
    IF v_date = ANY (v_seen) THEN
      RAISE EXCEPTION 'duplicate session_date';
    END IF;
    v_seen := array_append(v_seen, v_date);

    v_status := v_elem ->> 'market_status';
    IF v_status IS NULL OR v_status NOT IN ('closed', 'early_close') THEN
      RAISE EXCEPTION 'invalid market_status';
    END IF;

    BEGIN
      v_open := (v_elem ->> 'regular_open_et')::time;
      v_close := (v_elem ->> 'regular_close_et')::time;
      v_ah_end := (v_elem ->> 'after_hours_end_et')::time;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid session times';
    END;
    IF v_open IS NULL OR v_close IS NULL OR v_ah_end IS NULL THEN
      RAISE EXCEPTION 'invalid session times';
    END IF;
    IF NOT (v_open < v_close AND v_close < v_ah_end) THEN
      RAISE EXCEPTION 'invalid session time order';
    END IF;

    v_source := btrim(COALESCE(v_elem ->> 'source', ''));
    IF v_source = '' THEN
      RAISE EXCEPTION 'invalid source';
    END IF;

    v_name := v_elem ->> 'holiday_name';
    IF v_name IS NOT NULL AND btrim(v_name) = '' THEN
      v_name := NULL;
    END IF;
  END LOOP;

  DELETE FROM public.market_session_calendar
  WHERE session_date >= p_as_of_date
    AND (
      v_len = 0
      OR session_date NOT IN (
        SELECT (value ->> 'session_date')::date
        FROM jsonb_array_elements(p_rows)
      )
    );

  IF v_len = 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO public.market_session_calendar (
    session_date,
    market_status,
    regular_open_et,
    regular_close_et,
    after_hours_end_et,
    holiday_name,
    source,
    provider_as_of,
    updated_at
  )
  SELECT
    (e ->> 'session_date')::date,
    e ->> 'market_status',
    (e ->> 'regular_open_et')::time,
    (e ->> 'regular_close_et')::time,
    (e ->> 'after_hours_end_et')::time,
    NULLIF(btrim(COALESCE(e ->> 'holiday_name', '')), ''),
    btrim(e ->> 'source'),
    p_provider_as_of,
    v_now
  FROM jsonb_array_elements(p_rows) AS e
  ON CONFLICT (session_date) DO UPDATE SET
    market_status = EXCLUDED.market_status,
    regular_open_et = EXCLUDED.regular_open_et,
    regular_close_et = EXCLUDED.regular_close_et,
    after_hours_end_et = EXCLUDED.after_hours_end_et,
    holiday_name = EXCLUDED.holiday_name,
    source = EXCLUDED.source,
    provider_as_of = EXCLUDED.provider_as_of,
    updated_at = EXCLUDED.updated_at;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$fn$;

REVOKE ALL ON FUNCTION public.replace_market_session_calendar_exceptions_v1(jsonb, date, timestamptz)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_market_session_calendar_exceptions_v1(jsonb, date, timestamptz)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_market_session_calendar_exceptions_v1(jsonb, date, timestamptz)
  TO service_role;