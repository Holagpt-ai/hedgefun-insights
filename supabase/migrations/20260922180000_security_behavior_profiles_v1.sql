-- Historical Behavior Profile V1 — one current profile row per security.
-- Derived from security_daily_history and market_behavior_episodes. Not predictive.

CREATE TABLE IF NOT EXISTS public.security_behavior_profiles (
  security_id uuid PRIMARY KEY REFERENCES public.securities (security_id),
  profile_version text NOT NULL DEFAULT 'v1',
  observed_symbol text,
  computed_at timestamptz NOT NULL,
  history_start_date date,
  history_end_date date,
  sessions_observed integer NOT NULL DEFAULT 0,
  episode_count integer NOT NULL DEFAULT 0,
  sample_size_quality text NOT NULL,
  notable_count integer NOT NULL DEFAULT 0,
  significant_count integer NOT NULL DEFAULT 0,
  extreme_count integer NOT NULL DEFAULT 0,
  positive_episode_count integer NOT NULL DEFAULT 0,
  negative_episode_count integer NOT NULL DEFAULT 0,
  mixed_episode_count integer NOT NULL DEFAULT 0,
  positive_episode_pct numeric,
  negative_episode_pct numeric,
  median_episode_move_pct numeric,
  average_episode_move_pct numeric,
  max_positive_episode_move_pct numeric,
  max_negative_episode_move_pct numeric,
  median_absolute_move_pct numeric,
  median_episode_volume numeric,
  median_episode_rvol numeric,
  max_episode_rvol numeric,
  median_episode_dollar_volume numeric,
  episodes_per_30_sessions numeric,
  episodes_per_90_sessions numeric,
  median_days_between_episodes numeric,
  most_recent_episode_date date,
  prior_comparable_episode_count integer NOT NULL DEFAULT 0,
  positive_close_upper_quartile_pct numeric,
  positive_close_near_high_pct numeric,
  negative_close_near_low_pct numeric,
  continuation_sample_size integer NOT NULL DEFAULT 0,
  next_session_positive_continuation_count integer NOT NULL DEFAULT 0,
  next_session_negative_continuation_count integer NOT NULL DEFAULT 0,
  next_session_positive_continuation_rate numeric,
  next_session_negative_continuation_rate numeric,
  latest_source_history_date date,
  latest_episode_date_used date,
  source_daily_row_count integer NOT NULL DEFAULT 0,
  source_episode_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_behavior_profiles_version_check
    CHECK (profile_version = 'v1'),
  CONSTRAINT security_behavior_profiles_quality_check
    CHECK (sample_size_quality IN ('INSUFFICIENT', 'LIMITED', 'ADEQUATE', 'ROBUST')),
  CONSTRAINT security_behavior_profiles_counts_check
    CHECK (
      sessions_observed >= 0
      AND episode_count >= 0
      AND source_daily_row_count >= 0
      AND source_episode_count >= 0
    )
);

COMMENT ON TABLE public.security_behavior_profiles IS
  'Deterministic historical behavior summary per security. Evidence only; not a prediction score.';

CREATE INDEX IF NOT EXISTS security_behavior_profiles_computed_at_idx
  ON public.security_behavior_profiles (computed_at DESC);

CREATE INDEX IF NOT EXISTS security_behavior_profiles_sample_quality_idx
  ON public.security_behavior_profiles (sample_size_quality);

ALTER TABLE public.security_behavior_profiles ENABLE ROW LEVEL SECURITY;

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
    security_id,
    profile_version,
    observed_symbol,
    computed_at,
    history_start_date,
    history_end_date,
    sessions_observed,
    episode_count,
    sample_size_quality,
    notable_count,
    significant_count,
    extreme_count,
    positive_episode_count,
    negative_episode_count,
    mixed_episode_count,
    positive_episode_pct,
    negative_episode_pct,
    median_episode_move_pct,
    average_episode_move_pct,
    max_positive_episode_move_pct,
    max_negative_episode_move_pct,
    median_absolute_move_pct,
    median_episode_volume,
    median_episode_rvol,
    max_episode_rvol,
    median_episode_dollar_volume,
    episodes_per_30_sessions,
    episodes_per_90_sessions,
    median_days_between_episodes,
    most_recent_episode_date,
    prior_comparable_episode_count,
    positive_close_upper_quartile_pct,
    positive_close_near_high_pct,
    negative_close_near_low_pct,
    continuation_sample_size,
    next_session_positive_continuation_count,
    next_session_negative_continuation_count,
    next_session_positive_continuation_rate,
    next_session_negative_continuation_rate,
    latest_source_history_date,
    latest_episode_date_used,
    source_daily_row_count,
    source_episode_count,
    updated_at
  ) VALUES (
    (p_row->>'security_id')::uuid,
    coalesce(nullif(p_row->>'profile_version', ''), 'v1'),
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
    updated_at = now();
END;
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
  profile_version text
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
    profiles.profile_version
  FROM daily
  LEFT JOIN episodes ON episodes.security_id = daily.security_id
  LEFT JOIN public.security_behavior_profiles profiles
    ON profiles.security_id = daily.security_id
  WHERE p_after_security_id IS NULL OR daily.security_id > p_after_security_id
  ORDER BY daily.security_id
  LIMIT greatest(1, least(coalesce(p_limit, 50), 500));
$$;

REVOKE ALL ON FUNCTION public.behavior_profile_upsert_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.behavior_profile_list_candidates_v1(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.behavior_profile_upsert_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.behavior_profile_list_candidates_v1(uuid, integer) TO service_role;
