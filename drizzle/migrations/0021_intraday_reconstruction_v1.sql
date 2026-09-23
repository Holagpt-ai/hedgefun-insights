-- Deep Intraday Reconstruction V1 — descriptive episode structure (evidence only).

ALTER TABLE public.security_episode_events
  DROP CONSTRAINT IF EXISTS security_episode_events_type_check;

ALTER TABLE public.security_episode_events
  ADD CONSTRAINT security_episode_events_type_check
  CHECK (event_type IN (
    'DISCOVERED', 'SESSION_OPEN', 'VOLUME_TRIGGER', 'MOMENTUM_TRIGGER',
    'NEW_HOD', 'NEW_LOD', 'HALT', 'RESUME', 'PULLBACK', 'VWAP_LOSS', 'VWAP_RECLAIM',
    'RANGE_EXPANSION', 'CLOSE', 'AFTER_HOURS_EXTENSION'
  ));

CREATE TABLE IF NOT EXISTS public.episode_intraday_reconstruction (
  episode_id uuid PRIMARY KEY REFERENCES public.market_behavior_episodes (episode_id) ON DELETE CASCADE,
  security_id uuid NOT NULL REFERENCES public.securities (security_id),
  session_date date NOT NULL,
  completeness_state text NOT NULL,
  bar_granularity text NOT NULL DEFAULT '1m',
  bars_expected integer,
  bars_available integer,
  reg_bars_expected integer,
  reg_bars_available integer,
  session_coverage_pct numeric,
  provider text,
  source text,
  source_as_of timestamptz,
  fetched_at timestamptz,
  computed_at timestamptz NOT NULL,
  session_open_at timestamptz,
  hod_at timestamptz,
  lod_at timestamptz,
  first_major_move_at timestamptz,
  largest_volume_burst_at timestamptz,
  close_at timestamptz,
  open_price numeric,
  hod_price numeric,
  lod_price numeric,
  close_price numeric,
  move_open_to_hod_pct numeric,
  max_drawdown_from_hod_pct numeric,
  largest_pullback_pct numeric,
  recovered_from_pullback boolean,
  close_vs_hod_pct numeric,
  close_position numeric,
  total_intraday_volume numeric,
  largest_bar_volume numeric,
  volume_before_hod numeric,
  volume_after_hod numeric,
  volume_concentration_top5_pct numeric,
  premarket_high numeric,
  premarket_low numeric,
  regular_high numeric,
  regular_low numeric,
  after_hours_high numeric,
  after_hours_low numeric,
  momentum_leg_count integer,
  major_pullback_count integer,
  hod_session_phase text,
  vwap_at_close numeric,
  first_vwap_break_at timestamptz,
  vwap_reclaim_count integer,
  seconds_above_vwap integer,
  seconds_below_vwap integer,
  hod_vs_vwap_pct numeric,
  halt_count integer,
  first_halt_at timestamptz,
  halt_data_available boolean NOT NULL DEFAULT false,
  quality text NOT NULL,
  freshness text NOT NULL,
  provenance text NOT NULL,
  CONSTRAINT episode_intraday_reconstruction_completeness_check
    CHECK (completeness_state IN ('COMPLETE', 'PARTIAL', 'DAILY_ONLY', 'UNAVAILABLE')),
  CONSTRAINT episode_intraday_reconstruction_hod_phase_check
    CHECK (hod_session_phase IS NULL OR hod_session_phase IN ('EARLY', 'MID', 'LATE')),
  CONSTRAINT episode_intraday_reconstruction_quality_check
    CHECK (quality IN ('AUTHORITATIVE', 'DERIVED', 'PARTIAL', 'DISCREPANCY', 'UNAVAILABLE', 'INVALID')),
  CONSTRAINT episode_intraday_reconstruction_freshness_check
    CHECK (freshness IN ('FRESH', 'AGING', 'STALE', 'UNKNOWN')),
  CONSTRAINT episode_intraday_reconstruction_provenance_check
    CHECK (provenance IN ('PROVIDER', 'DERIVED', 'INTERNAL', 'COMPOSITE', 'UNKNOWN'))
);

