-- Day Trade Radar V2.2: second-level momentum board, archive, and consumer lease.
-- Atomic generation replacement. Public SELECT on feed_state + board; service-only writes.
-- Archive and lease are service-role only.

CREATE TABLE IF NOT EXISTS public.radar_v22_feed_state (
  state_key text PRIMARY KEY,
  generation_id uuid NULL,
  status text NOT NULL,
  session_date date NULL,
  synced_at timestamptz NOT NULL,
  provider_as_of_min timestamptz NULL,
  provider_as_of_max timestamptz NULL,
  last_provider_event_at timestamptz NULL,
  symbol_count integer NOT NULL DEFAULT 0,
  feed_stale boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL,
  CONSTRAINT radar_v22_feed_state_key_current CHECK (state_key = 'current'),
  CONSTRAINT radar_v22_feed_state_status_check
    CHECK (status IN ('available', 'empty', 'stale')),
  CONSTRAINT radar_v22_feed_state_count_check
    CHECK (symbol_count >= 0 AND symbol_count <= 20)
);

CREATE TABLE IF NOT EXISTS public.radar_v22_board (
  generation_id uuid NOT NULL,
  rank integer NOT NULL,
  symbol text NOT NULL,
  company_name text NULL,
  lifecycle text NOT NULL,
  signal_status text NOT NULL,
  price numeric NOT NULL,
  change_percent numeric NOT NULL,
  volume numeric NOT NULL,
  prior_session_volume numeric NOT NULL,
  volume_ratio_prior_session numeric NOT NULL,
  day_high numeric NOT NULL,
  day_low numeric NOT NULL,
  rolling_volume_5s numeric NOT NULL,
  rolling_volume_15s numeric NOT NULL,
  rolling_volume_60s numeric NOT NULL,
  rolling_dollar_volume_60s numeric NOT NULL,
  acceleration_5m numeric NULL,
  session_vwap numeric NULL,
  peak_volume_15s numeric NULL,
  provider_as_of timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (generation_id, rank),
  CONSTRAINT radar_v22_board_rank_check CHECK (rank >= 1 AND rank <= 20),
  CONSTRAINT radar_v22_board_symbol_check
    CHECK (symbol ~ '^[A-Z][A-Z0-9.\-]*$' AND char_length(symbol) <= 12),
  CONSTRAINT radar_v22_board_lifecycle_check
    CHECK (lifecycle IN ('DETECTED', 'CONFIRMING', 'ACTIVE', 'REACTIVATED', 'COOLING')),
  CONSTRAINT radar_v22_board_signal_check
    CHECK (signal_status IN ('BUILDING', 'CONFIRMING', 'EXPLOSIVE', 'REACTIVATED', 'COOLING', 'STALE')),
  CONSTRAINT radar_v22_board_prices_positive
    CHECK (price > 0 AND volume > 0 AND prior_session_volume > 0
      AND volume_ratio_prior_session > 0 AND day_high > 0 AND day_low > 0
      AND day_low <= day_high),
  CONSTRAINT radar_v22_board_rolling_nonneg
    CHECK (rolling_volume_5s >= 0 AND rolling_volume_15s >= 0
      AND rolling_volume_60s >= 0 AND rolling_dollar_volume_60s >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS radar_v22_board_generation_symbol_uidx
  ON public.radar_v22_board (generation_id, symbol);

CREATE TABLE IF NOT EXISTS public.radar_v22_archive (
  session_date date NOT NULL,
  symbol text NOT NULL,
  lifecycle text NOT NULL,
  archived_at timestamptz NOT NULL,
  generation_id uuid NULL,
  rolling_volume_60s numeric NULL,
  rolling_volume_15s numeric NULL,
  session_volume numeric NULL,
  peak_volume_15s numeric NULL,
  provider_as_of timestamptz NULL,
  PRIMARY KEY (session_date, symbol),
  CONSTRAINT radar_v22_archive_symbol_check
    CHECK (symbol ~ '^[A-Z][A-Z0-9.\-]*$' AND char_length(symbol) <= 12),
  CONSTRAINT radar_v22_archive_lifecycle_check CHECK (lifecycle = 'ARCHIVED')
);

CREATE TABLE IF NOT EXISTS public.radar_v22_lease (
  lease_key text PRIMARY KEY,
  holder_id text NOT NULL,
  heartbeat_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CONSTRAINT radar_v22_lease_key_check CHECK (lease_key = 'radar_v22')
);

ALTER TABLE public.radar_v22_feed_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_v22_board ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_v22_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_v22_lease ENABLE ROW LEVEL SECURITY;

DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'radar_v22_feed_state'
      AND policyname = 'Radar V2.2 feed state is publicly readable'
  ) THEN
    CREATE POLICY "Radar V2.2 feed state is publicly readable"
      ON public.radar_v22_feed_state FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'radar_v22_board'
      AND policyname = 'Radar V2.2 board is publicly readable'
  ) THEN
    CREATE POLICY "Radar V2.2 board is publicly readable"
      ON public.radar_v22_board FOR SELECT USING (true);
  END IF;
