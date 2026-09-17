-- RVOL 20D volume baseline V1: generation-scoped daily history + published baselines.
CREATE TABLE IF NOT EXISTS public.screener_daily_volume_history (
  generation_id uuid NOT NULL,
  symbol text NOT NULL,
  session_date date NOT NULL,
  volume numeric NOT NULL,
  provider_as_of timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (generation_id, symbol, session_date),
  CONSTRAINT screener_daily_volume_history_symbol_check
    CHECK (symbol ~ '^[A-Z][A-Z0-9.\-]*$' AND char_length(symbol) <= 12),
  CONSTRAINT screener_daily_volume_history_volume_positive
    CHECK (volume > 0)
);

COMMENT ON TABLE public.screener_daily_volume_history IS
  'Generation-scoped grouped-daily volume history. Retains at most 20 valid sessions per symbol. Current production generation keeps its rolling history after publish for incremental copy-forward.';

CREATE INDEX IF NOT EXISTS screener_daily_volume_history_generation_symbol_idx
  ON public.screener_daily_volume_history (generation_id, symbol);

CREATE INDEX IF NOT EXISTS screener_daily_volume_history_generation_date_idx
  ON public.screener_daily_volume_history (generation_id, session_date);

CREATE TABLE IF NOT EXISTS public.screener_volume_baselines (
  generation_id uuid NOT NULL,
  symbol text NOT NULL,
  avg_volume_20d numeric NULL,
  volume_sessions_used smallint NOT NULL,
  window_start_date date NULL,
  window_end_date date NULL,
  provider_as_of timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (generation_id, symbol),
  CONSTRAINT screener_volume_baselines_symbol_check
    CHECK (symbol ~ '^[A-Z][A-Z0-9.\-]*$' AND char_length(symbol) <= 12),
  CONSTRAINT screener_volume_baselines_sessions_used_check
    CHECK (volume_sessions_used >= 0 AND volume_sessions_used <= 20),
  CONSTRAINT screener_volume_baselines_window_order
    CHECK (
      window_start_date IS NULL
      OR window_end_date IS NULL
      OR window_start_date <= window_end_date
    ),
  CONSTRAINT screener_volume_baselines_publishable_pair
    CHECK (
      (volume_sessions_used = 20 AND avg_volume_20d IS NOT NULL AND avg_volume_20d > 0
        AND window_start_date IS NOT NULL AND window_end_date IS NOT NULL)
      OR (volume_sessions_used <> 20 AND avg_volume_20d IS NULL
        AND window_start_date IS NULL AND window_end_date IS NULL)
    )
);

COMMENT ON TABLE public.screener_volume_baselines IS
  'Published RVOL 20D denominators. Readers must join through current 52W baseline generation pointer.';

CREATE INDEX IF NOT EXISTS screener_volume_baselines_generation_idx
  ON public.screener_volume_baselines (generation_id);

CREATE TABLE IF NOT EXISTS public.screener_daily_volume_job_dates (
  generation_id uuid NOT NULL,
  session_date date NOT NULL,
  PRIMARY KEY (generation_id, session_date)
);

COMMENT ON TABLE public.screener_daily_volume_job_dates IS
  'Generation-scoped idempotency for apply_screener_daily_volume_day_v1. Same session_date in generation A does not block generation B.';

ALTER TABLE public.screener_daily_volume_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screener_volume_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screener_daily_volume_job_dates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.screener_daily_volume_history FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.screener_volume_baselines FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.screener_daily_volume_job_dates FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.screener_daily_volume_history TO service_role;
GRANT ALL ON TABLE public.screener_volume_baselines TO service_role;
GRANT ALL ON TABLE public.screener_daily_volume_job_dates TO service_role;

ALTER TABLE public.screener_results
  ADD COLUMN IF NOT EXISTS avg_volume_20d numeric NULL,
  ADD COLUMN IF NOT EXISTS rvol_20d numeric NULL;

