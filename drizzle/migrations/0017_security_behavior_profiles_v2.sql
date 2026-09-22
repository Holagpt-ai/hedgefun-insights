-- Historical Behavior Profiles V2 — forward-outcome aggregates (evidence only).

ALTER TABLE public.security_behavior_profiles
  DROP CONSTRAINT IF EXISTS security_behavior_profiles_version_check;

ALTER TABLE public.security_behavior_profiles
  ADD CONSTRAINT security_behavior_profiles_version_check
  CHECK (profile_version IN ('v1', 'v2'));

ALTER TABLE public.security_behavior_profiles
  ADD COLUMN IF NOT EXISTS episodes_with_d1_outcome integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS episodes_with_d5_outcome integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forward_outcome_coverage_pct_d1 numeric,
  ADD COLUMN IF NOT EXISTS forward_outcome_coverage_pct_d5 numeric,
  ADD COLUMN IF NOT EXISTS median_d1_return_pct numeric,
  ADD COLUMN IF NOT EXISTS positive_d1_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS negative_d1_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zero_d1_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS positive_d1_pct numeric,
  ADD COLUMN IF NOT EXISTS negative_d1_pct numeric,
  ADD COLUMN IF NOT EXISTS median_d5_return_pct numeric,
  ADD COLUMN IF NOT EXISTS positive_d5_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS negative_d5_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zero_d5_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS positive_d5_pct numeric,
  ADD COLUMN IF NOT EXISTS negative_d5_pct numeric,
  ADD COLUMN IF NOT EXISTS median_d1_max_gain_pct numeric,
  ADD COLUMN IF NOT EXISTS median_d1_max_drawdown_pct numeric,
  ADD COLUMN IF NOT EXISTS median_d5_max_gain_pct numeric,
  ADD COLUMN IF NOT EXISTS median_d5_max_drawdown_pct numeric,
  ADD COLUMN IF NOT EXISTS observed_next_session_sample_size integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observed_next_session_positive_pct numeric,
  ADD COLUMN IF NOT EXISTS observed_next_session_negative_pct numeric,
  ADD COLUMN IF NOT EXISTS forward_outcome_d1_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forward_outcome_d5_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.forward_outcome_aggregate_for_security_v1(p_security_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH fo AS (
    SELECT *
    FROM public.forward_outcomes
    WHERE security_id = p_security_id
  ),
  d1_join AS (
    SELECT
      fo.episode_id,
      coalesce(fo.horizon_session_move_pct, fo.return_pct) AS move_pct,
      e.direction
    FROM fo
    INNER JOIN public.market_behavior_episodes e ON e.episode_id = fo.episode_id
    WHERE fo.horizon = 'D1'
      AND fo.data_available = true
  )
  SELECT jsonb_build_object(
    'security_id', p_security_id,
    'episode_count_d1', count(*) FILTER (WHERE horizon = 'D1' AND data_available),
    'episode_count_d2', count(*) FILTER (WHERE horizon = 'D2' AND data_available),
    'episode_count_d3', count(*) FILTER (WHERE horizon = 'D3' AND data_available),
    'episode_count_d5', count(*) FILTER (WHERE horizon = 'D5' AND data_available),
    'median_return_d1', percentile_cont(0.5) WITHIN GROUP (ORDER BY return_pct)
      FILTER (WHERE horizon = 'D1' AND data_available AND return_pct IS NOT NULL),
    'median_return_d5', percentile_cont(0.5) WITHIN GROUP (ORDER BY return_pct)
      FILTER (WHERE horizon = 'D5' AND data_available AND return_pct IS NOT NULL),
    'positive_return_d1_count', count(*) FILTER (WHERE horizon = 'D1' AND data_available AND return_pct > 0),
    'negative_return_d1_count', count(*) FILTER (WHERE horizon = 'D1' AND data_available AND return_pct < 0),
    'zero_return_d1_count', count(*) FILTER (WHERE horizon = 'D1' AND data_available AND return_pct = 0),
    'positive_return_d5_count', count(*) FILTER (WHERE horizon = 'D5' AND data_available AND return_pct > 0),
    'negative_return_d5_count', count(*) FILTER (WHERE horizon = 'D5' AND data_available AND return_pct < 0),
    'zero_return_d5_count', count(*) FILTER (WHERE horizon = 'D5' AND data_available AND return_pct = 0),
    'median_max_gain_d1', percentile_cont(0.5) WITHIN GROUP (ORDER BY max_gain_pct)
      FILTER (WHERE horizon = 'D1' AND data_available AND max_gain_pct IS NOT NULL),
    'median_max_drawdown_d1', percentile_cont(0.5) WITHIN GROUP (ORDER BY max_drawdown_pct)
      FILTER (WHERE horizon = 'D1' AND data_available AND max_drawdown_pct IS NOT NULL),
    'median_max_gain_d5', percentile_cont(0.5) WITHIN GROUP (ORDER BY max_gain_pct)
      FILTER (WHERE horizon = 'D5' AND data_available AND max_gain_pct IS NOT NULL),
    'median_max_drawdown_d5', percentile_cont(0.5) WITHIN GROUP (ORDER BY max_drawdown_pct)
      FILTER (WHERE horizon = 'D5' AND data_available AND max_drawdown_pct IS NOT NULL),
    'observed_next_session_positive_sample_size', (
      SELECT count(*)::integer FROM d1_join WHERE direction = 'POSITIVE' AND move_pct IS NOT NULL
    ),
    'observed_next_session_positive_continuation_count', (
      SELECT count(*)::integer FROM d1_join
      WHERE direction = 'POSITIVE' AND move_pct IS NOT NULL AND move_pct >= 0.5
    ),
    'observed_next_session_negative_sample_size', (
      SELECT count(*)::integer FROM d1_join WHERE direction = 'NEGATIVE' AND move_pct IS NOT NULL
    ),
    'observed_next_session_negative_continuation_count', (
      SELECT count(*)::integer FROM d1_join
      WHERE direction = 'NEGATIVE' AND move_pct IS NOT NULL AND move_pct <= -0.5
    )
  )
  FROM fo;
$$;

CREATE OR REPLACE FUNCTION public.behavior_profile_list_candidates_v1(
  p_after_security_id uuid,
  p_limit integer
)
RETURNS TABLE (
  security_id uuid,
  max_history_date date,
  max_episode_date date,
  daily_row_count bigint,
  episode_row_count bigint,
  profile_computed_at timestamptz,
  profile_latest_history_date date,
  profile_latest_episode_date date,
  profile_version text,
  forward_outcome_d1_count bigint,
  forward_outcome_d5_count bigint,
  profile_forward_outcome_d1_count integer,
  profile_forward_outcome_d5_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH daily AS (
    SELECT
      d.security_id,
      max(d.session_date) AS max_history_date,
      count(*)::bigint AS daily_row_count
    FROM public.security_daily_history d
    GROUP BY d.security_id
  ),
  episodes AS (
    SELECT
      e.security_id,
      max((e.episode_start AT TIME ZONE 'UTC')::date) AS max_episode_date,
      count(*)::bigint AS episode_row_count
    FROM public.market_behavior_episodes e
    GROUP BY e.security_id
  ),
  fo AS (
    SELECT
      f.security_id,
      count(*) FILTER (WHERE f.horizon = 'D1' AND f.data_available) AS fo_d1_count,
      count(*) FILTER (WHERE f.horizon = 'D5' AND f.data_available) AS fo_d5_count
    FROM public.forward_outcomes f
    GROUP BY f.security_id
  )
  SELECT
    daily.security_id,
    daily.max_history_date,
    episodes.max_episode_date,
    daily.daily_row_count,
    coalesce(episodes.episode_row_count, 0::bigint) AS episode_row_count,
    profiles.computed_at AS profile_computed_at,
    profiles.latest_source_history_date AS profile_latest_history_date,
    profiles.latest_episode_date_used AS profile_latest_episode_date,
    profiles.profile_version,
    coalesce(fo.fo_d1_count, 0::bigint) AS forward_outcome_d1_count,
    coalesce(fo.fo_d5_count, 0::bigint) AS forward_outcome_d5_count,
    profiles.episodes_with_d1_outcome AS profile_forward_outcome_d1_count,
    profiles.episodes_with_d5_outcome AS profile_forward_outcome_d5_count
  FROM daily
  LEFT JOIN episodes ON episodes.security_id = daily.security_id
  LEFT JOIN fo ON fo.security_id = daily.security_id
  LEFT JOIN public.security_behavior_profiles profiles
    ON profiles.security_id = daily.security_id
  WHERE p_after_security_id IS NULL OR daily.security_id > p_after_security_id
  ORDER BY daily.security_id
  LIMIT greatest(1, least(coalesce(p_limit, 50), 500));
$$;

-- behavior_profile_upsert_v1 extended for v2 columns (same RPC name).
CREATE OR REPLACE FUNCTION public.behavior_profile_upsert_v1(p_row jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_row IS NULL OR p_row->>'security_id' IS NULL THEN
    RAISE EXCEPTION 'security_id is required';
  END IF;
  INSERT INTO public.security_behavior_profiles (
    security_id, profile_version, observed_symbol, computed_at,
    history_start_date, history_end_date, sessions_observed, episode_count, sample_size_quality,
    notable_count, significant_count, extreme_count,
    positive_episode_count, negative_episode_count, mixed_episode_count,
    positive_episode_pct, negative_episode_pct,
    median_episode_move_pct, average_episode_move_pct,
    max_positive_episode_move_pct, max_negative_episode_move_pct, median_absolute_move_pct,
    median_episode_volume, median_episode_rvol, max_episode_rvol, median_episode_dollar_volume,
    episodes_per_30_sessions, episodes_per_90_sessions, median_days_between_episodes,
    most_recent_episode_date, prior_comparable_episode_count,
    positive_close_upper_quartile_pct, positive_close_near_high_pct, negative_close_near_low_pct,
    continuation_sample_size, next_session_positive_continuation_count,
    next_session_negative_continuation_count, next_session_positive_continuation_rate,
    next_session_negative_continuation_rate,
    latest_source_history_date, latest_episode_date_used,
    source_daily_row_count, source_episode_count,
    episodes_with_d1_outcome, episodes_with_d5_outcome,
    forward_outcome_coverage_pct_d1, forward_outcome_coverage_pct_d5,
    median_d1_return_pct, positive_d1_count, negative_d1_count, zero_d1_count,
    positive_d1_pct, negative_d1_pct,
    median_d5_return_pct, positive_d5_count, negative_d5_count, zero_d5_count,
    positive_d5_pct, negative_d5_pct,
    median_d1_max_gain_pct, median_d1_max_drawdown_pct,
    median_d5_max_gain_pct, median_d5_max_drawdown_pct,
    observed_next_session_sample_size, observed_next_session_positive_pct,
    observed_next_session_negative_pct,
    forward_outcome_d1_count, forward_outcome_d5_count,
    updated_at
  ) VALUES (
    (p_row->>'security_id')::uuid,
    coalesce(nullif(p_row->>'profile_version', ''), 'v2'),
    nullif(p_row->>'observed_symbol', ''),
    (p_row->>'computed_at')::timestamptz,
    nullif(p_row->>'history_start_date', '')::date,
    nullif(p_row->>'history_end_date', '')::date,
    coalesce((p_row->>'sessions_observed')::integer, 0),
    coalesce((p_row->>'episode_count')::integer, 0),
    p_row->>'sample_size_quality',
    coalesce((p_row->>'notable_count')::integer, 0),
    coalesce((p_row->>'significant_count')::integer, 0),
    coalesce((p_row->>'extreme_count')::integer, 0),
    coalesce((p_row->>'positive_episode_count')::integer, 0),
    coalesce((p_row->>'negative_episode_count')::integer, 0),
    coalesce((p_row->>'mixed_episode_count')::integer, 0),
    nullif(p_row->>'positive_episode_pct', '')::numeric,
    nullif(p_row->>'negative_episode_pct', '')::numeric,
    nullif(p_row->>'median_episode_move_pct', '')::numeric,
    nullif(p_row->>'average_episode_move_pct', '')::numeric,
    nullif(p_row->>'max_positive_episode_move_pct', '')::numeric,
    nullif(p_row->>'max_negative_episode_move_pct', '')::numeric,
    nullif(p_row->>'median_absolute_move_pct', '')::numeric,
    nullif(p_row->>'median_episode_volume', '')::numeric,
    nullif(p_row->>'median_episode_rvol', '')::numeric,
    nullif(p_row->>'max_episode_rvol', '')::numeric,
    nullif(p_row->>'median_episode_dollar_volume', '')::numeric,
    nullif(p_row->>'episodes_per_30_sessions', '')::numeric,
    nullif(p_row->>'episodes_per_90_sessions', '')::numeric,
    nullif(p_row->>'median_days_between_episodes', '')::numeric,
    nullif(p_row->>'most_recent_episode_date', '')::date,
    coalesce((p_row->>'prior_comparable_episode_count')::integer, 0),
    nullif(p_row->>'positive_close_upper_quartile_pct', '')::numeric,
    nullif(p_row->>'positive_close_near_high_pct', '')::numeric,
    nullif(p_row->>'negative_close_near_low_pct', '')::numeric,
    coalesce((p_row->>'continuation_sample_size')::integer, 0),
    coalesce((p_row->>'next_session_positive_continuation_count')::integer, 0),
    coalesce((p_row->>'next_session_negative_continuation_count')::integer, 0),
    nullif(p_row->>'next_session_positive_continuation_rate', '')::numeric,
    nullif(p_row->>'next_session_negative_continuation_rate', '')::numeric,
    nullif(p_row->>'latest_source_history_date', '')::date,
    nullif(p_row->>'latest_episode_date_used', '')::date,
    coalesce((p_row->>'source_daily_row_count')::integer, 0),
    coalesce((p_row->>'source_episode_count')::integer, 0),
    coalesce((p_row->>'episodes_with_d1_outcome')::integer, 0),
    coalesce((p_row->>'episodes_with_d5_outcome')::integer, 0),
    nullif(p_row->>'forward_outcome_coverage_pct_d1', '')::numeric,
    nullif(p_row->>'forward_outcome_coverage_pct_d5', '')::numeric,
    nullif(p_row->>'median_d1_return_pct', '')::numeric,
    coalesce((p_row->>'positive_d1_count')::integer, 0),
    coalesce((p_row->>'negative_d1_count')::integer, 0),
    coalesce((p_row->>'zero_d1_count')::integer, 0),
    nullif(p_row->>'positive_d1_pct', '')::numeric,
    nullif(p_row->>'negative_d1_pct', '')::numeric,
    nullif(p_row->>'median_d5_return_pct', '')::numeric,
    coalesce((p_row->>'positive_d5_count')::integer, 0),
    coalesce((p_row->>'negative_d5_count')::integer, 0),
    coalesce((p_row->>'zero_d5_count')::integer, 0),
    nullif(p_row->>'positive_d5_pct', '')::numeric,
    nullif(p_row->>'negative_d5_pct', '')::numeric,
    nullif(p_row->>'median_d1_max_gain_pct', '')::numeric,
    nullif(p_row->>'median_d1_max_drawdown_pct', '')::numeric,
    nullif(p_row->>'median_d5_max_gain_pct', '')::numeric,
    nullif(p_row->>'median_d5_max_drawdown_pct', '')::numeric,
    coalesce((p_row->>'observed_next_session_sample_size')::integer, 0),
    nullif(p_row->>'observed_next_session_positive_pct', '')::numeric,
    nullif(p_row->>'observed_next_session_negative_pct', '')::numeric,
    coalesce((p_row->>'forward_outcome_d1_count')::integer, 0),
    coalesce((p_row->>'forward_outcome_d5_count')::integer, 0),
    now()
  )
  ON CONFLICT (security_id) DO UPDATE SET
    profile_version = EXCLUDED.profile_version,
    observed_symbol = EXCLUDED.observed_symbol,
    computed_at = EXCLUDED.computed_at,
    history_start_date = EXCLUDED.history_start_date,
    history_end_date = EXCLUDED.history_end_date,
    sessions_observed = EXCLUDED.sessions_observed,
    episode_count = EXCLUDED.episode_count,
    sample_size_quality = EXCLUDED.sample_size_quality,
    notable_count = EXCLUDED.notable_count,
    significant_count = EXCLUDED.significant_count,
    extreme_count = EXCLUDED.extreme_count,
    positive_episode_count = EXCLUDED.positive_episode_count,
    negative_episode_count = EXCLUDED.negative_episode_count,
    mixed_episode_count = EXCLUDED.mixed_episode_count,
    positive_episode_pct = EXCLUDED.positive_episode_pct,
    negative_episode_pct = EXCLUDED.negative_episode_pct,
    median_episode_move_pct = EXCLUDED.median_episode_move_pct,
    average_episode_move_pct = EXCLUDED.average_episode_move_pct,
    max_positive_episode_move_pct = EXCLUDED.max_positive_episode_move_pct,
    max_negative_episode_move_pct = EXCLUDED.max_negative_episode_move_pct,
    median_absolute_move_pct = EXCLUDED.median_absolute_move_pct,
    median_episode_volume = EXCLUDED.median_episode_volume,
    median_episode_rvol = EXCLUDED.median_episode_rvol,
    max_episode_rvol = EXCLUDED.max_episode_rvol,
    median_episode_dollar_volume = EXCLUDED.median_episode_dollar_volume,
    episodes_per_30_sessions = EXCLUDED.episodes_per_30_sessions,
    episodes_per_90_sessions = EXCLUDED.episodes_per_90_sessions,
    median_days_between_episodes = EXCLUDED.median_days_between_episodes,
    most_recent_episode_date = EXCLUDED.most_recent_episode_date,
    prior_comparable_episode_count = EXCLUDED.prior_comparable_episode_count,
    positive_close_upper_quartile_pct = EXCLUDED.positive_close_upper_quartile_pct,
    positive_close_near_high_pct = EXCLUDED.positive_close_near_high_pct,
    negative_close_near_low_pct = EXCLUDED.negative_close_near_low_pct,
    continuation_sample_size = EXCLUDED.continuation_sample_size,
    next_session_positive_continuation_count = EXCLUDED.next_session_positive_continuation_count,
    next_session_negative_continuation_count = EXCLUDED.next_session_negative_continuation_count,
    next_session_positive_continuation_rate = EXCLUDED.next_session_positive_continuation_rate,
    next_session_negative_continuation_rate = EXCLUDED.next_session_negative_continuation_rate,
    latest_source_history_date = EXCLUDED.latest_source_history_date,
    latest_episode_date_used = EXCLUDED.latest_episode_date_used,
    source_daily_row_count = EXCLUDED.source_daily_row_count,
    source_episode_count = EXCLUDED.source_episode_count,
    episodes_with_d1_outcome = EXCLUDED.episodes_with_d1_outcome,
    episodes_with_d5_outcome = EXCLUDED.episodes_with_d5_outcome,
    forward_outcome_coverage_pct_d1 = EXCLUDED.forward_outcome_coverage_pct_d1,
    forward_outcome_coverage_pct_d5 = EXCLUDED.forward_outcome_coverage_pct_d5,
    median_d1_return_pct = EXCLUDED.median_d1_return_pct,
    positive_d1_count = EXCLUDED.positive_d1_count,
    negative_d1_count = EXCLUDED.negative_d1_count,
    zero_d1_count = EXCLUDED.zero_d1_count,
    positive_d1_pct = EXCLUDED.positive_d1_pct,
    negative_d1_pct = EXCLUDED.negative_d1_pct,
    median_d5_return_pct = EXCLUDED.median_d5_return_pct,
    positive_d5_count = EXCLUDED.positive_d5_count,
    negative_d5_count = EXCLUDED.negative_d5_count,
    zero_d5_count = EXCLUDED.zero_d5_count,
    positive_d5_pct = EXCLUDED.positive_d5_pct,
    negative_d5_pct = EXCLUDED.negative_d5_pct,
    median_d1_max_gain_pct = EXCLUDED.median_d1_max_gain_pct,
    median_d1_max_drawdown_pct = EXCLUDED.median_d1_max_drawdown_pct,
    median_d5_max_gain_pct = EXCLUDED.median_d5_max_gain_pct,
    median_d5_max_drawdown_pct = EXCLUDED.median_d5_max_drawdown_pct,
    observed_next_session_sample_size = EXCLUDED.observed_next_session_sample_size,
    observed_next_session_positive_pct = EXCLUDED.observed_next_session_positive_pct,
    observed_next_session_negative_pct = EXCLUDED.observed_next_session_negative_pct,
    forward_outcome_d1_count = EXCLUDED.forward_outcome_d1_count,
    forward_outcome_d5_count = EXCLUDED.forward_outcome_d5_count,
    updated_at = now();
END;
$$;

COMMENT ON TABLE public.security_behavior_profiles IS
  'Deterministic historical behavior summary per security (v2 includes forward-outcome aggregates). Evidence only.';