CREATE INDEX IF NOT EXISTS episode_intraday_reconstruction_security_idx
  ON public.episode_intraday_reconstruction (security_id, session_date DESC);

COMMENT ON TABLE public.episode_intraday_reconstruction IS
  'Deterministic intraday structure for SIGNIFICANT/EXTREME episodes. Descriptive evidence only.';

CREATE OR REPLACE FUNCTION public.intraday_reconstruction_apply_batch_v1(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  applied integer := 0;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a jsonb array';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) AS t(value)
  LOOP
    INSERT INTO public.episode_intraday_reconstruction (
      episode_id, security_id, session_date, completeness_state, bar_granularity,
      bars_expected, bars_available, reg_bars_expected, reg_bars_available, session_coverage_pct,
      provider, source, source_as_of, fetched_at, computed_at,
      session_open_at, hod_at, lod_at, first_major_move_at, largest_volume_burst_at, close_at,
      open_price, hod_price, lod_price, close_price,
      move_open_to_hod_pct, max_drawdown_from_hod_pct, largest_pullback_pct, recovered_from_pullback,
      close_vs_hod_pct, close_position,
      total_intraday_volume, largest_bar_volume, volume_before_hod, volume_after_hod, volume_concentration_top5_pct,
      premarket_high, premarket_low, regular_high, regular_low, after_hours_high, after_hours_low,
      momentum_leg_count, major_pullback_count, hod_session_phase,
      vwap_at_close, first_vwap_break_at, vwap_reclaim_count, seconds_above_vwap, seconds_below_vwap, hod_vs_vwap_pct,
      halt_count, first_halt_at, halt_data_available,
      quality, freshness, provenance
    ) VALUES (
      (item->>'episode_id')::uuid,
      (item->>'security_id')::uuid,
      (item->>'session_date')::date,
      item->>'completeness_state',
      coalesce(item->>'bar_granularity', '1m'),
      nullif(item->>'bars_expected', '')::integer,
      nullif(item->>'bars_available', '')::integer,
      nullif(item->>'reg_bars_expected', '')::integer,
      nullif(item->>'reg_bars_available', '')::integer,
      nullif(item->>'session_coverage_pct', '')::numeric,
      nullif(item->>'provider', ''),
      nullif(item->>'source', ''),
      nullif(item->>'source_as_of', '')::timestamptz,
      nullif(item->>'fetched_at', '')::timestamptz,
      (item->>'computed_at')::timestamptz,
      nullif(item->>'session_open_at', '')::timestamptz,
      nullif(item->>'hod_at', '')::timestamptz,
      nullif(item->>'lod_at', '')::timestamptz,
      nullif(item->>'first_major_move_at', '')::timestamptz,
      nullif(item->>'largest_volume_burst_at', '')::timestamptz,
      nullif(item->>'close_at', '')::timestamptz,
      nullif(item->>'open_price', '')::numeric,
      nullif(item->>'hod_price', '')::numeric,
      nullif(item->>'lod_price', '')::numeric,
      nullif(item->>'close_price', '')::numeric,
      nullif(item->>'move_open_to_hod_pct', '')::numeric,
      nullif(item->>'max_drawdown_from_hod_pct', '')::numeric,
      nullif(item->>'largest_pullback_pct', '')::numeric,
      (item->>'recovered_from_pullback')::boolean,
      nullif(item->>'close_vs_hod_pct', '')::numeric,
      nullif(item->>'close_position', '')::numeric,
      nullif(item->>'total_intraday_volume', '')::numeric,
      nullif(item->>'largest_bar_volume', '')::numeric,
      nullif(item->>'volume_before_hod', '')::numeric,
      nullif(item->>'volume_after_hod', '')::numeric,
      nullif(item->>'volume_concentration_top5_pct', '')::numeric,
      nullif(item->>'premarket_high', '')::numeric,
      nullif(item->>'premarket_low', '')::numeric,
      nullif(item->>'regular_high', '')::numeric,
      nullif(item->>'regular_low', '')::numeric,
      nullif(item->>'after_hours_high', '')::numeric,
      nullif(item->>'after_hours_low', '')::numeric,
      nullif(item->>'momentum_leg_count', '')::integer,
      nullif(item->>'major_pullback_count', '')::integer,
      nullif(item->>'hod_session_phase', ''),
      nullif(item->>'vwap_at_close', '')::numeric,
      nullif(item->>'first_vwap_break_at', '')::timestamptz,
      nullif(item->>'vwap_reclaim_count', '')::integer,
      nullif(item->>'seconds_above_vwap', '')::integer,
      nullif(item->>'seconds_below_vwap', '')::integer,
      nullif(item->>'hod_vs_vwap_pct', '')::numeric,
      nullif(item->>'halt_count', '')::integer,
      nullif(item->>'first_halt_at', '')::timestamptz,
      coalesce((item->>'halt_data_available')::boolean, false),
      item->>'quality',
      item->>'freshness',
      item->>'provenance'
    )
    ON CONFLICT (episode_id) DO UPDATE SET
      security_id = EXCLUDED.security_id,
      session_date = EXCLUDED.session_date,
      completeness_state = EXCLUDED.completeness_state,
      bar_granularity = EXCLUDED.bar_granularity,
      bars_expected = EXCLUDED.bars_expected,
      bars_available = EXCLUDED.bars_available,
      reg_bars_expected = EXCLUDED.reg_bars_expected,
      reg_bars_available = EXCLUDED.reg_bars_available,
      session_coverage_pct = EXCLUDED.session_coverage_pct,
      provider = EXCLUDED.provider,
      source = EXCLUDED.source,
      source_as_of = EXCLUDED.source_as_of,
      fetched_at = EXCLUDED.fetched_at,
      computed_at = EXCLUDED.computed_at,
      session_open_at = EXCLUDED.session_open_at,
      hod_at = EXCLUDED.hod_at,
      lod_at = EXCLUDED.lod_at,
      first_major_move_at = EXCLUDED.first_major_move_at,
      largest_volume_burst_at = EXCLUDED.largest_volume_burst_at,
      close_at = EXCLUDED.close_at,
      open_price = EXCLUDED.open_price,
      hod_price = EXCLUDED.hod_price,
      lod_price = EXCLUDED.lod_price,
      close_price = EXCLUDED.close_price,
      move_open_to_hod_pct = EXCLUDED.move_open_to_hod_pct,
      max_drawdown_from_hod_pct = EXCLUDED.max_drawdown_from_hod_pct,
      largest_pullback_pct = EXCLUDED.largest_pullback_pct,
      recovered_from_pullback = EXCLUDED.recovered_from_pullback,
      close_vs_hod_pct = EXCLUDED.close_vs_hod_pct,
      close_position = EXCLUDED.close_position,
      total_intraday_volume = EXCLUDED.total_intraday_volume,
      largest_bar_volume = EXCLUDED.largest_bar_volume,
      volume_before_hod = EXCLUDED.volume_before_hod,
      volume_after_hod = EXCLUDED.volume_after_hod,
      volume_concentration_top5_pct = EXCLUDED.volume_concentration_top5_pct,
      premarket_high = EXCLUDED.premarket_high,
      premarket_low = EXCLUDED.premarket_low,
      regular_high = EXCLUDED.regular_high,
      regular_low = EXCLUDED.regular_low,
      after_hours_high = EXCLUDED.after_hours_high,
      after_hours_low = EXCLUDED.after_hours_low,
      momentum_leg_count = EXCLUDED.momentum_leg_count,
      major_pullback_count = EXCLUDED.major_pullback_count,
      hod_session_phase = EXCLUDED.hod_session_phase,
      vwap_at_close = EXCLUDED.vwap_at_close,
      first_vwap_break_at = EXCLUDED.first_vwap_break_at,
      vwap_reclaim_count = EXCLUDED.vwap_reclaim_count,
      seconds_above_vwap = EXCLUDED.seconds_above_vwap,
      seconds_below_vwap = EXCLUDED.seconds_below_vwap,
      hod_vs_vwap_pct = EXCLUDED.hod_vs_vwap_pct,
      halt_count = EXCLUDED.halt_count,
      first_halt_at = EXCLUDED.first_halt_at,
      halt_data_available = EXCLUDED.halt_data_available,
      quality = EXCLUDED.quality,
      freshness = EXCLUDED.freshness,
      provenance = EXCLUDED.provenance;
    applied := applied + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'applied', applied);
