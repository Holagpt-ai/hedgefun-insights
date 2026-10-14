-- Historical Intelligence V1 — persist post-momentum intraday forward outcome windows (evidence JSON).

ALTER TABLE public.episode_intraday_reconstruction
  ADD COLUMN IF NOT EXISTS post_momentum_forward_outcomes jsonb;

COMMENT ON COLUMN public.episode_intraday_reconstruction.post_momentum_forward_outcomes IS
  'Observed MFE/MAE/end-return windows after episode momentum reference time (minute bars; no prediction).';

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
      post_momentum_forward_outcomes,
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
      item->'post_momentum_forward_outcomes',
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
      post_momentum_forward_outcomes = EXCLUDED.post_momentum_forward_outcomes,
      quality = EXCLUDED.quality,
      freshness = EXCLUDED.freshness,
      provenance = EXCLUDED.provenance;
    applied := applied + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'applied', applied);
END;
$$;
