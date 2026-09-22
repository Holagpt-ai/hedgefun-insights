-- Historical Forward Outcomes V1 — extend existing forward_outcomes (no duplicate system).

CREATE TABLE IF NOT EXISTS public.forward_outcomes (
  episode_id uuid NOT NULL REFERENCES public.market_behavior_episodes (episode_id),
  horizon text NOT NULL,
  reference_timestamp timestamptz,
  reference_price numeric,
  outcome_price numeric,
  return_pct numeric,
  max_gain_pct numeric,
  max_drawdown_pct numeric,
  high_price numeric,
  low_price numeric,
  data_available boolean NOT NULL,
  source text,
  source_as_of timestamptz,
  fetched_at timestamptz,
  computed_at timestamptz,
  quality text NOT NULL,
  freshness text NOT NULL,
  provenance text NOT NULL,
  PRIMARY KEY (episode_id, horizon),
  CONSTRAINT forward_outcomes_horizon_check
    CHECK (horizon IN (
      '5M', '15M', '30M', '1H', 'CLOSE', 'AFTER_HOURS', 'NEXT_OPEN',
      'D1', 'D2', 'D3', 'D5', 'D10', 'D30'
    )),
  CONSTRAINT forward_outcomes_quality_check
    CHECK (quality IN ('AUTHORITATIVE', 'DERIVED', 'PARTIAL', 'DISCREPANCY', 'UNAVAILABLE', 'INVALID')),
  CONSTRAINT forward_outcomes_freshness_check
    CHECK (freshness IN ('FRESH', 'AGING', 'STALE', 'UNKNOWN')),
  CONSTRAINT forward_outcomes_provenance_check
    CHECK (provenance IN ('PROVIDER', 'DERIVED', 'INTERNAL', 'COMPOSITE', 'UNKNOWN'))
);

ALTER TABLE public.forward_outcomes
  ADD COLUMN IF NOT EXISTS security_id uuid REFERENCES public.securities (security_id),
  ADD COLUMN IF NOT EXISTS availability_state text,
  ADD COLUMN IF NOT EXISTS episode_session_date date,
  ADD COLUMN IF NOT EXISTS horizon_session_date date,
  ADD COLUMN IF NOT EXISTS open_to_close_return_pct numeric,
  ADD COLUMN IF NOT EXISTS gap_pct numeric,
  ADD COLUMN IF NOT EXISTS session_volume numeric,
  ADD COLUMN IF NOT EXISTS horizon_session_move_pct numeric,
  ADD COLUMN IF NOT EXISTS rvol numeric,
  ADD COLUMN IF NOT EXISTS close_position numeric,
  ADD COLUMN IF NOT EXISTS closed_above_episode_close boolean,
  ADD COLUMN IF NOT EXISTS closed_below_episode_close boolean,
  ADD COLUMN IF NOT EXISTS exceeded_episode_high boolean,
  ADD COLUMN IF NOT EXISTS broke_episode_low boolean;

ALTER TABLE public.forward_outcomes
  DROP CONSTRAINT IF EXISTS forward_outcomes_availability_state_check;

ALTER TABLE public.forward_outcomes
  ADD CONSTRAINT forward_outcomes_availability_state_check
  CHECK (
    availability_state IS NULL OR availability_state IN (
      'AVAILABLE',
      'FUTURE_SESSION_NOT_LOADED',
      'EPISODE_TOO_RECENT',
      'INSUFFICIENT_HISTORY',
      'INVALID_EPISODE'
    )
  );

CREATE INDEX IF NOT EXISTS forward_outcomes_security_id_idx
  ON public.forward_outcomes (security_id);

CREATE INDEX IF NOT EXISTS forward_outcomes_security_horizon_idx
  ON public.forward_outcomes (security_id, horizon)
  WHERE data_available = true;

COMMENT ON TABLE public.forward_outcomes IS
  'Observed forward session outcomes for historical episodes (+1/+2/+3/+5 trading sessions). Evidence only.';

