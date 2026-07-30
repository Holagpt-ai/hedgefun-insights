-- SCREENERS P1-R3: honest prior-session volume ratio + day range fields.
-- Forward-only. Does not edit the P1-R2 migration.
-- Replaces replace_screener_results_generation_v1 in place while preserving
-- every P1-R2 atomicity, freshness, feed-state and privilege guarantee.

ALTER TABLE public.screener_results
  ADD COLUMN IF NOT EXISTS prior_session_volume numeric,
  ADD COLUMN IF NOT EXISTS volume_ratio_prior_session numeric,
  ADD COLUMN IF NOT EXISTS day_high numeric,
  ADD COLUMN IF NOT EXISTS day_low numeric;

CREATE OR REPLACE FUNCTION public.replace_screener_results_generation_v1(
  p_rows jsonb,
  p_sync_run_id uuid,
  p_synced_at timestamptz
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
    'unusual_volume'
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
  v_provider_as_of timestamptz;
  v_seen text[] := ARRAY[]::text[];
  v_key text;
  v_tab_counts jsonb;
  v_count integer;
  v_inserted integer := 0;
  v_provider_min timestamptz := NULL;
  v_provider_max timestamptz := NULL;
  v_status text;
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
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'rows must be a JSON array';
  END IF;

  v_len := jsonb_array_length(p_rows);
  IF v_len > 100 THEN
    RAISE EXCEPTION 'rows exceed total limit of 100';
  END IF;

  v_tab_counts := jsonb_build_object(
    'day_trade_radar', 0,
    'gappers', 0,
    'volume_spikes', 0,
    'gainers_losers', 0,
    'unusual_volume', 0,
    'new_highs_lows', 0
  );

  -- Validate every element before any mutation.
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

    -- Legacy misleading fields must remain null in new generations.
    IF (v_elem->>'rvol') IS NOT NULL THEN
      RAISE EXCEPTION 'legacy rvol must be null';
    END IF;
    IF (v_elem->>'avg_volume') IS NOT NULL THEN
      RAISE EXCEPTION 'legacy avg_volume must be null';
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

  -- Single transaction body: delete → insert → upsert feed state.
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
      NULL, -- legacy avg_volume always null
      NULL, -- legacy rvol always null
      NULLIF(e ->> 'float_shares', '')::numeric,
      NULLIF(e ->> 'gap_percent', '')::numeric,
      NULLIF(e ->> 'high_52w', '')::numeric,
      NULLIF(e ->> 'low_52w', '')::numeric,
      NULLIF(e ->> 'market_cap', '')::numeric,
      NULLIF(e ->> 'prior_session_volume', '')::numeric,
      NULLIF(e ->> 'volume_ratio_prior_session', '')::numeric,
      NULLIF(e ->> 'day_high', '')::numeric,
      NULLIF(e ->> 'day_low', '')::numeric,
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
    updated_at = EXCLUDED.updated_at;

  RETURN v_inserted;
END;
$fn$;

REVOKE ALL ON FUNCTION public.replace_screener_results_generation_v1(jsonb, uuid, timestamptz)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_screener_results_generation_v1(jsonb, uuid, timestamptz)
  FROM anon;
REVOKE ALL ON FUNCTION public.replace_screener_results_generation_v1(jsonb, uuid, timestamptz)
  FROM authenticated;

GRANT EXECUTE ON FUNCTION public.replace_screener_results_generation_v1(jsonb, uuid, timestamptz)
  TO service_role;