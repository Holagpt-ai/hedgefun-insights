-- SCREENERS P1-R2: atomic generation replacement + provider freshness + feed state.
-- Forward-only amend of the unapplied migration. Do not edit historical migrations.

ALTER TABLE public.screener_results
  ADD COLUMN IF NOT EXISTS provider_as_of timestamptz,
  ADD COLUMN IF NOT EXISTS sync_run_id uuid;

-- Guarantee uniqueness for tab/symbol replacement semantics.
CREATE UNIQUE INDEX IF NOT EXISTS screener_results_tab_id_symbol_uidx
  ON public.screener_results (tab_id, symbol);

-- Persistent feed state for honest available/empty generations.
CREATE TABLE IF NOT EXISTS public.screener_feed_state (
  state_key text PRIMARY KEY,
  sync_run_id uuid NOT NULL,
  status text NOT NULL,
  synced_at timestamptz NOT NULL,
  provider_as_of_min timestamptz NULL,
  provider_as_of_max timestamptz NULL,
  rows_inserted integer NOT NULL,
  tab_counts jsonb NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT screener_feed_state_key_current CHECK (state_key = 'current'),
  CONSTRAINT screener_feed_state_status_check CHECK (status IN ('available', 'empty')),
  CONSTRAINT screener_feed_state_rows_nonneg CHECK (rows_inserted >= 0)
);

ALTER TABLE public.screener_feed_state ENABLE ROW LEVEL SECURITY;

DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'screener_feed_state'
      AND policyname = 'Screener feed state is publicly readable'
  ) THEN
    CREATE POLICY "Screener feed state is publicly readable"
      ON public.screener_feed_state
      FOR SELECT
      USING (true);
  END IF;
END;
$policy$;

REVOKE ALL ON TABLE public.screener_feed_state FROM PUBLIC;
GRANT SELECT ON TABLE public.screener_feed_state TO anon, authenticated;
GRANT ALL ON TABLE public.screener_feed_state TO service_role;

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
  v_len integer;
  v_elem jsonb;
  v_tab text;
  v_symbol text;
  v_volume numeric;
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
  -- Reject clearly invalid / implausible generation clocks and future skew.
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
      NULLIF(e ->> 'avg_volume', '')::numeric,
      NULLIF(e ->> 'rvol', '')::numeric,
      NULLIF(e ->> 'float_shares', '')::numeric,
      NULLIF(e ->> 'gap_percent', '')::numeric,
      NULLIF(e ->> 'high_52w', '')::numeric,
      NULLIF(e ->> 'low_52w', '')::numeric,
      NULLIF(e ->> 'market_cap', '')::numeric,
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