CREATE OR REPLACE FUNCTION public.forward_outcome_apply_batch_v1(p_rows jsonb)
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
    INSERT INTO public.forward_outcomes (
      episode_id, security_id, horizon,
      reference_timestamp, reference_price, outcome_price,
      return_pct, max_gain_pct, max_drawdown_pct,
      high_price, low_price, data_available,
      availability_state, episode_session_date, horizon_session_date,
      open_to_close_return_pct, gap_pct, session_volume, horizon_session_move_pct, rvol, close_position,
      closed_above_episode_close, closed_below_episode_close,
      exceeded_episode_high, broke_episode_low,
      source, source_as_of, fetched_at, computed_at,
      quality, freshness, provenance
    ) VALUES (
      (item->>'episode_id')::uuid,
      nullif(item->>'security_id', '')::uuid,
      item->>'horizon',
      nullif(item->>'reference_timestamp', '')::timestamptz,
      nullif(item->>'reference_price', '')::numeric,
      nullif(item->>'outcome_price', '')::numeric,
      nullif(item->>'return_pct', '')::numeric,
      nullif(item->>'max_gain_pct', '')::numeric,
      nullif(item->>'max_drawdown_pct', '')::numeric,
      nullif(item->>'high_price', '')::numeric,
      nullif(item->>'low_price', '')::numeric,
      coalesce((item->>'data_available')::boolean, false),
      nullif(item->>'availability_state', '')::text,
      nullif(item->>'episode_session_date', '')::date,
      nullif(item->>'horizon_session_date', '')::date,
      nullif(item->>'open_to_close_return_pct', '')::numeric,
      nullif(item->>'gap_pct', '')::numeric,
      nullif(item->>'session_volume', '')::numeric,
      nullif(item->>'horizon_session_move_pct', '')::numeric,
      nullif(item->>'rvol', '')::numeric,
      nullif(item->>'close_position', '')::numeric,
      CASE WHEN item ? 'closed_above_episode_close' THEN (item->>'closed_above_episode_close')::boolean ELSE NULL END,
      CASE WHEN item ? 'closed_below_episode_close' THEN (item->>'closed_below_episode_close')::boolean ELSE NULL END,
      CASE WHEN item ? 'exceeded_episode_high' THEN (item->>'exceeded_episode_high')::boolean ELSE NULL END,
      CASE WHEN item ? 'broke_episode_low' THEN (item->>'broke_episode_low')::boolean ELSE NULL END,
      nullif(item->>'source', '')::text,
      nullif(item->>'source_as_of', '')::timestamptz,
      nullif(item->>'fetched_at', '')::timestamptz,
      nullif(item->>'computed_at', '')::timestamptz,
      coalesce(nullif(item->>'quality', ''), 'UNAVAILABLE'),
      coalesce(nullif(item->>'freshness', ''), 'FRESH'),
      coalesce(nullif(item->>'provenance', ''), 'DERIVED')
    )
    ON CONFLICT (episode_id, horizon) DO UPDATE SET
      security_id = EXCLUDED.security_id,
      reference_timestamp = EXCLUDED.reference_timestamp,
      reference_price = EXCLUDED.reference_price,
      outcome_price = EXCLUDED.outcome_price,
      return_pct = EXCLUDED.return_pct,
      max_gain_pct = EXCLUDED.max_gain_pct,
      max_drawdown_pct = EXCLUDED.max_drawdown_pct,
      high_price = EXCLUDED.high_price,
      low_price = EXCLUDED.low_price,
      data_available = EXCLUDED.data_available,
      availability_state = EXCLUDED.availability_state,
      episode_session_date = EXCLUDED.episode_session_date,
      horizon_session_date = EXCLUDED.horizon_session_date,
      open_to_close_return_pct = EXCLUDED.open_to_close_return_pct,
      gap_pct = EXCLUDED.gap_pct,
      session_volume = EXCLUDED.session_volume,
      horizon_session_move_pct = EXCLUDED.horizon_session_move_pct,
      rvol = EXCLUDED.rvol,
      close_position = EXCLUDED.close_position,
      closed_above_episode_close = EXCLUDED.closed_above_episode_close,
      closed_below_episode_close = EXCLUDED.closed_below_episode_close,
      exceeded_episode_high = EXCLUDED.exceeded_episode_high,
      broke_episode_low = EXCLUDED.broke_episode_low,
      source = EXCLUDED.source,
      source_as_of = EXCLUDED.source_as_of,
      fetched_at = EXCLUDED.fetched_at,
      computed_at = EXCLUDED.computed_at,
      quality = EXCLUDED.quality,
      freshness = EXCLUDED.freshness,
      provenance = EXCLUDED.provenance;
    applied := applied + 1;
  END LOOP;
  RETURN jsonb_build_object('applied', applied);
END;
$$;

CREATE OR REPLACE FUNCTION public.forward_outcome_list_by_episodes_v1(p_episode_ids uuid[])
RETURNS SETOF public.forward_outcomes
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT fo.*
  FROM public.forward_outcomes fo
  WHERE p_episode_ids IS NOT NULL
    AND cardinality(p_episode_ids) > 0
    AND fo.episode_id = ANY (p_episode_ids)
  ORDER BY fo.episode_id, fo.horizon;
$$;

CREATE OR REPLACE FUNCTION public.forward_outcome_aggregate_for_security_v1(p_security_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    'zero_return_d1_count', count(*) FILTER (WHERE horizon = 'D1' AND data_available AND return_pct = 0)
  )
  FROM public.forward_outcomes
  WHERE security_id = p_security_id;
$$;

CREATE OR REPLACE FUNCTION public.forward_outcome_list_candidates_v1(
  p_after_security_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  security_id uuid,
  episode_count bigint,
  outcome_row_count bigint,
  max_history_date date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ep AS (
    SELECT e.security_id, count(*)::bigint AS episode_count
    FROM public.market_behavior_episodes e
    GROUP BY e.security_id
  ),
  fo AS (
    SELECT f.security_id, count(*)::bigint AS outcome_row_count
    FROM public.forward_outcomes f
    GROUP BY f.security_id
  ),
  daily AS (
    SELECT d.security_id, max(d.session_date) AS max_history_date
    FROM public.security_daily_history d
    GROUP BY d.security_id
  )
  SELECT
    ep.security_id,
    ep.episode_count,
    coalesce(fo.outcome_row_count, 0::bigint) AS outcome_row_count,
    daily.max_history_date
  FROM ep
  INNER JOIN daily ON daily.security_id = ep.security_id
  LEFT JOIN fo ON fo.security_id = ep.security_id
  WHERE (p_after_security_id IS NULL OR ep.security_id > p_after_security_id)
    AND coalesce(fo.outcome_row_count, 0) < ep.episode_count * 4
  ORDER BY ep.security_id
  LIMIT greatest(1, least(coalesce(p_limit, 50), 500));
$$;

REVOKE ALL ON FUNCTION public.forward_outcome_apply_batch_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.forward_outcome_list_by_episodes_v1(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.forward_outcome_aggregate_for_security_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.forward_outcome_list_candidates_v1(uuid, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.forward_outcome_apply_batch_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.forward_outcome_list_by_episodes_v1(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.forward_outcome_aggregate_for_security_v1(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.forward_outcome_list_candidates_v1(uuid, integer) TO service_role;

ALTER TABLE public.forward_outcomes ENABLE ROW LEVEL SECURITY;
