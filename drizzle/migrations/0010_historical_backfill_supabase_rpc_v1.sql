-- Atomic Historical Intelligence writes for Supabase Data API callers (service_role only).
-- Does not change RLS policies or table definitions.

CREATE OR REPLACE FUNCTION public.historical_daily_facts_match(
  p_existing public.security_daily_history,
  p_row jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_existing.observed_symbol IS NOT DISTINCT FROM nullif(p_row->>'observed_symbol', '')::text
    AND p_existing.exchange IS NOT DISTINCT FROM nullif(p_row->>'exchange', '')::text
    AND p_existing.open IS NOT DISTINCT FROM nullif(p_row->>'open', '')::numeric
    AND p_existing.high IS NOT DISTINCT FROM nullif(p_row->>'high', '')::numeric
    AND p_existing.low IS NOT DISTINCT FROM nullif(p_row->>'low', '')::numeric
    AND p_existing.close IS NOT DISTINCT FROM nullif(p_row->>'close', '')::numeric
    AND p_existing.volume IS NOT DISTINCT FROM nullif(p_row->>'volume', '')::numeric
    AND p_existing.dollar_volume IS NOT DISTINCT FROM nullif(p_row->>'dollar_volume', '')::numeric
    AND p_existing.previous_close IS NOT DISTINCT FROM nullif(p_row->>'previous_close', '')::numeric
    AND p_existing.move_pct IS NOT DISTINCT FROM nullif(p_row->>'move_pct', '')::numeric
    AND p_existing.source IS NOT DISTINCT FROM nullif(p_row->>'source', '')::text
    AND p_existing.quality::text IS NOT DISTINCT FROM p_row->>'quality'
    AND p_existing.provenance::text IS NOT DISTINCT FROM p_row->>'provenance';
$$;

CREATE OR REPLACE FUNCTION public.historical_apply_daily_batch(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  existing public.security_daily_history%ROWTYPE;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a jsonb array';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) AS t(value)
  LOOP
    SELECT * INTO existing
    FROM public.security_daily_history
    WHERE security_id = (item->>'security_id')::uuid
      AND session_date = (item->>'session_date')::date;
    IF FOUND THEN
      IF NOT public.historical_daily_facts_match(existing, item) THEN
        RAISE EXCEPTION 'conflicting daily history for securityId and sessionDate';
      END IF;
    ELSE
      INSERT INTO public.security_daily_history (
        security_id, session_date, observed_symbol, exchange, open, high, low, close, volume,
        dollar_volume, previous_close, move_pct, source, source_as_of, fetched_at, computed_at,
        quality, freshness, provenance
      ) VALUES (
        (item->>'security_id')::uuid,
        (item->>'session_date')::date,
        nullif(item->>'observed_symbol', '')::text,
        nullif(item->>'exchange', '')::text,
        nullif(item->>'open', '')::numeric,
        nullif(item->>'high', '')::numeric,
        nullif(item->>'low', '')::numeric,
        nullif(item->>'close', '')::numeric,
        nullif(item->>'volume', '')::numeric,
        nullif(item->>'dollar_volume', '')::numeric,
        nullif(item->>'previous_close', '')::numeric,
        nullif(item->>'move_pct', '')::numeric,
        nullif(item->>'source', '')::text,
        nullif(item->>'source_as_of', '')::timestamptz,
        nullif(item->>'fetched_at', '')::timestamptz,
        nullif(item->>'computed_at', '')::timestamptz,
        item->>'quality',
        item->>'freshness',
        item->>'provenance'
      );
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.historical_apply_episode_batch(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a jsonb array';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) AS t(value)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.market_behavior_episodes e
      WHERE e.security_id = (item->>'security_id')::uuid
        AND e.detected_by IS NOT DISTINCT FROM nullif(item->>'detected_by', '')::text
        AND e.episode_start = nullif(item->>'episode_start', '')::timestamptz
    ) THEN
      CONTINUE;
    END IF;
    INSERT INTO public.market_behavior_episodes (
      episode_id, security_id, episode_start, episode_end, observed_symbol, direction, tier,
      start_price, high_price, low_price, end_price, max_positive_move_pct, max_negative_move_pct,
      volume, dollar_volume, rvol, float_turnover, halt_count, close_strength, detected_by, origin,
      source, source_as_of, fetched_at, computed_at, quality, freshness, provenance, created_at, updated_at
    ) VALUES (
      (item->>'episode_id')::uuid,
      (item->>'security_id')::uuid,
      nullif(item->>'episode_start', '')::timestamptz,
      nullif(item->>'episode_end', '')::timestamptz,
      nullif(item->>'observed_symbol', '')::text,
      item->>'direction',
      item->>'tier',
      nullif(item->>'start_price', '')::numeric,
      nullif(item->>'high_price', '')::numeric,
      nullif(item->>'low_price', '')::numeric,
      nullif(item->>'end_price', '')::numeric,
      nullif(item->>'max_positive_move_pct', '')::numeric,
      nullif(item->>'max_negative_move_pct', '')::numeric,
      nullif(item->>'volume', '')::numeric,
      nullif(item->>'dollar_volume', '')::numeric,
      nullif(item->>'rvol', '')::numeric,
      nullif(item->>'float_turnover', '')::numeric,
      nullif(item->>'halt_count', '')::numeric,
      nullif(item->>'close_strength', '')::numeric,
      nullif(item->>'detected_by', '')::text,
      item->>'origin',
      nullif(item->>'source', '')::text,
      nullif(item->>'source_as_of', '')::timestamptz,
      nullif(item->>'fetched_at', '')::timestamptz,
      nullif(item->>'computed_at', '')::timestamptz,
      item->>'quality',
      item->>'freshness',
      item->>'provenance',
      nullif(item->>'created_at', '')::timestamptz,
      nullif(item->>'updated_at', '')::timestamptz
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.historical_identity_apply_diff(
  p_securities jsonb,
  p_history_inserts jsonb,
  p_history_updates jsonb,
  p_identifier_inserts jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
BEGIN
  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p_securities, '[]'::jsonb)) AS t(value)
  LOOP
    INSERT INTO public.securities (
      security_id, current_symbol, issuer_name, security_type, exchange, country,
      adr_status, active, resolution_state, created_at, updated_at
    ) VALUES (
      (item->>'security_id')::uuid,
      item->>'current_symbol',
      nullif(item->>'issuer_name', '')::text,
      item->>'security_type',
      nullif(item->>'exchange', '')::text,
      nullif(item->>'country', '')::text,
      item->>'adr_status',
      (item->>'active')::boolean,
      item->>'resolution_state',
      nullif(item->>'created_at', '')::timestamptz,
      nullif(item->>'updated_at', '')::timestamptz
    )
    ON CONFLICT (security_id) DO UPDATE SET
      current_symbol = excluded.current_symbol,
      issuer_name = excluded.issuer_name,
      security_type = excluded.security_type,
      exchange = excluded.exchange,
      country = excluded.country,
      adr_status = excluded.adr_status,
      active = excluded.active,
      resolution_state = excluded.resolution_state,
      updated_at = excluded.updated_at;
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p_history_inserts, '[]'::jsonb)) AS t(value)
  LOOP
    INSERT INTO public.security_symbol_history (
      history_id, security_id, symbol, exchange, effective_from, effective_to,
      source, source_as_of, provenance, observed_at, fetched_at
    ) VALUES (
      coalesce(nullif(item->>'history_id', '')::uuid, gen_random_uuid()),
      (item->>'security_id')::uuid,
      item->>'symbol',
      nullif(item->>'exchange', '')::text,
      (item->>'effective_from')::date,
      nullif(item->>'effective_to', '')::date,
      nullif(item->>'source', '')::text,
      nullif(item->>'source_as_of', '')::timestamptz,
      item->>'provenance',
      nullif(item->>'observed_at', '')::timestamptz,
      nullif(item->>'fetched_at', '')::timestamptz
    );
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p_history_updates, '[]'::jsonb)) AS t(value)
  LOOP
    UPDATE public.security_symbol_history
    SET effective_to = nullif(item->>'effective_to', '')::date
    WHERE security_id = (item->>'security_id')::uuid
      AND symbol = item->>'symbol'
      AND coalesce(exchange, '') = coalesce(nullif(item->>'exchange', '')::text, '')
      AND effective_from = (item->>'effective_from')::date;
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p_identifier_inserts, '[]'::jsonb)) AS t(value)
  LOOP
    INSERT INTO public.security_reference_identifiers (
      security_id, identifier_kind, identifier_value, source, source_as_of, provenance, observed_at, fetched_at
    ) VALUES (
      (item->>'security_id')::uuid,
      item->>'identifier_kind',
      item->>'identifier_value',
      nullif(item->>'source', '')::text,
      nullif(item->>'source_as_of', '')::timestamptz,
      item->>'provenance',
      nullif(item->>'observed_at', '')::timestamptz,
      nullif(item->>'fetched_at', '')::timestamptz
    )
    ON CONFLICT (security_id, identifier_kind) DO NOTHING;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.historical_find_interrupted_backfill_job(
  p_date_from date,
  p_date_to date
)
RETURNS TABLE(job_id uuid, state text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT j.job_id, j.state::text
  FROM public.security_backfill_jobs j
  WHERE j.state IN ('RUNNING', 'PAUSED', 'FAILED')
    AND j.date_from = p_date_from
    AND j.date_to = p_date_to
  ORDER BY j.updated_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.historical_rollout_backfilled_symbols(
  p_date_from date,
  p_date_to date,
  p_min_sessions int
)
RETURNS TABLE(symbol text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.current_symbol AS symbol
  FROM public.securities s
  INNER JOIN (
    SELECT security_id, count(*)::int AS n
    FROM public.security_daily_history
    WHERE session_date >= p_date_from AND session_date <= p_date_to
    GROUP BY security_id
  ) h ON h.security_id = s.security_id
  WHERE h.n >= p_min_sessions;
$$;

REVOKE ALL ON FUNCTION public.historical_find_interrupted_backfill_job(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.historical_rollout_backfilled_symbols(date, date, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.historical_find_interrupted_backfill_job(date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.historical_rollout_backfilled_symbols(date, date, int) TO service_role;

REVOKE ALL ON FUNCTION public.historical_apply_daily_batch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.historical_apply_episode_batch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.historical_identity_apply_diff(jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.historical_apply_daily_batch(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.historical_apply_episode_batch(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.historical_identity_apply_diff(jsonb, jsonb, jsonb, jsonb) TO service_role;
