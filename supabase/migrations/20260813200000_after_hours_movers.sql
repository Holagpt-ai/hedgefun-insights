-- Atomic full-market after-hours movers. Service-written, publicly readable.

CREATE TABLE IF NOT EXISTS public.after_hours_feed_state (
  state_key text PRIMARY KEY,
  generation_id uuid NOT NULL,
  status text NOT NULL,
  session_date date NOT NULL,
  synced_at timestamptz NOT NULL,
  provider_as_of_min timestamptz NULL,
  provider_as_of_max timestamptz NULL,
  gainer_count integer NOT NULL,
  loser_count integer NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT after_hours_feed_state_key_current CHECK (state_key = 'current'),
  CONSTRAINT after_hours_feed_state_status_check CHECK (status IN ('available', 'empty')),
  CONSTRAINT after_hours_feed_state_counts_nonneg CHECK (gainer_count >= 0 AND loser_count >= 0),
  CONSTRAINT after_hours_feed_state_counts_cap CHECK (gainer_count <= 20 AND loser_count <= 20)
);

CREATE TABLE IF NOT EXISTS public.after_hours_mover_results (
  generation_id uuid NOT NULL,
  side text NOT NULL,
  rank integer NOT NULL,
  symbol text NOT NULL,
  company_name text NULL,
  extended_last numeric NOT NULL,
  regular_close numeric NOT NULL,
  change_percent numeric NOT NULL,
  change_amount numeric NOT NULL,
  volume numeric NULL,
  observation_source text NOT NULL,
  provider_as_of timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (generation_id, side, rank),
  CONSTRAINT after_hours_mover_results_side_check CHECK (side IN ('gainer', 'loser')),
  CONSTRAINT after_hours_mover_results_rank_check CHECK (rank >= 1 AND rank <= 20),
  CONSTRAINT after_hours_mover_results_symbol_check
    CHECK (symbol ~ '^[A-Z][A-Z0-9.\-]*$' AND char_length(symbol) <= 12),
  CONSTRAINT after_hours_mover_results_prices_positive
    CHECK (extended_last > 0 AND regular_close > 0),
  CONSTRAINT after_hours_mover_results_change_nonzero CHECK (change_percent <> 0),
  CONSTRAINT after_hours_mover_results_source_check
    CHECK (observation_source IN ('lastTrade', 'min'))
);

CREATE UNIQUE INDEX IF NOT EXISTS after_hours_mover_results_gen_side_symbol_uidx
  ON public.after_hours_mover_results (generation_id, side, symbol);

ALTER TABLE public.after_hours_feed_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.after_hours_mover_results ENABLE ROW LEVEL SECURITY;

DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'after_hours_feed_state'
      AND policyname = 'After-hours feed state is publicly readable'
  ) THEN
    CREATE POLICY "After-hours feed state is publicly readable"
      ON public.after_hours_feed_state FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'after_hours_mover_results'
      AND policyname = 'After-hours mover results are publicly readable'
  ) THEN
    CREATE POLICY "After-hours mover results are publicly readable"
      ON public.after_hours_mover_results FOR SELECT USING (true);
  END IF;
END;
$policy$;

REVOKE ALL ON TABLE public.after_hours_feed_state FROM PUBLIC;
GRANT SELECT ON TABLE public.after_hours_feed_state TO anon, authenticated;
GRANT ALL ON TABLE public.after_hours_feed_state TO service_role;

REVOKE ALL ON TABLE public.after_hours_mover_results FROM PUBLIC;
GRANT SELECT ON TABLE public.after_hours_mover_results TO anon, authenticated;
GRANT ALL ON TABLE public.after_hours_mover_results TO service_role;

