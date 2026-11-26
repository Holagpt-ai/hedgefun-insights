-- Public Catalyst Calendar: bounded RPC read — no anon SELECT on catalyst_events.
-- Prepared for Lovable Cloud apply only (not executed from Cursor).

-- Remove prior broad anon table access if this migration is re-applied.
REVOKE SELECT ON public.catalyst_events FROM anon;
DROP POLICY IF EXISTS "catalyst_events anon calendar read" ON public.catalyst_events;

CREATE OR REPLACE FUNCTION public.public_catalyst_calendar_range_v1(
  p_from date,
  p_to date
)
RETURNS TABLE (
  id uuid,
  dedupe_key text,
  symbol text,
  company_name text,
  event_type text,
  event_date date,
  event_time time without time zone,
  time_of_day text,
  title text,
  description text,
  source_name text,
  source_url text,
  provider text,
  related_symbols text[],
  published_at timestamptz,
  attribution_class text,
  ticker_specific boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    END AS ticker_specific
  FROM public.catalyst_events ce
  WHERE ce.verification_state = 'provider_reported'
    AND p_from IS NOT NULL
    AND p_to IS NOT NULL
    AND p_from <= p_to
    AND p_to - p_from <= 62
    AND ce.event_date >= p_from
    AND ce.event_date <= p_to
  ORDER BY ce.event_date ASC, ce.event_time ASC NULLS LAST, ce.title ASC
  LIMIT 1000;
$$;

COMMENT ON FUNCTION public.public_catalyst_calendar_range_v1(date, date) IS
  'Public-safe catalyst calendar projection: provider_reported rows only; no raw facts JSON.';

REVOKE ALL ON FUNCTION public.public_catalyst_calendar_range_v1(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_catalyst_calendar_range_v1(date, date) TO anon, authenticated;