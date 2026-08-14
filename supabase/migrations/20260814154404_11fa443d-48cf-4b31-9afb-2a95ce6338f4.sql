-- Verified prior-52-week baseline storage + New Highs/Lows generation contract.
-- Forward-only. Does not edit historical migrations.

-- ── Baseline tables (service-managed; never expose a partial generation) ──

CREATE TABLE IF NOT EXISTS public.screener_52w_baseline_state (
  state_key text PRIMARY KEY,
  current_generation_id uuid NULL,
  status text NOT NULL,
  period_start date NULL,
  period_end date NULL,
  symbol_count integer NOT NULL,
  provider_as_of timestamptz NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT screener_52w_baseline_state_key_current CHECK (state_key = 'current'),
  CONSTRAINT screener_52w_baseline_state_status_check
    CHECK (status IN ('initializing', 'available', 'empty', 'unavailable')),
  CONSTRAINT screener_52w_baseline_state_symbol_count_nonneg CHECK (symbol_count >= 0),
  CONSTRAINT screener_52w_baseline_state_period_order
    CHECK (period_start IS NULL OR period_end IS NULL OR period_start <= period_end)
);

COMMENT ON TABLE public.screener_52w_baseline_state IS
  'Single-row pointer to the current validated 52-week baseline generation.';

CREATE TABLE IF NOT EXISTS public.screener_52w_baselines (
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
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (generation_id, symbol),
  CONSTRAINT screener_52w_baselines_symbol_check
    CHECK (symbol ~ '^[A-Z][A-Z0-9.\-]*$' AND char_length(symbol) <= 12),
  CONSTRAINT screener_52w_baselines_high_low_positive
    CHECK (high_52w > 0 AND low_52w > 0 AND low_52w <= high_52w),
  CONSTRAINT screener_52w_baselines_sessions_positive
    CHECK (sessions_observed >= 1),
  CONSTRAINT screener_52w_baselines_period_order
    CHECK (period_start <= period_end),
  CONSTRAINT screener_52w_baselines_high_candidates_array
    CHECK (jsonb_typeof(high_candidates) = 'array' AND jsonb_array_length(high_candidates) >= 1),
  CONSTRAINT screener_52w_baselines_low_candidates_array
    CHECK (jsonb_typeof(low_candidates) = 'array' AND jsonb_array_length(low_candidates) >= 1)
);

COMMENT ON TABLE public.screener_52w_baselines IS
  'Versioned 52-week high/low baselines. Readers must join through the current-generation pointer.';

CREATE INDEX IF NOT EXISTS screener_52w_baselines_generation_idx
  ON public.screener_52w_baselines (generation_id);

ALTER TABLE public.screener_52w_baseline_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screener_52w_baselines ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.screener_52w_baseline_state FROM PUBLIC;
REVOKE ALL ON TABLE public.screener_52w_baseline_state FROM anon;
REVOKE ALL ON TABLE public.screener_52w_baseline_state FROM authenticated;
GRANT ALL ON TABLE public.screener_52w_baseline_state TO service_role;

