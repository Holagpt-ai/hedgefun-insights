-- Paginated public catalyst RPC + status/impact projection (prepared for Lovable apply only).

DROP FUNCTION IF EXISTS public.public_catalyst_calendar_range_v1(date, date);

CREATE OR REPLACE FUNCTION public.public_catalyst_calendar_range_v1(
  p_from date,
  p_to date,
  p_limit integer DEFAULT 500,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 500);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_total integer;
  v_rows jsonb;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to OR (p_to - p_from) > 62 THEN
    RAISE EXCEPTION 'invalid_range';
  END IF;

  SELECT count(*)::integer INTO v_total
  FROM public.catalyst_events ce
  WHERE ce.verification_state = 'provider_reported'
    AND ce.event_date >= p_from
    AND ce.event_date <= p_to;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      ce.id,
      ce.dedupe_key,
      ce.symbol,
      ce.company_name,
      ce.event_type,
      ce.event_date,
      ce.event_time,
      ce.time_of_day,
      ce.title,
      ce.description,
      ce.source_name,
      ce.source_url,
      ce.provider,
      ce.related_symbols,
      ce.published_at,
      CASE
        WHEN jsonb_typeof(ce.facts) = 'object'
          AND (ce.facts ->> 'attribution_class') IN (
            'direct', 'provider_associated', 'sector_related', 'unverified'
          )
        THEN ce.facts ->> 'attribution_class'
        ELSE NULL
      END AS attribution_class,
      CASE
        WHEN jsonb_typeof(ce.facts) = 'object'
          AND (ce.facts ->> 'ticker_specific') IN ('true', 'false')
        THEN (ce.facts ->> 'ticker_specific')::boolean
        ELSE NULL
      END AS ticker_specific,
      CASE
        WHEN lower(coalesce(ce.facts ->> 'status', '')) IN ('cancelled', 'canceled') THEN 'cancelled'
        WHEN ce.facts ->> 'earnings_disposition' = 'results_reported' THEN 'reported'
        WHEN ce.facts ->> 'earnings_disposition' = 'schedule_announced' THEN 'scheduled'
        WHEN ce.facts ? 'reported_at' OR ce.facts ? 'actual_eps' OR ce.facts ? 'eps' THEN 'reported'
        ELSE 'unknown'
      END AS event_status,
      CASE
        WHEN lower(coalesce(ce.facts ->> 'impact', '')) IN ('high', 'medium', 'low')
        THEN lower(ce.facts ->> 'impact')
        ELSE NULL
      END AS impact_level,
      (
        lower(coalesce(ce.facts ->> 'impact', '')) IN ('high', 'medium', 'low')
        OR ce.facts ? 'impact_score'
      ) AS has_impact_evidence
    FROM public.catalyst_events ce
    WHERE ce.verification_state = 'provider_reported'
      AND ce.event_date >= p_from
      AND ce.event_date <= p_to
    ORDER BY ce.event_date ASC, ce.event_time ASC NULLS LAST, ce.title ASC
    LIMIT v_limit
    OFFSET v_offset
  ) t;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'total_count', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'has_more', (v_offset + v_limit) < v_total,
    'coverage_incomplete', v_total > v_limit
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.public_catalyst_calendar_range_v1(date, date, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_catalyst_calendar_range_v1(date, date, integer, integer) TO anon, authenticated;