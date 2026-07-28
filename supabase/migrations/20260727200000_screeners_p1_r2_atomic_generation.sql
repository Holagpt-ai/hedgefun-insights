-- SCREENERS P1-R2: atomic generation replacement + provider freshness columns.
-- Forward-only. Does not edit historical migrations.

ALTER TABLE public.screener_results
  ADD COLUMN IF NOT EXISTS provider_as_of timestamptz,
  ADD COLUMN IF NOT EXISTS sync_run_id uuid;

-- Guarantee uniqueness for tab/symbol replacement semantics.
CREATE UNIQUE INDEX IF NOT EXISTS screener_results_tab_id_symbol_uidx
  ON public.screener_results (tab_id, symbol);

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
  v_tab_counts jsonb := '{}'::jsonb;
  v_count integer;
  v_inserted integer := 0;
BEGIN
  IF p_sync_run_id IS NULL THEN
    RAISE EXCEPTION 'sync_run_id required';
  END IF;
  IF p_synced_at IS NULL THEN
    RAISE EXCEPTION 'synced_at required';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'rows must be a JSON array';
  END IF;

  v_len := jsonb_array_length(p_rows);
  IF v_len > 100 THEN
    RAISE EXCEPTION 'rows exceed total limit of 100';
  END IF;

  -- Validate every element before mutating.
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
  END LOOP;

  -- Single transaction: delete managed tabs, then insert validated rows.
  DELETE FROM public.screener_results
  WHERE tab_id = ANY (v_managed_tabs);

  IF v_len = 0 THEN
    RETURN 0;
  END IF;

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
