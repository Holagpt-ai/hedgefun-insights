-- Resume in-progress NEWS article processing without waiting for poll_interval_seconds.

CREATE OR REPLACE FUNCTION public.catalyst_intel_due_sources(
  p_source_type text,
  p_now timestamptz,
  p_limit integer,
  p_allow text[]
)
RETURNS SETOF public.catalyst_intel_sources
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT s.*
  FROM public.catalyst_intel_sources s
  WHERE s.enabled
    AND (p_source_type IS NULL OR s.source_type = p_source_type)
    AND (s.backoff_until IS NULL OR s.backoff_until <= p_now)
    AND (
      s.last_success_at IS NULL
      OR s.last_success_at + make_interval(secs => s.poll_interval_seconds) <= p_now
      OR (s.metadata ? 'news_feed_continuation')
    )
    AND (
      p_allow IS NULL
      OR cardinality(p_allow) = 0
      OR s.source_key = ANY (p_allow)
      OR s.id::text = ANY (p_allow)
    )
  ORDER BY s.priority DESC, s.last_success_at ASC NULLS FIRST, s.source_key ASC
  LIMIT GREATEST(LEAST(COALESCE(p_limit, 0), 200), 0);
$$;

REVOKE ALL ON FUNCTION public.catalyst_intel_due_sources(text, timestamptz, integer, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalyst_intel_due_sources(text, timestamptz, integer, text[]) TO service_role;

NOTIFY pgrst, 'reload schema';