CREATE OR REPLACE FUNCTION public.replace_after_hours_generation_v1(
  p_generation_id uuid,
  p_rows jsonb,
  p_session_date date,
  p_synced_at timestamptz,
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
  v_side text;
  v_rank integer;
  v_symbol text;
  v_pct numeric;
  v_last numeric;
  v_close numeric;
  v_seen text[] := ARRAY[]::text[];
  v_gainer_ranks integer[] := ARRAY[]::integer[];
  v_loser_ranks integer[] := ARRAY[]::integer[];
  v_gainer_count integer := 0;
  v_loser_count integer := 0;
  v_provider_min timestamptz := NULL;
  v_provider_max timestamptz := NULL;
  v_provider_as_of timestamptz;
  v_inserted integer := 0;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_generation_id IS NULL THEN RAISE EXCEPTION 'generation_id required'; END IF;
  IF p_session_date IS NULL THEN RAISE EXCEPTION 'session_date required'; END IF;
  IF p_synced_at IS NULL THEN RAISE EXCEPTION 'synced_at required'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('available', 'empty') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  IF p_synced_at > v_now + interval '5 minutes' THEN
    RAISE EXCEPTION 'synced_at too far in the future';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'rows must be a JSON array';
  END IF;

  v_len := jsonb_array_length(p_rows);
  IF v_len > 40 THEN RAISE EXCEPTION 'rows exceed after-hours limit'; END IF;
  IF p_status = 'empty' AND v_len <> 0 THEN RAISE EXCEPTION 'empty status requires zero rows'; END IF;
  IF p_status = 'available' AND v_len = 0 THEN RAISE EXCEPTION 'available status requires rows'; END IF;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    IF jsonb_typeof(v_elem) <> 'object' THEN RAISE EXCEPTION 'row must be an object'; END IF;
    v_side := v_elem ->> 'side';
    IF v_side IS NULL OR v_side NOT IN ('gainer', 'loser') THEN RAISE EXCEPTION 'invalid side'; END IF;
    BEGIN
      v_rank := (v_elem ->> 'rank')::integer;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid rank';
    END;
    IF v_rank IS NULL OR v_rank < 1 OR v_rank > 20 THEN RAISE EXCEPTION 'invalid rank'; END IF;

    v_symbol := upper(trim(COALESCE(v_elem ->> 'symbol', '')));
    IF v_symbol = '' OR char_length(v_symbol) > 12 OR v_symbol !~ '^[A-Z][A-Z0-9.\-]*$' THEN
      RAISE EXCEPTION 'invalid symbol';
    END IF;
    IF (v_side || chr(1) || v_symbol) = ANY (v_seen) THEN RAISE EXCEPTION 'duplicate side,symbol'; END IF;
    v_seen := array_append(v_seen, v_side || chr(1) || v_symbol);

    BEGIN
      v_last := (v_elem ->> 'extended_last')::numeric;
      v_close := (v_elem ->> 'regular_close')::numeric;
      v_pct := (v_elem ->> 'change_percent')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid prices';
    END;
    IF v_last IS NULL OR v_close IS NULL OR v_last <= 0 OR v_close <= 0 THEN
      RAISE EXCEPTION 'invalid prices';
    END IF;
    IF v_pct IS NULL OR v_pct = 0 THEN RAISE EXCEPTION 'zero change excluded'; END IF;
    IF v_side = 'gainer' AND v_pct <= 0 THEN RAISE EXCEPTION 'gainer must be positive'; END IF;
    IF v_side = 'loser' AND v_pct >= 0 THEN RAISE EXCEPTION 'loser must be negative'; END IF;
    IF (v_elem ->> 'observation_source') NOT IN ('lastTrade', 'min') THEN
      RAISE EXCEPTION 'invalid observation_source';
    END IF;
    IF (v_elem ->> 'todaysChangePerc') IS NOT NULL THEN
      RAISE EXCEPTION 'todaysChangePerc forbidden';
    END IF;

    BEGIN
      v_provider_as_of := (v_elem ->> 'provider_as_of')::timestamptz;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid provider_as_of';
    END;
    IF v_provider_as_of IS NULL THEN RAISE EXCEPTION 'missing provider_as_of'; END IF;
    IF v_provider_min IS NULL OR v_provider_as_of < v_provider_min THEN
      v_provider_min := v_provider_as_of;
    END IF;
    IF v_provider_max IS NULL OR v_provider_as_of > v_provider_max THEN
      v_provider_max := v_provider_as_of;
    END IF;

    IF v_side = 'gainer' THEN
      IF v_rank = ANY (v_gainer_ranks) THEN RAISE EXCEPTION 'duplicate gainer rank'; END IF;
      v_gainer_ranks := array_append(v_gainer_ranks, v_rank);
      v_gainer_count := v_gainer_count + 1;
    ELSE
      IF v_rank = ANY (v_loser_ranks) THEN RAISE EXCEPTION 'duplicate loser rank'; END IF;
      v_loser_ranks := array_append(v_loser_ranks, v_rank);
      v_loser_count := v_loser_count + 1;
    END IF;
  END LOOP;

  IF v_gainer_count > 0 THEN
    FOR i IN 1..v_gainer_count LOOP
      IF NOT (i = ANY (v_gainer_ranks)) THEN RAISE EXCEPTION 'gainer ranks not contiguous'; END IF;
    END LOOP;
  END IF;
  IF v_loser_count > 0 THEN
    FOR i IN 1..v_loser_count LOOP
      IF NOT (i = ANY (v_loser_ranks)) THEN RAISE EXCEPTION 'loser ranks not contiguous'; END IF;
    END LOOP;
  END IF;

  DELETE FROM public.after_hours_mover_results;
  DELETE FROM public.after_hours_feed_state WHERE state_key = 'current';

  IF v_len > 0 THEN
    INSERT INTO public.after_hours_mover_results (
      generation_id, side, rank, symbol, company_name, extended_last, regular_close,
      change_percent, change_amount, volume, observation_source, provider_as_of, updated_at
    )
    SELECT
      p_generation_id,
      e ->> 'side',
      (e ->> 'rank')::integer,
      upper(trim(e ->> 'symbol')),
      NULLIF(e ->> 'company_name', ''),
      (e ->> 'extended_last')::numeric,
      (e ->> 'regular_close')::numeric,
      (e ->> 'change_percent')::numeric,
      (e ->> 'change_amount')::numeric,
      NULLIF(e ->> 'volume', '')::numeric,
      e ->> 'observation_source',
      (e ->> 'provider_as_of')::timestamptz,
      p_synced_at
    FROM jsonb_array_elements(p_rows) AS e;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted <> v_len THEN RAISE EXCEPTION 'insert count mismatch'; END IF;
  ELSE
    v_inserted := 0;
    v_provider_min := NULL;
    v_provider_max := NULL;
  END IF;

  INSERT INTO public.after_hours_feed_state (
    state_key, generation_id, status, session_date, synced_at,
    provider_as_of_min, provider_as_of_max, gainer_count, loser_count, updated_at
  ) VALUES (
    'current', p_generation_id, p_status, p_session_date, p_synced_at,
    v_provider_min, v_provider_max, v_gainer_count, v_loser_count, p_synced_at
  );

  RETURN v_inserted;
END;
$fn$;

REVOKE ALL ON FUNCTION public.replace_after_hours_generation_v1(uuid, jsonb, date, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_after_hours_generation_v1(uuid, jsonb, date, timestamptz, text) FROM anon;
REVOKE ALL ON FUNCTION public.replace_after_hours_generation_v1(uuid, jsonb, date, timestamptz, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.replace_after_hours_generation_v1(uuid, jsonb, date, timestamptz, text) TO service_role;