REVOKE ALL ON TABLE public.screener_52w_baselines FROM PUBLIC;
REVOKE ALL ON TABLE public.screener_52w_baselines FROM anon;
REVOKE ALL ON TABLE public.screener_52w_baselines FROM authenticated;
GRANT ALL ON TABLE public.screener_52w_baselines TO service_role;

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
  NULL,
  'initializing',
  NULL,
  NULL,
  0,
  NULL,
  timestamptz '2000-01-01 00:00:00+00'
)
ON CONFLICT (state_key) DO NOTHING;

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
  v_elem jsonb;
  v_symbol text;
  v_high numeric;
  v_low numeric;
  v_sessions integer;
  v_seen text[] := ARRAY[]::text[];
  v_now timestamptz := clock_timestamp();
  v_inserted integer := 0;
  v_prior_generation uuid;
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

  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    IF jsonb_typeof(v_elem) <> 'object' THEN
      RAISE EXCEPTION 'row must be an object';
    END IF;

    v_symbol := upper(trim(COALESCE(v_elem ->> 'symbol', '')));
    IF v_symbol = '' OR char_length(v_symbol) > 12 OR v_symbol !~ '^[A-Z][A-Z0-9.\-]*$' THEN
      RAISE EXCEPTION 'invalid symbol';
    END IF;
    IF v_symbol = ANY (v_seen) THEN
      RAISE EXCEPTION 'duplicate symbol';
    END IF;
    v_seen := array_append(v_seen, v_symbol);

    IF NULLIF(v_elem ->> 'period_start', '')::date IS DISTINCT FROM p_period_start
       OR NULLIF(v_elem ->> 'period_end', '')::date IS DISTINCT FROM p_period_end THEN
      RAISE EXCEPTION 'row period mismatch';
    END IF;

    BEGIN
      v_high := (v_elem ->> 'high_52w')::numeric;
      v_low := (v_elem ->> 'low_52w')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid high_52w/low_52w';
    END;
    IF v_high IS NULL OR v_low IS NULL OR v_high <= 0 OR v_low <= 0 OR v_low > v_high THEN
      RAISE EXCEPTION 'invalid high_52w/low_52w';
    END IF;

    BEGIN
      v_sessions := (v_elem ->> 'sessions_observed')::integer;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid sessions_observed';
    END;
    IF v_sessions IS NULL OR v_sessions < 1 THEN
      RAISE EXCEPTION 'invalid sessions_observed';
    END IF;

    IF jsonb_typeof(v_elem -> 'high_candidates') <> 'array'
       OR jsonb_array_length(v_elem -> 'high_candidates') < 1 THEN
      RAISE EXCEPTION 'invalid high_candidates';
    END IF;
    IF jsonb_typeof(v_elem -> 'low_candidates') <> 'array'
       OR jsonb_array_length(v_elem -> 'low_candidates') < 1 THEN
      RAISE EXCEPTION 'invalid low_candidates';
    END IF;
  END LOOP;

  SELECT current_generation_id
    INTO v_prior_generation
    FROM public.screener_52w_baseline_state
   WHERE state_key = 'current';

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

-- ── Screener results: range_event + 52w fields for New Highs/Lows ─────────

ALTER TABLE public.screener_results
  ADD COLUMN IF NOT EXISTS range_event text;

ALTER TABLE public.screener_feed_state
  ADD COLUMN IF NOT EXISTS nhl_baseline_status text;