END;
$$;

CREATE OR REPLACE FUNCTION public.intraday_episode_event_apply_batch_v1(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  applied integer := 0;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a jsonb array';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) AS t(value)
  LOOP
    INSERT INTO public.security_episode_events (
      episode_event_id, episode_id, security_id, event_type, event_at,
      price, volume, metadata, provenance, source, source_as_of, created_at
    ) VALUES (
      (item->>'episode_event_id')::uuid,
      (item->>'episode_id')::uuid,
      (item->>'security_id')::uuid,
      item->>'event_type',
      (item->>'event_at')::timestamptz,
      nullif(item->>'price', '')::numeric,
      nullif(item->>'volume', '')::numeric,
      coalesce(item->'metadata', '{}'::jsonb),
      item->>'provenance',
      nullif(item->>'source', ''),
      nullif(item->>'source_as_of', '')::timestamptz,
      coalesce(nullif(item->>'created_at', '')::timestamptz, now())
    )
    ON CONFLICT (episode_event_id) DO UPDATE SET
      event_type = EXCLUDED.event_type,
      event_at = EXCLUDED.event_at,
      price = EXCLUDED.price,
      volume = EXCLUDED.volume,
      metadata = EXCLUDED.metadata,
      provenance = EXCLUDED.provenance,
      source = EXCLUDED.source,
      source_as_of = EXCLUDED.source_as_of;
    applied := applied + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'applied', applied);
