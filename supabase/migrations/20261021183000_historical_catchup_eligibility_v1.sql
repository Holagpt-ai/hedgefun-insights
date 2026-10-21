-- Batch 33: incremental historical catch-up eligibility (backwards-compatible add-on).
-- Apply on production before using catch-up RPC from Fly; does not alter existing rollout RPC.

CREATE OR REPLACE FUNCTION public.historical_rollout_symbols_current_through(
  p_date_from date,
  p_date_to date
)
RETURNS TABLE(symbol text, latest_session date, session_count int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.current_symbol AS symbol,
    max(h.session_date) AS latest_session,
    count(*)::int AS session_count
  FROM public.securities s
  INNER JOIN public.security_daily_history h
    ON h.security_id = s.security_id
   AND h.session_date >= p_date_from
   AND h.session_date <= p_date_to
  GROUP BY s.security_id, s.current_symbol;
$$;

REVOKE ALL ON FUNCTION public.historical_rollout_symbols_current_through(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.historical_rollout_symbols_current_through(date, date) TO service_role;
