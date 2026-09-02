-- Radar V2.2 Persistence V2: current candidate snapshot + discrete events.
-- Additive. Does NOT replace radar_v22_board / replace_radar_v22_generation_v1.
--
-- Write path remains: Fly worker → RADAR_WORKER_SECRET → radar-worker-bridge
-- → SECURITY DEFINER RPC (service_role). Fly has no service-role credentials.
--
-- Atomic visibility: one RPC deletes the current candidate set and inserts the
-- new generation, then upserts events ON CONFLICT DO NOTHING.
--
-- Generation fencing: v2_synced_at is the p_synced_at of the committed V2
-- generation. Replacement is serialized on radar_v22_feed_state WHERE
-- state_key='current' (SELECT FOR UPDATE) BEFORE any candidate DELETE.
-- Stale/conflicting generations return jsonb {applied:false, reason:stale_generation}
-- without throwing — not an infrastructure failure.
--
-- Event retention: 14 days via purge_radar_v22_events_v1. No cron is added in
-- this sprint; operators/scheduler should call the purge RPC later.
--
-- Rollback (do not apply in this sprint):
--   DROP FUNCTION public.replace_radar_v22_candidates_v1(...);
--   DROP FUNCTION public.purge_radar_v22_events_v1(integer);
--   DROP TABLE public.radar_v22_events;
--   DROP TABLE public.radar_v22_candidates;
--   ALTER TABLE public.radar_v22_feed_state
--     DROP COLUMN IF EXISTS session_kind,
--     DROP COLUMN IF EXISTS sentinel_enabled,
--     DROP COLUMN IF EXISTS candidate_count,
--     DROP COLUMN IF EXISTS v2_generation_id,
--     DROP COLUMN IF EXISTS last_receive_at,
--     DROP COLUMN IF EXISTS v2_synced_at;

ALTER TABLE public.radar_v22_feed_state
  ADD COLUMN IF NOT EXISTS session_kind text NULL,
  ADD COLUMN IF NOT EXISTS sentinel_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS candidate_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS v2_generation_id uuid NULL,
  ADD COLUMN IF NOT EXISTS last_receive_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS v2_synced_at timestamptz NULL;

COMMENT ON COLUMN public.radar_v22_feed_state.v2_synced_at IS
  'p_synced_at of the currently committed V2 candidate generation. Dedicated fence; not V1 updated_at/synced_at/last_receive_at.';

DO $feed_ck$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'radar_v22_feed_state_session_kind_check'
  ) THEN
    ALTER TABLE public.radar_v22_feed_state
      ADD CONSTRAINT radar_v22_feed_state_session_kind_check
      CHECK (
        session_kind IS NULL OR session_kind IN
          ('pre-market', 'market', 'after-hours', 'closed')
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'radar_v22_feed_state_candidate_count_check'
  ) THEN
    ALTER TABLE public.radar_v22_feed_state
      ADD CONSTRAINT radar_v22_feed_state_candidate_count_check
      CHECK (candidate_count >= 0 AND candidate_count <= 200);
  END IF;
END;
$feed_ck$;