END;
$$;

CREATE OR REPLACE FUNCTION public.intraday_reconstruction_list_episodes_v1(
  p_after_episode_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_include_reconstructed boolean DEFAULT false
)
RETURNS TABLE (
  episode_id uuid,
  security_id uuid,
  observed_symbol text,
  session_date date,
  tier text,
  direction text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.episode_id,
    e.security_id,
    e.observed_symbol,
    e.episode_start::date AS session_date,
    e.tier,
    e.direction
  FROM public.market_behavior_episodes e
  LEFT JOIN public.episode_intraday_reconstruction r ON r.episode_id = e.episode_id
  WHERE e.tier IN ('SIGNIFICANT', 'EXTREME')
    AND (p_include_reconstructed OR r.episode_id IS NULL)
    AND (p_after_episode_id IS NULL OR e.episode_id > p_after_episode_id)
  ORDER BY e.episode_id
  LIMIT greatest(1, least(coalesce(p_limit, 50), 500));
$$;

CREATE OR REPLACE FUNCTION public.intraday_reconstruction_list_by_episodes_v1(p_episode_ids uuid[])
RETURNS SETOF public.episode_intraday_reconstruction
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.episode_intraday_reconstruction
  WHERE episode_id = ANY(p_episode_ids);
$$;

REVOKE ALL ON FUNCTION public.intraday_reconstruction_apply_batch_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intraday_episode_event_apply_batch_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intraday_reconstruction_list_episodes_v1(uuid, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.intraday_reconstruction_list_by_episodes_v1(uuid[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.intraday_reconstruction_apply_batch_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.intraday_episode_event_apply_batch_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.intraday_reconstruction_list_episodes_v1(uuid, integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.intraday_reconstruction_list_by_episodes_v1(uuid[]) TO service_role;

ALTER TABLE public.episode_intraday_reconstruction ENABLE ROW LEVEL SECURITY;