DO $ck$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'screener_results_range_event_check'
  ) THEN
    ALTER TABLE public.screener_results
      ADD CONSTRAINT screener_results_range_event_check
      CHECK (range_event IS NULL OR range_event IN ('new_high', 'new_low', 'both'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'screener_feed_state_nhl_baseline_status_check'
  ) THEN
    ALTER TABLE public.screener_feed_state
      ADD CONSTRAINT screener_feed_state_nhl_baseline_status_check
      CHECK (
        nhl_baseline_status IS NULL
        OR nhl_baseline_status IN ('available', 'initializing', 'unavailable')
      );
  END IF;
END;
$ck$;

DROP FUNCTION IF EXISTS public.replace_screener_results_generation_v1(jsonb, uuid, timestamptz);

CREATE OR REPLACE FUNCTION public.replace_screener_results_generation_v1(
  p_rows jsonb,
  p_sync_run_id uuid,
  p_synced_at timestamptz,
  p_nhl_baseline_status text DEFAULT 'initializing'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_managed_tabs text[] := ARRAY[
    'day_trade_radar',
    'gappers',
    'volume_spikes',
    'gainers_losers',
    'unusual_volume',
    'new_highs_lows'
  ];
  v_insert_tabs text[] := ARRAY[
    'day_trade_radar',
    'gappers',
    'volume_spikes',
    'gainers_losers',
    'unusual_volume',
    'new_highs_lows'
  ];
  v_ratio_tabs text[] := ARRAY[
    'day_trade_radar',
    'volume_spikes',
    'unusual_volume'
  ];
  v_len integer;
  v_elem jsonb;
  v_tab text;
  v_symbol text;
  v_volume numeric;
  v_prior_vol numeric;
  v_ratio numeric;
  v_day_high numeric;
  v_day_low numeric;
  v_high_52w numeric;
  v_low_52w numeric;
  v_range_event text;
  v_provider_as_of timestamptz;
  v_seen text[] := ARRAY[]::text[];
  v_key text;
  v_tab_counts jsonb;
  v_count integer;
  v_inserted integer := 0;
  v_provider_min timestamptz := NULL;
  v_provider_max timestamptz := NULL;
  v_status text;
  v_nhl_status text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_sync_run_id IS NULL THEN
    RAISE EXCEPTION 'sync_run_id required';
  END IF;
  IF p_synced_at IS NULL THEN
    RAISE EXCEPTION 'synced_at required';
  END IF;
  IF p_synced_at < timestamptz '2000-01-01 00:00:00+00'
     OR p_synced_at > timestamptz '2100-01-01 00:00:00+00' THEN
    RAISE EXCEPTION 'synced_at implausible';
  END IF;
  IF p_synced_at > v_now + interval '5 minutes' THEN
    RAISE EXCEPTION 'synced_at too far in the future';
  END IF;
  IF p_nhl_baseline_status IS NULL
     OR p_nhl_baseline_status NOT IN ('available', 'initializing', 'unavailable') THEN
    RAISE EXCEPTION 'invalid nhl_baseline_status';
  END IF;
  v_nhl_status := p_nhl_baseline_status;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'rows must be a JSON array';
  END IF;

  v_len := jsonb_array_length(p_rows);
  IF v_len > 120 THEN
    RAISE EXCEPTION 'rows exceed total limit of 120';
  END IF;

  v_tab_counts := jsonb_build_object(
    'day_trade_radar', 0,
    'gappers', 0,
    'volume_spikes', 0,
    'gainers_losers', 0,
    'unusual_volume', 0,
    'new_highs_lows', 0
  );

  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    IF jsonb_typeof(v_elem) <> 'object' THEN
      RAISE EXCEPTION 'row must be an object';
    END IF;

    v_tab := v_elem ->> 'tab_id';
    IF v_tab IS NULL OR NOT (v_tab = ANY (v_insert_tabs)) THEN
      RAISE EXCEPTION 'invalid tab_id';
    END IF;

    v_symbol := upper(trim(COALESCE(v_elem ->> 'symbol', '')));
    IF v_symbol IS NULL OR v_symbol = '' OR char_length(v_symbol) > 12 THEN
      RAISE EXCEPTION 'invalid symbol';
    END IF;
    IF v_symbol !~ '^[A-Z][A-Z0-9.\-]*$' THEN
      RAISE EXCEPTION 'invalid symbol';
    END IF;

    BEGIN
      v_volume := (v_elem ->> 'volume')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid volume';
    END;
    IF v_volume IS NULL OR v_volume <= 0 THEN
      RAISE EXCEPTION 'nonpositive volume';
    END IF;

    IF (v_elem->>'rvol') IS NOT NULL THEN
      RAISE EXCEPTION 'legacy rvol must be null';
    END IF;
    IF (v_elem->>'avg_volume') IS NOT NULL THEN
      RAISE EXCEPTION 'legacy avg_volume must be null';
    END IF;
    IF (v_elem->>'float_shares') IS NOT NULL THEN
      RAISE EXCEPTION 'float_shares must be null';
    END IF;
    IF (v_elem->>'market_cap') IS NOT NULL THEN
      RAISE EXCEPTION 'market_cap must be null';
    END IF;

    BEGIN
      v_prior_vol := NULLIF(v_elem->>'prior_session_volume', '')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid prior_session_volume';
    END;
    BEGIN
      v_ratio := NULLIF(v_elem->>'volume_ratio_prior_session', '')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid volume_ratio_prior_session';
    END;

    IF v_tab = ANY (v_ratio_tabs) THEN
      IF v_prior_vol IS NULL OR v_prior_vol <= 0 THEN
        RAISE EXCEPTION 'ratio tabs require positive prior_session_volume';
      END IF;
      IF v_ratio IS NULL OR v_ratio <= 0 THEN
        RAISE EXCEPTION 'ratio tabs require positive volume_ratio_prior_session';
      END IF;
    ELSIF v_prior_vol IS NOT NULL AND v_prior_vol <= 0 THEN
      RAISE EXCEPTION 'nonpositive prior_session_volume';
    ELSIF v_ratio IS NOT NULL AND v_ratio <= 0 THEN
      RAISE EXCEPTION 'nonpositive volume_ratio_prior_session';
    END IF;

    BEGIN
      v_day_high := NULLIF(v_elem->>'day_high', '')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid day_high';
    END;
    BEGIN
      v_day_low := NULLIF(v_elem->>'day_low', '')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid day_low';
    END;
    IF (v_day_high IS NULL) <> (v_day_low IS NULL) THEN
      RAISE EXCEPTION 'day_high and day_low must both be null or both set';
    END IF;
    IF v_day_high IS NOT NULL AND v_day_low > v_day_high THEN
      RAISE EXCEPTION 'day_low exceeds day_high';
    END IF;

    BEGIN
      v_high_52w := NULLIF(v_elem->>'high_52w', '')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid high_52w';
    END;
    BEGIN
      v_low_52w := NULLIF(v_elem->>'low_52w', '')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid low_52w';
    END;
    v_range_event := NULLIF(v_elem->>'range_event', '');

    IF v_tab = 'new_highs_lows' THEN
      IF v_nhl_status <> 'available' THEN
        RAISE EXCEPTION 'new_highs_lows rows require available baseline';
      END IF;
      IF v_high_52w IS NULL OR v_low_52w IS NULL OR v_high_52w <= 0 OR v_low_52w <= 0
         OR v_low_52w > v_high_52w THEN
        RAISE EXCEPTION 'new_highs_lows require valid 52w high/low';
      END IF;
      IF v_range_event IS NULL OR v_range_event NOT IN ('new_high', 'new_low', 'both') THEN
        RAISE EXCEPTION 'invalid range_event';
      END IF;
      IF v_day_high IS NULL OR v_day_low IS NULL THEN
        RAISE EXCEPTION 'new_highs_lows require day range';
      END IF;
    ELSE
      IF v_high_52w IS NOT NULL OR v_low_52w IS NOT NULL THEN
        RAISE EXCEPTION '52w fields reserved for new_highs_lows';
      END IF;
      IF v_range_event IS NOT NULL THEN
        RAISE EXCEPTION 'range_event reserved for new_highs_lows';
      END IF;
    END IF;

    BEGIN
      v_provider_as_of := (v_elem ->> 'provider_as_of')::timestamptz;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid provider_as_of';
    END;
    IF v_provider_as_of IS NULL THEN
      RAISE EXCEPTION 'missing provider_as_of';
    END IF;
    IF v_provider_as_of > p_synced_at + interval '5 minutes' THEN
      RAISE EXCEPTION 'provider_as_of too far after synced_at';
    END IF;

    v_key := v_tab || chr(1) || v_symbol;
    IF v_key = ANY (v_seen) THEN
      RAISE EXCEPTION 'duplicate tab_id,symbol';
    END IF;
    v_seen := array_append(v_seen, v_key);

    v_count := COALESCE((v_tab_counts ->> v_tab)::integer, 0) + 1;
    IF v_count > 20 THEN
      RAISE EXCEPTION 'tab exceeds 20-row limit';
    END IF;
    v_tab_counts := jsonb_set(v_tab_counts, ARRAY[v_tab], to_jsonb(v_count));

    IF v_provider_min IS NULL OR v_provider_as_of < v_provider_min THEN
      v_provider_min := v_provider_as_of;
    END IF;
    IF v_provider_max IS NULL OR v_provider_as_of > v_provider_max THEN
      v_provider_max := v_provider_as_of;
    END IF;
  END LOOP;

  IF v_len = 0 THEN
    v_status := 'empty';
    v_provider_min := NULL;
    v_provider_max := NULL;
  ELSE
    v_status := 'available';
  END IF;

  DELETE FROM public.screener_results
  WHERE tab_id = ANY (v_managed_tabs);

  IF v_len > 0 THEN
    INSERT INTO public.screener_results (
      tab_id,
      symbol,
      company_name,
      price,
      change_percent,
      volume,
      avg_volume,
      rvol,
      float_shares,
      gap_percent,
      high_52w,
      low_52w,
      market_cap,
      prior_session_volume,
      volume_ratio_prior_session,
      day_high,
      day_low,
      range_event,
      provider_as_of,
      sync_run_id,
      updated_at
    )
    SELECT
      (e ->> 'tab_id'),
      upper(trim(e ->> 'symbol')),
      NULLIF(e ->> 'company_name', ''),
      NULLIF(e ->> 'price', '')::numeric,
      NULLIF(e ->> 'change_percent', '')::numeric,
      (e ->> 'volume')::numeric,
      NULL,
      NULL,
      NULL,
      NULLIF(e ->> 'gap_percent', '')::numeric,
      NULLIF(e ->> 'high_52w', '')::numeric,
      NULLIF(e ->> 'low_52w', '')::numeric,
      NULL,
      NULLIF(e ->> 'prior_session_volume', '')::numeric,
      NULLIF(e ->> 'volume_ratio_prior_session', '')::numeric,
      NULLIF(e ->> 'day_high', '')::numeric,
      NULLIF(e ->> 'day_low', '')::numeric,
      NULLIF(e ->> 'range_event', ''),
      (e ->> 'provider_as_of')::timestamptz,
      p_sync_run_id,
      p_synced_at
    FROM jsonb_array_elements(p_rows) AS e;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted <> v_len THEN
      RAISE EXCEPTION 'insert count mismatch';
    END IF;
  ELSE
    v_inserted := 0;
  END IF;

  INSERT INTO public.screener_feed_state (
    state_key,
    sync_run_id,
    status,
    synced_at,
    provider_as_of_min,
    provider_as_of_max,
    rows_inserted,
    tab_counts,
    nhl_baseline_status,
    updated_at
  ) VALUES (
    'current',
    p_sync_run_id,
    v_status,
    p_synced_at,
    v_provider_min,
    v_provider_max,
    v_inserted,
    v_tab_counts,
    v_nhl_status,
    p_synced_at
  )
  ON CONFLICT (state_key) DO UPDATE SET
    sync_run_id = EXCLUDED.sync_run_id,
    status = EXCLUDED.status,
    synced_at = EXCLUDED.synced_at,
    provider_as_of_min = EXCLUDED.provider_as_of_min,
    provider_as_of_max = EXCLUDED.provider_as_of_max,
    rows_inserted = EXCLUDED.rows_inserted,
    tab_counts = EXCLUDED.tab_counts,
    nhl_baseline_status = EXCLUDED.nhl_baseline_status,
    updated_at = EXCLUDED.updated_at;

  RETURN v_inserted;
END;
$fn$;

REVOKE ALL ON FUNCTION public.replace_screener_results_generation_v1(jsonb, uuid, timestamptz, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_screener_results_generation_v1(jsonb, uuid, timestamptz, text)
  FROM anon;
REVOKE ALL ON FUNCTION public.replace_screener_results_generation_v1(jsonb, uuid, timestamptz, text)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.replace_screener_results_generation_v1(jsonb, uuid, timestamptz, text)
  TO service_role;