CREATE TABLE IF NOT EXISTS public.radar_v22_candidates (
  symbol text NOT NULL,
  generation_id uuid NOT NULL,
  trading_date date NOT NULL,
  session_kind text NOT NULL,
  lifecycle text NOT NULL,
  signal_status text NOT NULL,
  last_price numeric NULL,
  last_price_at timestamptz NULL,
  move_15s_pct numeric NULL,
  move_60s_pct numeric NULL,
  volume_5s numeric NOT NULL,
  volume_15s numeric NOT NULL,
  volume_60s numeric NOT NULL,
  session_volume numeric NOT NULL,
  dollar_volume_60s numeric NOT NULL,
  acceleration_5m numeric NULL,
  session_high numeric NULL,
  session_low numeric NULL,
  distance_from_hod_pct numeric NULL,
  session_vwap numeric NULL,
  vwap_side text NOT NULL,
  geometry_partial boolean NOT NULL,
  vwap_partial boolean NOT NULL,
  last_new_hod_at timestamptz NULL,
  last_hod_attempt_at timestamptz NULL,
  last_hod_break_at timestamptz NULL,
  last_hod_reject_at timestamptz NULL,
  last_vwap_cross_at timestamptz NULL,
  last_vwap_reclaim_at timestamptz NULL,
  last_vwap_loss_at timestamptz NULL,
  freshness_class text NOT NULL,
  freshness_age_ms integer NULL,
  last_volume_burst_at timestamptz NULL,
  last_price_move_at timestamptz NULL,
  last_acceleration_at timestamptz NULL,
  promoted_at timestamptz NULL,
  lifecycle_entered_at timestamptz NULL,
  provider_as_of timestamptz NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (symbol),
  CONSTRAINT radar_v22_candidates_symbol_check
    CHECK (symbol ~ '^[A-Z][A-Z0-9.\-]*$' AND char_length(symbol) <= 12),
  CONSTRAINT radar_v22_candidates_session_kind_check
    CHECK (session_kind IN ('pre-market', 'market', 'after-hours', 'closed')),
  CONSTRAINT radar_v22_candidates_vwap_side_check
    CHECK (vwap_side IN ('above', 'below', 'unknown')),
  CONSTRAINT radar_v22_candidates_freshness_check
    CHECK (freshness_class IN ('fresh', 'active', 'cooling', 'stale', 'unknown')),
  CONSTRAINT radar_v22_candidates_rolling_nonneg
    CHECK (
      volume_5s >= 0 AND volume_15s >= 0 AND volume_60s >= 0
      AND session_volume >= 0 AND dollar_volume_60s >= 0
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS radar_v22_candidates_generation_symbol_uidx
  ON public.radar_v22_candidates (generation_id, symbol);

CREATE TABLE IF NOT EXISTS public.radar_v22_events (
  trading_date date NOT NULL,
  session_kind text NOT NULL,
  symbol text NOT NULL,
  event_type text NOT NULL,
  event_at timestamptz NOT NULL,
  generation_id uuid NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trading_date, session_kind, symbol, event_type, event_at),
  CONSTRAINT radar_v22_events_symbol_check
    CHECK (symbol ~ '^[A-Z][A-Z0-9.\-]*$' AND char_length(symbol) <= 12),
  CONSTRAINT radar_v22_events_session_kind_check
    CHECK (session_kind IN ('pre-market', 'market', 'after-hours', 'closed')),
  CONSTRAINT radar_v22_events_type_check
    CHECK (event_type IN (
      'PROMOTED', 'DETECTED', 'CONFIRMED', 'ACTIVE', 'COOLING', 'REACTIVATED',
      'ARCHIVED', 'NEW_HOD', 'HOD_BREAK', 'HOD_REJECTION',
      'VWAP_RECLAIM', 'VWAP_LOSS', 'SESSION_PM_RTH', 'SESSION_RTH_AH'
    ))
);

CREATE INDEX IF NOT EXISTS radar_v22_events_event_at_idx
  ON public.radar_v22_events (event_at);

ALTER TABLE public.radar_v22_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_v22_events ENABLE ROW LEVEL SECURITY;

DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'radar_v22_candidates'
      AND policyname = 'Radar V2.2 candidates are publicly readable'
  ) THEN
    CREATE POLICY "Radar V2.2 candidates are publicly readable"
      ON public.radar_v22_candidates FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'radar_v22_events'
      AND policyname = 'Radar V2.2 events are publicly readable'
  ) THEN
    CREATE POLICY "Radar V2.2 events are publicly readable"
      ON public.radar_v22_events FOR SELECT USING (true);
  END IF;
END;
$policy$;

REVOKE ALL ON TABLE public.radar_v22_candidates FROM PUBLIC;
GRANT SELECT ON TABLE public.radar_v22_candidates TO anon, authenticated;
GRANT ALL ON TABLE public.radar_v22_candidates TO service_role;