COMMENT ON COLUMN public.screener_results.avg_volume_20d IS
  'Prior 20 full-day average regular-session volume snapshot for RVOL 20D.';
COMMENT ON COLUMN public.screener_results.rvol_20d IS
  'Snapshot RVOL 20D for this screener generation cycle (current volume / avg_volume_20d).';

CREATE OR REPLACE FUNCTION public.trim_screener_daily_volume_history_v1(
  p_generation_id uuid,
  p_symbols text[]
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $trim$
  DELETE FROM public.screener_daily_volume_history h
  WHERE h.generation_id = p_generation_id
    AND h.symbol = ANY (p_symbols)
    AND h.ctid IN (
      SELECT x.ctid
      FROM (
        SELECT
          hh.ctid,
          ROW_NUMBER() OVER (
            PARTITION BY hh.symbol
            ORDER BY hh.session_date DESC
          ) AS rn
        FROM public.screener_daily_volume_history hh
        WHERE hh.generation_id = p_generation_id
          AND hh.symbol = ANY (p_symbols)
      ) x
      WHERE x.rn > 20
    );
$trim$;

REVOKE ALL ON FUNCTION public.trim_screener_daily_volume_history_v1(uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trim_screener_daily_volume_history_v1(uuid, text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.copy_screener_daily_volume_history_from_current_v1(
  p_target_generation_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $copy$
DECLARE
  v_source uuid;
  v_inserted integer := 0;
BEGIN
  IF p_target_generation_id IS NULL THEN
    RAISE EXCEPTION 'generation_id required';
  END IF;

  SELECT current_generation_id INTO v_source
  FROM public.screener_52w_baseline_state
  WHERE state_key = 'current';

  IF v_source IS NULL OR v_source IS NOT DISTINCT FROM p_target_generation_id THEN
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
  ON CONFLICT (generation_id, symbol, session_date) DO UPDATE SET
    volume = EXCLUDED.volume,
    provider_as_of = EXCLUDED.provider_as_of,
    created_at = EXCLUDED.created_at;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$copy$;

REVOKE ALL ON FUNCTION public.copy_screener_daily_volume_history_from_current_v1(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.copy_screener_daily_volume_history_from_current_v1(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.apply_screener_daily_volume_day_v1(
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
  v_job public.screener_52w_baseline_job%ROWTYPE;
  v_len integer;
  v_symbols text[];
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
    FROM public.screener_daily_volume_job_dates
    WHERE generation_id = p_generation_id
      AND session_date = p_session_date
  ) THEN
    RETURN jsonb_build_object('skipped', true, 'session_date', p_session_date);
  END IF;

  WITH upserted AS (
    INSERT INTO public.screener_daily_volume_history (
      generation_id,
      symbol,
      session_date,
      volume,
      provider_as_of,
      created_at
    )
    SELECT
      p_generation_id,
      d.symbol,
      p_session_date,
      d.volume,
      p_provider_as_of,
      clock_timestamp()
    FROM (
      SELECT
        v.symbol,
        MAX(v.volume) AS volume
      FROM (
        SELECT
          upper(trim(COALESCE(e.elem ->> 'symbol', ''))) AS symbol,
          public.try_screener_bar_numeric(e.elem ->> 'v') AS volume
        FROM jsonb_array_elements(p_bars) AS e(elem)
        WHERE jsonb_typeof(e.elem) = 'object'
      ) v
      WHERE v.symbol <> ''
        AND char_length(v.symbol) <= 12
        AND v.symbol ~ '^[A-Z][A-Z0-9.\-]*$'
        AND v.volume IS NOT NULL
        AND v.volume > 0
      GROUP BY v.symbol
    ) d
    ON CONFLICT (generation_id, symbol, session_date) DO UPDATE SET
      volume = EXCLUDED.volume,
      provider_as_of = EXCLUDED.provider_as_of,
      created_at = EXCLUDED.created_at
    RETURNING symbol
  )
  SELECT COALESCE(array_agg(DISTINCT symbol), ARRAY[]::text[])
    INTO v_symbols
  FROM upserted;

  IF array_length(v_symbols, 1) IS NOT NULL THEN
    PERFORM public.trim_screener_daily_volume_history_v1(p_generation_id, v_symbols);
  END IF;

  INSERT INTO public.screener_daily_volume_job_dates (generation_id, session_date)
  VALUES (p_generation_id, p_session_date);

  RETURN jsonb_build_object('skipped', false, 'session_date', p_session_date);
END;
$fn$;

REVOKE ALL ON FUNCTION public.apply_screener_daily_volume_day_v1(uuid, date, jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_screener_daily_volume_day_v1(uuid, date, jsonb, timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.publish_screener_volume_baselines_v1(
  p_generation_id uuid,
  p_provider_as_of timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $pub$
DECLARE
  v_inserted integer := 0;
BEGIN
  IF p_generation_id IS NULL THEN
    RAISE EXCEPTION 'generation_id required';
  END IF;
  IF p_provider_as_of IS NULL THEN
    RAISE EXCEPTION 'provider_as_of required';
  END IF;

  DELETE FROM public.screener_volume_baselines
  WHERE generation_id = p_generation_id;

  INSERT INTO public.screener_volume_baselines (
    generation_id,
    symbol,
    avg_volume_20d,
    volume_sessions_used,
    window_start_date,
    window_end_date,
    provider_as_of,
    updated_at
  )
  SELECT
    p_generation_id,
    agg.symbol,
    agg.avg_volume_20d,
    20::smallint,
    agg.window_start_date,
    agg.window_end_date,
    p_provider_as_of,
    clock_timestamp()
  FROM (
    SELECT
      h.symbol,
      AVG(h.volume) AS avg_volume_20d,
      MIN(h.session_date) AS window_start_date,
      MAX(h.session_date) AS window_end_date,
      COUNT(*) AS session_count
    FROM public.screener_daily_volume_history h
    WHERE h.generation_id = p_generation_id
    GROUP BY h.symbol
    HAVING COUNT(*) = 20
  ) agg;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$pub$;

REVOKE ALL ON FUNCTION public.publish_screener_volume_baselines_v1(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_screener_volume_baselines_v1(uuid, timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.append_screener_daily_volume_history_v1(
  p_generation_id uuid,
  p_rows jsonb,
  p_provider_as_of timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $append$
DECLARE
  v_job public.screener_52w_baseline_publish_job%ROWTYPE;
  v_len integer;
  v_symbols text[];
  v_inserted integer := 0;
BEGIN
  IF p_generation_id IS NULL THEN
    RAISE EXCEPTION 'generation_id required';
  END IF;
  IF p_provider_as_of IS NULL THEN
    RAISE EXCEPTION 'provider_as_of required';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'rows must be a JSON array';
  END IF;
  v_len := jsonb_array_length(p_rows);
  IF v_len < 1 OR v_len > 20000 THEN
    RAISE EXCEPTION 'rows out of bounds';
  END IF;

  SELECT * INTO v_job
  FROM public.screener_52w_baseline_publish_job
  WHERE job_key = 'current'
  FOR UPDATE;

  IF NOT FOUND OR v_job.generation_id IS DISTINCT FROM p_generation_id THEN
    RAISE EXCEPTION 'publish job generation mismatch';
  END IF;
  IF v_job.status <> 'staging' THEN
    RAISE EXCEPTION 'publish job is not staging';
  END IF;

  WITH upserted AS (
    INSERT INTO public.screener_daily_volume_history (
      generation_id,
      symbol,
      session_date,
      volume,
      provider_as_of,
      created_at
    )
    SELECT
      p_generation_id,
      upper(trim(e ->> 'symbol')),
      (e ->> 'session_date')::date,
      public.try_screener_bar_numeric(e ->> 'volume'),
      p_provider_as_of,
      clock_timestamp()
    FROM jsonb_array_elements(p_rows) AS e
    WHERE jsonb_typeof(e) = 'object'
      AND upper(trim(COALESCE(e ->> 'symbol', ''))) ~ '^[A-Z][A-Z0-9.\-]*$'
      AND char_length(upper(trim(COALESCE(e ->> 'symbol', '')))) <= 12
      AND public.try_screener_bar_numeric(e ->> 'volume') IS NOT NULL
      AND public.try_screener_bar_numeric(e ->> 'volume') > 0
    ON CONFLICT (generation_id, symbol, session_date) DO UPDATE SET
      volume = EXCLUDED.volume,
      provider_as_of = EXCLUDED.provider_as_of,
      created_at = EXCLUDED.created_at
    RETURNING symbol
  )
  SELECT COALESCE(array_agg(DISTINCT symbol), ARRAY[]::text[])
    INTO v_symbols
  FROM upserted;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF array_length(v_symbols, 1) IS NOT NULL THEN
    PERFORM public.trim_screener_daily_volume_history_v1(p_generation_id, v_symbols);
  END IF;

  RETURN v_inserted;
END;
$append$;

REVOKE ALL ON FUNCTION public.append_screener_daily_volume_history_v1(uuid, jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_screener_daily_volume_history_v1(uuid, jsonb, timestamptz)
  TO service_role;

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
  v_current uuid;
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

  SELECT current_generation_id INTO v_current
  FROM public.screener_52w_baseline_state
  WHERE state_key = 'current';

  IF FOUND THEN
    v_old := v_job.generation_id;
    DELETE FROM public.screener_52w_baseline_staging WHERE generation_id = v_old;
    DELETE FROM public.screener_52w_baseline_job_dates WHERE generation_id = v_old;
    IF v_old IS DISTINCT FROM v_current THEN
      DELETE FROM public.screener_daily_volume_history WHERE generation_id = v_old;
      DELETE FROM public.screener_daily_volume_job_dates WHERE generation_id = v_old;
      DELETE FROM public.screener_volume_baselines WHERE generation_id = v_old;
    END IF;
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

  PERFORM public.copy_screener_daily_volume_history_from_current_v1(p_generation_id);

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
  v_exclusions jsonb;
  v_count integer;
  v_status text;
  v_inserted integer;
  v_excluded integer;
  v_volume_published integer;
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

  v_volume_published := public.publish_screener_volume_baselines_v1(
    p_generation_id,
    p_provider_as_of
  );

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

  SELECT COALESCE(jsonb_agg(excl_payload ORDER BY symbol), '[]'::jsonb)
    INTO v_exclusions
  FROM (
    SELECT
      s.symbol,
      jsonb_build_object(
        'symbol', s.symbol,
        'reason', 'insufficient_sessions',
        'sessions_observed', s.sessions_observed,
        'min_sessions', p_min_sessions
      ) AS excl_payload
    FROM public.screener_52w_baseline_staging s
    WHERE s.generation_id = p_generation_id
      AND s.sessions_observed < p_min_sessions
  ) q;

  v_excluded := jsonb_array_length(v_exclusions);

  v_inserted := public.replace_screener_52w_baseline_generation_with_exclusions_v1(
    p_generation_id,
    v_rows,
    v_job.period_start,
    v_job.period_end,
    p_provider_as_of,
    v_status,
    v_exclusions,
    p_min_sessions
  );

  UPDATE public.screener_52w_baseline_job
  SET status = 'idle',
      provider_as_of = p_provider_as_of,
      updated_at = clock_timestamp()
  WHERE job_key = 'current';

  DELETE FROM public.screener_52w_baseline_staging WHERE generation_id = p_generation_id;
  DELETE FROM public.screener_52w_baseline_job_dates WHERE generation_id = p_generation_id;
  DELETE FROM public.screener_daily_volume_job_dates WHERE generation_id = p_generation_id;

  RETURN jsonb_build_object(
    'published', true,
    'symbol_count', v_inserted,
    'status', v_status,
    'policy_excluded_count', v_excluded,
    'policy_min_sessions', p_min_sessions,
    'volume_baseline_count', v_volume_published
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.cleanup_stale_screener_volume_generations_v1(
  p_keep_generation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $cleanup$
BEGIN
  IF p_keep_generation_id IS NULL THEN
    RAISE EXCEPTION 'generation_id required';
  END IF;
  -- Never delete the kept (current) generation: baselines + rolling history must survive.
  DELETE FROM public.screener_volume_baselines
  WHERE generation_id IS DISTINCT FROM p_keep_generation_id;
  DELETE FROM public.screener_daily_volume_history
  WHERE generation_id IS DISTINCT FROM p_keep_generation_id;
  DELETE FROM public.screener_daily_volume_job_dates
  WHERE generation_id IS DISTINCT FROM p_keep_generation_id;
END;
$cleanup$;

COMMENT ON FUNCTION public.cleanup_stale_screener_volume_generations_v1(uuid) IS
  'Removes abandoned/stale volume generations only. The kept generation_id retains baselines and rolling history.';

REVOKE ALL ON FUNCTION public.cleanup_stale_screener_volume_generations_v1(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_screener_volume_generations_v1(uuid)
  TO service_role;

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
  IF p_generation_id IS NULL THEN RAISE EXCEPTION 'generation_id required'; END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL THEN RAISE EXCEPTION 'period required'; END IF;
  IF p_period_start > p_period_end THEN RAISE EXCEPTION 'period inverted'; END IF;
  IF p_provider_as_of IS NULL THEN RAISE EXCEPTION 'provider_as_of required'; END IF;
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
  IF v_len > 20000 THEN RAISE EXCEPTION 'rows exceed baseline limit'; END IF;
  IF p_status = 'empty' AND v_len <> 0 THEN RAISE EXCEPTION 'empty status requires zero rows'; END IF;
  IF p_status = 'available' AND v_len = 0 THEN RAISE EXCEPTION 'available status requires rows'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) AS e WHERE jsonb_typeof(e) <> 'object'
  ) THEN RAISE EXCEPTION 'row must be an object'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) AS e
    WHERE upper(trim(COALESCE(e ->> 'symbol', ''))) = ''
       OR char_length(upper(trim(COALESCE(e ->> 'symbol', '')))) > 12
       OR upper(trim(COALESCE(e ->> 'symbol', ''))) !~ '^[A-Z][A-Z0-9.\-]*$'
  ) THEN RAISE EXCEPTION 'invalid symbol'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) AS e
    GROUP BY upper(trim(COALESCE(e ->> 'symbol', ''))) HAVING COUNT(*) > 1
  ) THEN RAISE EXCEPTION 'duplicate symbol'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) AS e
    WHERE NULLIF(e ->> 'period_start', '')::date IS DISTINCT FROM p_period_start
       OR NULLIF(e ->> 'period_end', '')::date IS DISTINCT FROM p_period_end
  ) THEN RAISE EXCEPTION 'row period mismatch'; END IF;

  BEGIN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_rows) AS e
      WHERE (e ->> 'high_52w')::numeric IS NULL OR (e ->> 'low_52w')::numeric IS NULL
         OR (e ->> 'high_52w')::numeric <= 0 OR (e ->> 'low_52w')::numeric <= 0
         OR (e ->> 'low_52w')::numeric > (e ->> 'high_52w')::numeric
    ) THEN RAISE EXCEPTION 'invalid high_52w/low_52w'; END IF;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid high_52w/low_52w'; END;

  BEGIN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_rows) AS e
      WHERE (e ->> 'sessions_observed')::integer IS NULL
         OR (e ->> 'sessions_observed')::integer < 1
    ) THEN RAISE EXCEPTION 'invalid sessions_observed'; END IF;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid sessions_observed'; END;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) AS e
    WHERE jsonb_typeof(e -> 'high_candidates') <> 'array'
       OR jsonb_array_length(e -> 'high_candidates') < 1
  ) THEN RAISE EXCEPTION 'invalid high_candidates'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) AS e
    WHERE jsonb_typeof(e -> 'low_candidates') <> 'array'
       OR jsonb_array_length(e -> 'low_candidates') < 1
  ) THEN RAISE EXCEPTION 'invalid low_candidates'; END IF;

  IF v_len > 0 THEN
    INSERT INTO public.screener_52w_baselines (
      generation_id, symbol, period_start, period_end,
      high_52w, low_52w, high_candidates, low_candidates,
      sessions_observed, provider_as_of, updated_at
    )
    SELECT
      p_generation_id, upper(trim(e ->> 'symbol')), p_period_start, p_period_end,
      (e ->> 'high_52w')::numeric, (e ->> 'low_52w')::numeric,
      e -> 'high_candidates', e -> 'low_candidates',
      (e ->> 'sessions_observed')::integer, p_provider_as_of, p_provider_as_of
    FROM jsonb_array_elements(p_rows) AS e;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted <> v_len THEN RAISE EXCEPTION 'insert count mismatch'; END IF;
  END IF;

  INSERT INTO public.screener_52w_baseline_state (
    state_key, current_generation_id, status, period_start, period_end,
    symbol_count, provider_as_of, updated_at, policy_min_sessions, policy_excluded_count
  ) VALUES (
    'current', p_generation_id, p_status, p_period_start, p_period_end,
    v_inserted, p_provider_as_of, p_provider_as_of, NULL, NULL
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
  DELETE FROM public.screener_52w_baseline_exclusions;
  PERFORM public.cleanup_stale_screener_volume_generations_v1(p_generation_id);

  RETURN v_inserted;
END;
$fn$;

REVOKE ALL ON FUNCTION public.replace_screener_52w_baseline_generation_v1(uuid, jsonb, date, date, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_screener_52w_baseline_generation_v1(uuid, jsonb, date, date, timestamptz, text)
  TO service_role;

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
  v_old uuid;
  v_current uuid;
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

    SELECT current_generation_id INTO v_current
    FROM public.screener_52w_baseline_state
    WHERE state_key = 'current';

    v_old := v_job.generation_id;
    DELETE FROM public.screener_52w_baseline_publish_rows
    WHERE generation_id = v_old;
    DELETE FROM public.screener_52w_baseline_publish_exclusions
    WHERE generation_id = v_old;
    IF v_old IS DISTINCT FROM v_current THEN
      DELETE FROM public.screener_daily_volume_history WHERE generation_id = v_old;
      DELETE FROM public.screener_daily_volume_job_dates WHERE generation_id = v_old;
      DELETE FROM public.screener_volume_baselines WHERE generation_id = v_old;
    END IF;
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

  PERFORM public.copy_screener_daily_volume_history_from_current_v1(p_generation_id);

  RETURN jsonb_build_object(
    'ok', true,
    'generation_id', p_generation_id,
    'resumed', v_resumed
  );
END;
$fn$;

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
  v_volume_published integer := 0;
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

  PERFORM public.cleanup_stale_screener_volume_generations_v1(p_generation_id);

  DELETE FROM public.screener_52w_baseline_publish_rows
  WHERE generation_id = p_generation_id;
  DELETE FROM public.screener_52w_baseline_publish_exclusions
  WHERE generation_id = p_generation_id;
  DELETE FROM public.screener_daily_volume_job_dates
  WHERE generation_id = p_generation_id;
  DELETE FROM public.screener_52w_baseline_publish_job
  WHERE job_key = 'current'
    AND generation_id = p_generation_id;

  RETURN v_inserted;
END;
$fn$;