END;
$policy$;

REVOKE ALL ON TABLE public.radar_v22_feed_state FROM PUBLIC;
GRANT SELECT ON TABLE public.radar_v22_feed_state TO anon, authenticated;
GRANT ALL ON TABLE public.radar_v22_feed_state TO service_role;

REVOKE ALL ON TABLE public.radar_v22_board FROM PUBLIC;
GRANT SELECT ON TABLE public.radar_v22_board TO anon, authenticated;
GRANT ALL ON TABLE public.radar_v22_board TO service_role;

REVOKE ALL ON TABLE public.radar_v22_archive FROM PUBLIC;
GRANT ALL ON TABLE public.radar_v22_archive TO service_role;

REVOKE ALL ON TABLE public.radar_v22_lease FROM PUBLIC;
GRANT ALL ON TABLE public.radar_v22_lease TO service_role;

DO $realtime$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'radar_v22_feed_state'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.radar_v22_feed_state';
  END IF;
END;
$realtime$;

CREATE OR REPLACE FUNCTION public.replace_radar_v22_generation_v1(
  p_generation_id uuid,
  p_rows jsonb,
  p_archive jsonb,
  p_session_date date,
  p_synced_at timestamptz,
  p_status text,
  p_last_provider_event_at timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_len integer;
  v_elem jsonb;
  v_rank integer;
  v_symbol text;
  v_seen text[] := ARRAY[]::text[];
  v_ranks integer[] := ARRAY[]::integer[];
  v_price numeric;
  v_volume numeric;
  v_prior numeric;
  v_ratio numeric;
  v_high numeric;
  v_low numeric;
  v_vol5 numeric;
  v_vol15 numeric;
  v_vol60 numeric;
  v_dollar numeric;
  v_accel numeric;
  v_lifecycle text;
  v_signal text;
  v_provider timestamptz;
  v_provider_min timestamptz := NULL;
  v_provider_max timestamptz := NULL;
  v_inserted integer := 0;
  v_now timestamptz := clock_timestamp();
  v_i integer;
  v_arch jsonb;
BEGIN
  IF p_generation_id IS NULL THEN RAISE EXCEPTION 'generation_id required'; END IF;
  IF p_session_date IS NULL THEN RAISE EXCEPTION 'session_date required'; END IF;
  IF p_synced_at IS NULL THEN RAISE EXCEPTION 'synced_at required'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('available', 'empty', 'stale') THEN
    RAISE EXCEPTION 'invalid status';
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
  IF p_archive IS NULL OR jsonb_typeof(p_archive) <> 'array' THEN
    RAISE EXCEPTION 'archive must be a JSON array';
  END IF;

  v_len := jsonb_array_length(p_rows);
  IF v_len > 20 THEN RAISE EXCEPTION 'rows exceed board cap of 20'; END IF;
  IF p_status = 'empty' AND v_len <> 0 THEN RAISE EXCEPTION 'empty status requires zero rows'; END IF;
  IF p_status = 'available' AND v_len = 0 THEN RAISE EXCEPTION 'available status requires rows'; END IF;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    IF jsonb_typeof(v_elem) <> 'object' THEN RAISE EXCEPTION 'row must be an object'; END IF;
    IF (v_elem ->> 'generation_id') IS DISTINCT FROM p_generation_id::text THEN
      RAISE EXCEPTION 'generation_id mismatch';
    END IF;
    BEGIN
      v_rank := (v_elem ->> 'rank')::integer;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid rank';
    END;
    IF v_rank IS NULL OR v_rank < 1 OR v_rank > 20 THEN RAISE EXCEPTION 'invalid rank'; END IF;
    IF v_rank = ANY (v_ranks) THEN RAISE EXCEPTION 'duplicate rank'; END IF;
    v_ranks := array_append(v_ranks, v_rank);

    v_symbol := upper(trim(COALESCE(v_elem ->> 'symbol', '')));
    IF v_symbol = '' OR char_length(v_symbol) > 12 OR v_symbol !~ '^[A-Z][A-Z0-9.\-]*$' THEN
      RAISE EXCEPTION 'invalid symbol';
    END IF;
    IF v_symbol = ANY (v_seen) THEN RAISE EXCEPTION 'duplicate symbol'; END IF;
    v_seen := array_append(v_seen, v_symbol);

    v_lifecycle := v_elem ->> 'lifecycle';
    IF v_lifecycle IS NULL OR v_lifecycle NOT IN ('DETECTED', 'CONFIRMING', 'ACTIVE', 'REACTIVATED', 'COOLING') THEN
      RAISE EXCEPTION 'invalid lifecycle';
    END IF;
    v_signal := v_elem ->> 'signal_status';
    IF v_signal IS NULL OR v_signal NOT IN ('BUILDING', 'CONFIRMING', 'EXPLOSIVE', 'REACTIVATED', 'COOLING', 'STALE') THEN
      RAISE EXCEPTION 'invalid signal_status';
    END IF;

    BEGIN
      v_price := (v_elem ->> 'price')::numeric;
      v_volume := (v_elem ->> 'volume')::numeric;
      v_prior := (v_elem ->> 'prior_session_volume')::numeric;
      v_ratio := (v_elem ->> 'volume_ratio_prior_session')::numeric;
      v_high := (v_elem ->> 'day_high')::numeric;
      v_low := (v_elem ->> 'day_low')::numeric;
      v_vol5 := (v_elem ->> 'rolling_volume_5s')::numeric;
      v_vol15 := (v_elem ->> 'rolling_volume_15s')::numeric;
      v_vol60 := (v_elem ->> 'rolling_volume_60s')::numeric;
      v_dollar := (v_elem ->> 'rolling_dollar_volume_60s')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid numeric fields';
    END;
    IF v_price IS NULL OR v_price <= 0 OR v_volume IS NULL OR v_volume <= 0 THEN
      RAISE EXCEPTION 'nonpositive price or volume';
    END IF;
    IF v_prior IS NULL OR v_prior <= 0 OR v_ratio IS NULL OR v_ratio <= 0 THEN
      RAISE EXCEPTION 'nonpositive prior volume';
    END IF;
    IF v_high IS NULL OR v_low IS NULL OR v_high <= 0 OR v_low <= 0 OR v_low > v_high THEN
      RAISE EXCEPTION 'invalid day range';
    END IF;
    IF v_vol5 IS NULL OR v_vol5 < 0 OR v_vol15 IS NULL OR v_vol15 < 0
       OR v_vol60 IS NULL OR v_vol60 < 0 OR v_dollar IS NULL OR v_dollar < 0 THEN
      RAISE EXCEPTION 'invalid rolling volumes';
    END IF;
    IF (v_elem ->> 'acceleration_5m') IS NOT NULL THEN
      BEGIN
        v_accel := (v_elem ->> 'acceleration_5m')::numeric;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'invalid acceleration';
      END;
      IF v_accel IS NULL OR NOT (v_accel > '-Infinity'::numeric AND v_accel < 'Infinity'::numeric) THEN
        RAISE EXCEPTION 'invalid acceleration';
      END IF;
    END IF;
    IF (v_elem ->> 'todaysChangePerc') IS NOT NULL THEN
      RAISE EXCEPTION 'todaysChangePerc forbidden';
    END IF;

    BEGIN
      v_provider := (v_elem ->> 'provider_as_of')::timestamptz;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid provider_as_of';
    END;
    IF v_provider IS NULL THEN RAISE EXCEPTION 'missing provider_as_of'; END IF;
    IF v_provider_min IS NULL OR v_provider < v_provider_min THEN
      v_provider_min := v_provider;
    END IF;
    IF v_provider_max IS NULL OR v_provider > v_provider_max THEN
      v_provider_max := v_provider;
    END IF;
  END LOOP;

  IF v_len > 0 THEN
    v_ranks := ARRAY(SELECT unnest(v_ranks) ORDER BY 1);
    FOR v_i IN 1..v_len LOOP
      IF v_ranks[v_i] <> v_i THEN RAISE EXCEPTION 'ranks must be contiguous 1..n'; END IF;
    END LOOP;
  ELSE
    v_provider_min := NULL;
    v_provider_max := NULL;
  END IF;

  DELETE FROM public.radar_v22_board;

  IF v_len > 0 THEN
    INSERT INTO public.radar_v22_board (
      generation_id, rank, symbol, company_name, lifecycle, signal_status,
      price, change_percent, volume, prior_session_volume, volume_ratio_prior_session,
      day_high, day_low, rolling_volume_5s, rolling_volume_15s, rolling_volume_60s,
      rolling_dollar_volume_60s, acceleration_5m, session_vwap, peak_volume_15s,
      provider_as_of, updated_at
    )
    SELECT
      p_generation_id,
      (e ->> 'rank')::integer,
      upper(trim(e ->> 'symbol')),
      NULLIF(e ->> 'company_name', ''),
      e ->> 'lifecycle',
      e ->> 'signal_status',
      (e ->> 'price')::numeric,
      (e ->> 'change_percent')::numeric,
      (e ->> 'volume')::numeric,
      (e ->> 'prior_session_volume')::numeric,
      (e ->> 'volume_ratio_prior_session')::numeric,
      (e ->> 'day_high')::numeric,
      (e ->> 'day_low')::numeric,
      (e ->> 'rolling_volume_5s')::numeric,
      (e ->> 'rolling_volume_15s')::numeric,
      (e ->> 'rolling_volume_60s')::numeric,
      (e ->> 'rolling_dollar_volume_60s')::numeric,
      NULLIF(e ->> 'acceleration_5m', '')::numeric,
      NULLIF(e ->> 'session_vwap', '')::numeric,
      NULLIF(e ->> 'peak_volume_15s', '')::numeric,
      (e ->> 'provider_as_of')::timestamptz,
      p_synced_at
    FROM jsonb_array_elements(p_rows) AS e;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted <> v_len THEN RAISE EXCEPTION 'insert count mismatch'; END IF;
  END IF;

  FOR v_arch IN SELECT value FROM jsonb_array_elements(p_archive)
  LOOP
    IF jsonb_typeof(v_arch) <> 'object' THEN RAISE EXCEPTION 'archive row must be an object'; END IF;
    v_symbol := upper(trim(COALESCE(v_arch ->> 'symbol', '')));
    IF v_symbol = '' OR char_length(v_symbol) > 12 OR v_symbol !~ '^[A-Z][A-Z0-9.\-]*$' THEN
      RAISE EXCEPTION 'invalid archive symbol';
    END IF;
    IF (v_arch ->> 'lifecycle') IS DISTINCT FROM 'ARCHIVED' THEN
      RAISE EXCEPTION 'invalid archive lifecycle';
    END IF;
    INSERT INTO public.radar_v22_archive (
      session_date, symbol, lifecycle, archived_at, generation_id,
      rolling_volume_60s, rolling_volume_15s, session_volume, peak_volume_15s, provider_as_of
    ) VALUES (
      p_session_date,
      v_symbol,
      'ARCHIVED',
      COALESCE((v_arch ->> 'archived_at')::timestamptz, p_synced_at),
      p_generation_id,
      NULLIF(v_arch ->> 'rolling_volume_60s', '')::numeric,
      NULLIF(v_arch ->> 'rolling_volume_15s', '')::numeric,
      NULLIF(v_arch ->> 'session_volume', '')::numeric,
      NULLIF(v_arch ->> 'peak_volume_15s', '')::numeric,
      NULLIF(v_arch ->> 'provider_as_of', '')::timestamptz
    )
    ON CONFLICT (session_date, symbol) DO UPDATE SET
      archived_at = EXCLUDED.archived_at,
      generation_id = EXCLUDED.generation_id,
      rolling_volume_60s = EXCLUDED.rolling_volume_60s,
      rolling_volume_15s = EXCLUDED.rolling_volume_15s,
      session_volume = EXCLUDED.session_volume,
      peak_volume_15s = EXCLUDED.peak_volume_15s,
      provider_as_of = EXCLUDED.provider_as_of;
  END LOOP;

  INSERT INTO public.radar_v22_feed_state (
    state_key, generation_id, status, session_date, synced_at,
    provider_as_of_min, provider_as_of_max, last_provider_event_at,
    symbol_count, feed_stale, updated_at
  ) VALUES (
    'current',
    p_generation_id,
    p_status,
    p_session_date,
    p_synced_at,
    v_provider_min,
    v_provider_max,
    p_last_provider_event_at,
    v_inserted,
    p_status = 'stale',
    p_synced_at
  )
  ON CONFLICT (state_key) DO UPDATE SET
    generation_id = EXCLUDED.generation_id,
    status = EXCLUDED.status,
    session_date = EXCLUDED.session_date,
    synced_at = EXCLUDED.synced_at,
    provider_as_of_min = EXCLUDED.provider_as_of_min,
    provider_as_of_max = EXCLUDED.provider_as_of_max,
    last_provider_event_at = EXCLUDED.last_provider_event_at,
    symbol_count = EXCLUDED.symbol_count,
    feed_stale = EXCLUDED.feed_stale,
    updated_at = EXCLUDED.updated_at;

  RETURN v_inserted;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.set_radar_v22_feed_status_v1(
  p_status text,
  p_last_provider_event_at timestamptz,
  p_synced_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('available', 'empty', 'stale') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  IF p_synced_at IS NULL THEN RAISE EXCEPTION 'synced_at required'; END IF;
  UPDATE public.radar_v22_feed_state
  SET
    status = CASE
      WHEN p_status = 'stale' AND radar_v22_feed_state.symbol_count > 0 THEN 'stale'
      WHEN p_status = 'stale' THEN radar_v22_feed_state.status
      ELSE p_status
    END,
    feed_stale = (p_status = 'stale'),
    last_provider_event_at = COALESCE(p_last_provider_event_at, radar_v22_feed_state.last_provider_event_at),
    updated_at = p_synced_at
  WHERE state_key = 'current';
END;
$fn$;

CREATE OR REPLACE FUNCTION public.try_acquire_radar_v22_lease_v1(
  p_lease_key text,
  p_holder_id text,
  p_ttl_ms integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_ttl integer := GREATEST(1000, LEAST(COALESCE(p_ttl_ms, 15000), 60000));
  v_existing public.radar_v22_lease%ROWTYPE;
BEGIN
  IF p_lease_key IS DISTINCT FROM 'radar_v22' THEN RAISE EXCEPTION 'invalid lease key'; END IF;
  IF p_holder_id IS NULL OR length(trim(p_holder_id)) = 0 THEN RAISE EXCEPTION 'holder required'; END IF;

  SELECT * INTO v_existing FROM public.radar_v22_lease WHERE lease_key = p_lease_key FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.radar_v22_lease (lease_key, holder_id, heartbeat_at, expires_at)
    VALUES (p_lease_key, p_holder_id, v_now, v_now + make_interval(secs => v_ttl / 1000.0));
    RETURN true;
  END IF;
  IF v_existing.holder_id = p_holder_id OR v_existing.expires_at <= v_now THEN
    UPDATE public.radar_v22_lease
    SET holder_id = p_holder_id,
        heartbeat_at = v_now,
        expires_at = v_now + make_interval(secs => v_ttl / 1000.0)
    WHERE lease_key = p_lease_key;
    RETURN true;
  END IF;
  RETURN false;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.heartbeat_radar_v22_lease_v1(
  p_lease_key text,
  p_holder_id text,
  p_ttl_ms integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_ttl integer := GREATEST(1000, LEAST(COALESCE(p_ttl_ms, 15000), 60000));
  v_updated integer;
BEGIN
  IF p_lease_key IS DISTINCT FROM 'radar_v22' THEN RAISE EXCEPTION 'invalid lease key'; END IF;
  UPDATE public.radar_v22_lease
  SET heartbeat_at = v_now,
      expires_at = v_now + make_interval(secs => v_ttl / 1000.0)
  WHERE lease_key = p_lease_key AND holder_id = p_holder_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.release_radar_v22_lease_v1(
  p_lease_key text,
  p_holder_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  DELETE FROM public.radar_v22_lease
  WHERE lease_key = p_lease_key AND holder_id = p_holder_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.replace_radar_v22_generation_v1(uuid, jsonb, jsonb, date, timestamptz, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_radar_v22_generation_v1(uuid, jsonb, jsonb, date, timestamptz, text, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_radar_v22_generation_v1(uuid, jsonb, jsonb, date, timestamptz, text, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.set_radar_v22_feed_status_v1(text, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_radar_v22_feed_status_v1(text, timestamptz, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_radar_v22_feed_status_v1(text, timestamptz, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.try_acquire_radar_v22_lease_v1(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.try_acquire_radar_v22_lease_v1(text, text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_acquire_radar_v22_lease_v1(text, text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.heartbeat_radar_v22_lease_v1(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.heartbeat_radar_v22_lease_v1(text, text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_radar_v22_lease_v1(text, text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.release_radar_v22_lease_v1(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_radar_v22_lease_v1(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_radar_v22_lease_v1(text, text) TO service_role;