REVOKE ALL ON TABLE public.radar_v22_events FROM PUBLIC;
GRANT SELECT ON TABLE public.radar_v22_events TO anon, authenticated;
GRANT ALL ON TABLE public.radar_v22_events TO service_role;

CREATE OR REPLACE FUNCTION public.replace_radar_v22_candidates_v1(
  p_generation_id uuid,
  p_trading_date date,
  p_session_kind text,
  p_synced_at timestamptz,
  p_candidates jsonb,
  p_events jsonb,
  p_sentinel_enabled boolean,
  p_last_provider_event_at timestamptz,
  p_last_receive_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_len integer;
  v_elem jsonb;
  v_symbol text;
  v_seen text[] := ARRAY[]::text[];
  v_inserted integer := 0;
  v_now timestamptz := clock_timestamp();
  v_ev jsonb;
  v_type text;
  v_at timestamptz;
  v_existing_gen uuid;
  v_existing_synced timestamptz;
  v_existing_count integer;
BEGIN
  IF p_generation_id IS NULL THEN RAISE EXCEPTION 'generation_id required'; END IF;
  IF p_trading_date IS NULL THEN RAISE EXCEPTION 'trading_date required'; END IF;
  IF p_session_kind IS NULL OR p_session_kind NOT IN
       ('pre-market', 'market', 'after-hours', 'closed') THEN
    RAISE EXCEPTION 'invalid session_kind';
  END IF;
  IF p_synced_at IS NULL THEN RAISE EXCEPTION 'synced_at required'; END IF;
  IF p_synced_at < timestamptz '2000-01-01 00:00:00+00'
     OR p_synced_at > timestamptz '2100-01-01 00:00:00+00' THEN
    RAISE EXCEPTION 'synced_at implausible';
  END IF;
  IF p_synced_at > v_now + interval '5 minutes' THEN
    RAISE EXCEPTION 'synced_at too far in the future';
  END IF;
  IF p_candidates IS NULL OR jsonb_typeof(p_candidates) <> 'array' THEN
    RAISE EXCEPTION 'candidates must be a JSON array';
  END IF;
  IF p_events IS NULL OR jsonb_typeof(p_events) <> 'array' THEN
    RAISE EXCEPTION 'events must be a JSON array';
  END IF;

  v_len := jsonb_array_length(p_candidates);
  IF v_len > 200 THEN RAISE EXCEPTION 'candidates exceed cap of 200'; END IF;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_candidates)
  LOOP
    IF jsonb_typeof(v_elem) <> 'object' THEN RAISE EXCEPTION 'candidate must be an object'; END IF;
    IF (v_elem ->> 'generation_id') IS DISTINCT FROM p_generation_id::text THEN
      RAISE EXCEPTION 'generation_id mismatch';
    END IF;
    IF (v_elem ->> 'trading_date') IS DISTINCT FROM p_trading_date::text THEN
      RAISE EXCEPTION 'trading_date mismatch';
    END IF;
    IF (v_elem ->> 'session_kind') IS DISTINCT FROM p_session_kind THEN
      RAISE EXCEPTION 'session_kind mismatch';
    END IF;
    v_symbol := upper(trim(COALESCE(v_elem ->> 'symbol', '')));
    IF v_symbol = '' OR char_length(v_symbol) > 12 OR v_symbol !~ '^[A-Z][A-Z0-9.\-]*$' THEN
      RAISE EXCEPTION 'invalid symbol';
    END IF;
    IF v_symbol = ANY (v_seen) THEN RAISE EXCEPTION 'duplicate symbol'; END IF;
    v_seen := array_append(v_seen, v_symbol);
    IF COALESCE(v_elem ->> 'vwap_side', '') NOT IN ('above', 'below', 'unknown') THEN
      RAISE EXCEPTION 'invalid vwap_side';
    END IF;
    IF COALESCE(v_elem ->> 'freshness_class', '') NOT IN
         ('fresh', 'active', 'cooling', 'stale', 'unknown') THEN
      RAISE EXCEPTION 'invalid freshness_class';
    END IF;
    IF COALESCE(v_elem ->> 'lifecycle', '') = '' THEN
      RAISE EXCEPTION 'invalid lifecycle';
    END IF;
  END LOOP;

  -- Serialize against the singleton feed-state row BEFORE any candidate DELETE.
  -- SELECT FOR UPDATE: the second concurrent txn waits, then sees the first
  -- txn's committed v2_synced_at / v2_generation_id before deciding.
  INSERT INTO public.radar_v22_feed_state (
    state_key, generation_id, status, session_date, synced_at,
    symbol_count, feed_stale, updated_at
  ) VALUES (
    'current', NULL, 'empty', p_trading_date, p_synced_at,
    0, false, p_synced_at
  )
  ON CONFLICT (state_key) DO NOTHING;

  SELECT v2_generation_id, v2_synced_at, candidate_count
    INTO v_existing_gen, v_existing_synced, v_existing_count
  FROM public.radar_v22_feed_state
  WHERE state_key = 'current'
  FOR UPDATE;

  -- CASE A: no existing V2 generation → accept.
  -- CASE B: incoming p_synced_at > existing v2_synced_at → accept.
  -- CASE C: same timestamp AND same generation → idempotent retry, no DELETE.
  -- CASE D: incoming older AND generation differs → stale no-op.
  -- CASE E: same timestamp AND generation differs → conflict/stale no-op.
  -- UUIDs are never ordered. Same generation with an older timestamp is
  -- treated as already_current (retry safety), not a rewrite.
  IF v_existing_synced IS NOT NULL THEN
    IF p_synced_at < v_existing_synced
       AND p_generation_id IS DISTINCT FROM v_existing_gen THEN
      RETURN jsonb_build_object(
        'applied', false,
        'reason', 'stale_generation',
        'inserted', COALESCE(v_existing_count, 0)
      );
    END IF;
    IF p_synced_at = v_existing_synced
       AND p_generation_id IS DISTINCT FROM v_existing_gen THEN
      RETURN jsonb_build_object(
        'applied', false,
        'reason', 'stale_generation',
        'inserted', COALESCE(v_existing_count, 0)
      );
    END IF;
    IF p_synced_at <= v_existing_synced
       AND p_generation_id = v_existing_gen THEN
      RETURN jsonb_build_object(
        'applied', true,
        'reason', 'already_current',
        'inserted', COALESCE(v_existing_count, 0)
      );
    END IF;
  END IF;

  DELETE FROM public.radar_v22_candidates;

  IF v_len > 0 THEN
    INSERT INTO public.radar_v22_candidates (
      symbol, generation_id, trading_date, session_kind, lifecycle, signal_status,
      last_price, last_price_at, move_15s_pct, move_60s_pct,
      volume_5s, volume_15s, volume_60s, session_volume, dollar_volume_60s,
      acceleration_5m, session_high, session_low, distance_from_hod_pct,
      session_vwap, vwap_side, geometry_partial, vwap_partial,
      last_new_hod_at, last_hod_attempt_at, last_hod_break_at, last_hod_reject_at,
      last_vwap_cross_at, last_vwap_reclaim_at, last_vwap_loss_at,
      freshness_class, freshness_age_ms, last_volume_burst_at, last_price_move_at,
      last_acceleration_at, promoted_at, lifecycle_entered_at, provider_as_of,
      updated_at
    )
    SELECT
      upper(trim(e ->> 'symbol')),
      p_generation_id,
      p_trading_date,
      p_session_kind,
      e ->> 'lifecycle',
      e ->> 'signal_status',
      NULLIF(e ->> 'last_price', '')::numeric,
      NULLIF(e ->> 'last_price_at', '')::timestamptz,
      NULLIF(e ->> 'move_15s_pct', '')::numeric,
      NULLIF(e ->> 'move_60s_pct', '')::numeric,
      COALESCE((e ->> 'volume_5s')::numeric, 0),
      COALESCE((e ->> 'volume_15s')::numeric, 0),
      COALESCE((e ->> 'volume_60s')::numeric, 0),
      COALESCE((e ->> 'session_volume')::numeric, 0),
      COALESCE((e ->> 'dollar_volume_60s')::numeric, 0),
      NULLIF(e ->> 'acceleration_5m', '')::numeric,
      NULLIF(e ->> 'session_high', '')::numeric,
      NULLIF(e ->> 'session_low', '')::numeric,
      NULLIF(e ->> 'distance_from_hod_pct', '')::numeric,
      NULLIF(e ->> 'session_vwap', '')::numeric,
      e ->> 'vwap_side',
      COALESCE((e ->> 'geometry_partial')::boolean, false),
      COALESCE((e ->> 'vwap_partial')::boolean, false),
      NULLIF(e ->> 'last_new_hod_at', '')::timestamptz,
      NULLIF(e ->> 'last_hod_attempt_at', '')::timestamptz,
      NULLIF(e ->> 'last_hod_break_at', '')::timestamptz,
      NULLIF(e ->> 'last_hod_reject_at', '')::timestamptz,
      NULLIF(e ->> 'last_vwap_cross_at', '')::timestamptz,
      NULLIF(e ->> 'last_vwap_reclaim_at', '')::timestamptz,
      NULLIF(e ->> 'last_vwap_loss_at', '')::timestamptz,
      e ->> 'freshness_class',
      NULLIF(e ->> 'freshness_age_ms', '')::integer,
      NULLIF(e ->> 'last_volume_burst_at', '')::timestamptz,
      NULLIF(e ->> 'last_price_move_at', '')::timestamptz,
      NULLIF(e ->> 'last_acceleration_at', '')::timestamptz,
      NULLIF(e ->> 'promoted_at', '')::timestamptz,
      NULLIF(e ->> 'lifecycle_entered_at', '')::timestamptz,
      NULLIF(e ->> 'provider_as_of', '')::timestamptz,
      p_synced_at
    FROM jsonb_array_elements(p_candidates) AS e;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted <> v_len THEN RAISE EXCEPTION 'insert count mismatch'; END IF;
  END IF;

  FOR v_ev IN SELECT value FROM jsonb_array_elements(p_events)
  LOOP
    IF jsonb_typeof(v_ev) <> 'object' THEN RAISE EXCEPTION 'event must be an object'; END IF;
    v_symbol := upper(trim(COALESCE(v_ev ->> 'symbol', '')));
    IF v_symbol = '' OR char_length(v_symbol) > 12 OR v_symbol !~ '^[A-Z][A-Z0-9.\-]*$' THEN
      RAISE EXCEPTION 'invalid event symbol';
    END IF;
    v_type := v_ev ->> 'event_type';
    IF v_type IS NULL OR v_type NOT IN (
      'PROMOTED', 'DETECTED', 'CONFIRMED', 'ACTIVE', 'COOLING', 'REACTIVATED',
      'ARCHIVED', 'NEW_HOD', 'HOD_BREAK', 'HOD_REJECTION',
      'VWAP_RECLAIM', 'VWAP_LOSS', 'SESSION_PM_RTH', 'SESSION_RTH_AH'
    ) THEN
      RAISE EXCEPTION 'invalid event_type';
    END IF;
    BEGIN
      v_at := (v_ev ->> 'event_at')::timestamptz;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid event_at';
    END;
    IF v_at IS NULL THEN RAISE EXCEPTION 'missing event_at'; END IF;
    INSERT INTO public.radar_v22_events (
      trading_date, session_kind, symbol, event_type, event_at, generation_id, recorded_at
    ) VALUES (
      COALESCE(NULLIF(v_ev ->> 'trading_date', '')::date, p_trading_date),
      COALESCE(NULLIF(v_ev ->> 'session_kind', ''), p_session_kind),
      v_symbol,
      v_type,
      v_at,
      p_generation_id,
      p_synced_at
    )
    ON CONFLICT (trading_date, session_kind, symbol, event_type, event_at) DO NOTHING;
  END LOOP;

  INSERT INTO public.radar_v22_feed_state (
    state_key, generation_id, status, session_date, synced_at,
    provider_as_of_min, provider_as_of_max, last_provider_event_at,
    symbol_count, feed_stale, updated_at,
    session_kind, sentinel_enabled, candidate_count, v2_generation_id,
    last_receive_at, v2_synced_at
  ) VALUES (
    'current',
    NULL,
    'empty',
    p_trading_date,
    p_synced_at,
    NULL,
    NULL,
    p_last_provider_event_at,
    0,
    false,
    p_synced_at,
    p_session_kind,
    COALESCE(p_sentinel_enabled, false),
    v_inserted,
    p_generation_id,
    p_last_receive_at,
    p_synced_at
  )
  ON CONFLICT (state_key) DO UPDATE SET
    session_kind = EXCLUDED.session_kind,
    sentinel_enabled = EXCLUDED.sentinel_enabled,
    candidate_count = EXCLUDED.candidate_count,
    v2_generation_id = EXCLUDED.v2_generation_id,
    last_receive_at = EXCLUDED.last_receive_at,
    v2_synced_at = EXCLUDED.v2_synced_at,
    last_provider_event_at = CASE
      WHEN EXCLUDED.last_provider_event_at IS NULL THEN
        public.radar_v22_feed_state.last_provider_event_at
      WHEN public.radar_v22_feed_state.last_provider_event_at IS NULL THEN
        EXCLUDED.last_provider_event_at
      WHEN EXCLUDED.last_provider_event_at >
           public.radar_v22_feed_state.last_provider_event_at THEN
        EXCLUDED.last_provider_event_at
      ELSE
        public.radar_v22_feed_state.last_provider_event_at
    END,
    updated_at = EXCLUDED.updated_at;

  RETURN jsonb_build_object(
    'applied', true,
    'reason', 'replaced',
    'inserted', v_inserted
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.purge_radar_v22_events_v1(
  p_retain_days integer DEFAULT 14
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_days integer := GREATEST(1, LEAST(COALESCE(p_retain_days, 14), 365));
  v_deleted integer := 0;
BEGIN
  DELETE FROM public.radar_v22_events
  WHERE event_at < clock_timestamp() - make_interval(days => v_days);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$fn$;

REVOKE ALL ON FUNCTION public.replace_radar_v22_candidates_v1(
  uuid, date, text, timestamptz, jsonb, jsonb, boolean, timestamptz, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_radar_v22_candidates_v1(
  uuid, date, text, timestamptz, jsonb, jsonb, boolean, timestamptz, timestamptz
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_radar_v22_candidates_v1(
  uuid, date, text, timestamptz, jsonb, jsonb, boolean, timestamptz, timestamptz
) TO service_role;

REVOKE ALL ON FUNCTION public.purge_radar_v22_events_v1(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_radar_v22_events_v1(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_radar_v22_events_v1(integer) TO service_role;

COMMENT ON TABLE public.radar_v22_candidates IS
  'Current Radar Stage-2 candidate snapshot. Replaced atomically per generation. Not a second tape.';
COMMENT ON TABLE public.radar_v22_events IS
  'Discrete Radar events. Idempotent PK. Retain 14 days via purge_radar_v22_events_v1.';
COMMENT ON FUNCTION public.purge_radar_v22_events_v1(integer) IS
  'Deletes radar_v22_events older than p_retain_days (default 14). No scheduler in this sprint.';
COMMENT ON FUNCTION public.replace_radar_v22_candidates_v1(
  uuid, date, text, timestamptz, jsonb, jsonb, boolean, timestamptz, timestamptz
) IS
  'Atomic V2 candidate replace with v2_synced_at fencing. Stale generations return applied=false reason=stale_generation (not an exception).';
