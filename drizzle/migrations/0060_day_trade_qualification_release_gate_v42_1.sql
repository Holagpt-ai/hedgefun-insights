-- V42.1 release gate: monotonic upserts, desk-departure reason, function ACLs.

ALTER TABLE public.day_trade_qualification_state
  DROP CONSTRAINT IF EXISTS day_trade_qualification_state_desk_departure_reason_check;

ALTER TABLE public.day_trade_qualification_state
  ADD CONSTRAINT day_trade_qualification_state_desk_departure_reason_check CHECK (
    last_desk_departure_reason IS NULL OR last_desk_departure_reason IN (
      'PILLAR_EXPIRED',
      'PILLARS_IN_GRACE',
      'FRESHNESS_DISQUALIFIED',
      'OPPORTUNITY_BELOW_THRESHOLD',
      'TOP10_DISPLACED',
      'DESK_SELECTION_EXCLUDED'
    )
  );

CREATE OR REPLACE FUNCTION public.day_trade_qualification_state_upsert_v1(p_row jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_date date;
  v_symbol text;
  v_market_ms bigint;
BEGIN
  IF p_row IS NULL OR coalesce(nullif(p_row->>'symbol', ''), '') = '' THEN
    RAISE EXCEPTION 'symbol is required';
  END IF;
  IF p_row->>'session_date' IS NULL THEN
    RAISE EXCEPTION 'session_date is required';
  END IF;

  v_session_date := (p_row->>'session_date')::date;
  v_symbol := upper(trim(p_row->>'symbol'));
  v_market_ms := nullif(p_row->>'last_market_data_ms', '')::bigint;

  INSERT INTO public.day_trade_qualification_state (
    session_date,
    symbol,
    phase,
    expired_at,
    expiration_reason_codes,
    pillar_phase,
    first_qualified_at,
    last_qualified_at,
    grace_first_failure_at,
    grace_failure_count,
    pillar_expired_at,
    pillar_expiration_reason_codes,
    ever_on_desk,
    currently_on_desk,
    first_desk_at,
    last_desk_at,
    last_desk_departure_at,
    last_desk_departure_reason,
    five_pillars_pass,
    monitoring_eligible,
    monitoring_data_status,
    pillar_outcomes,
    monitored_price,
    monitored_volume,
    provider_as_of,
    prior_episodes,
    last_snapshot_key,
    last_market_data_ms,
    updated_at
  ) VALUES (
    v_session_date,
    v_symbol,
    nullif(p_row->>'pillar_phase', ''),
    nullif(p_row->>'pillar_expired_at', '')::timestamptz,
    coalesce(p_row->'pillar_expiration_reason_codes', '[]'::jsonb),
    nullif(p_row->>'pillar_phase', ''),
    nullif(p_row->>'first_qualified_at', '')::timestamptz,
    nullif(p_row->>'last_qualified_at', '')::timestamptz,
    nullif(p_row->>'grace_first_failure_at', '')::timestamptz,
    coalesce((p_row->>'grace_failure_count')::integer, 0),
    nullif(p_row->>'pillar_expired_at', '')::timestamptz,
    coalesce(p_row->'pillar_expiration_reason_codes', '[]'::jsonb),
    coalesce((p_row->>'ever_on_desk')::boolean, false),
    coalesce((p_row->>'currently_on_desk')::boolean, false),
    nullif(p_row->>'first_desk_at', '')::timestamptz,
    nullif(p_row->>'last_desk_at', '')::timestamptz,
    nullif(p_row->>'last_desk_departure_at', '')::timestamptz,
    nullif(p_row->>'last_desk_departure_reason', ''),
    coalesce((p_row->>'five_pillars_pass')::boolean, false),
    coalesce((p_row->>'monitoring_eligible')::boolean, false),
    coalesce(nullif(p_row->>'monitoring_data_status', ''), 'UNAVAILABLE'),
    p_row->'pillar_outcomes',
    nullif(p_row->>'monitored_price', '')::numeric,
    nullif(p_row->>'monitored_volume', '')::bigint,
    nullif(p_row->>'provider_as_of', '')::timestamptz,
    coalesce(p_row->'prior_episodes', '[]'::jsonb),
    nullif(p_row->>'last_snapshot_key', ''),
    v_market_ms,
    now()
  )
  ON CONFLICT (session_date, symbol) DO UPDATE SET
    phase = EXCLUDED.pillar_phase,
    expired_at = EXCLUDED.pillar_expired_at,
    expiration_reason_codes = EXCLUDED.pillar_expiration_reason_codes,
    pillar_phase = EXCLUDED.pillar_phase,
    first_qualified_at = EXCLUDED.first_qualified_at,
    last_qualified_at = EXCLUDED.last_qualified_at,
    grace_first_failure_at = EXCLUDED.grace_first_failure_at,
    grace_failure_count = EXCLUDED.grace_failure_count,
    pillar_expired_at = EXCLUDED.pillar_expired_at,
    pillar_expiration_reason_codes = EXCLUDED.pillar_expiration_reason_codes,
    ever_on_desk = EXCLUDED.ever_on_desk,
    currently_on_desk = EXCLUDED.currently_on_desk,
    first_desk_at = EXCLUDED.first_desk_at,
    last_desk_at = EXCLUDED.last_desk_at,
    last_desk_departure_at = EXCLUDED.last_desk_departure_at,
    last_desk_departure_reason = EXCLUDED.last_desk_departure_reason,
    five_pillars_pass = EXCLUDED.five_pillars_pass,
    monitoring_eligible = EXCLUDED.monitoring_eligible,
    monitoring_data_status = EXCLUDED.monitoring_data_status,
    pillar_outcomes = EXCLUDED.pillar_outcomes,
    monitored_price = EXCLUDED.monitored_price,
    monitored_volume = EXCLUDED.monitored_volume,
    provider_as_of = EXCLUDED.provider_as_of,
    prior_episodes = EXCLUDED.prior_episodes,
    last_snapshot_key = EXCLUDED.last_snapshot_key,
    last_market_data_ms = EXCLUDED.last_market_data_ms,
    updated_at = now()
  WHERE public.day_trade_qualification_state.last_market_data_ms IS NULL
     OR EXCLUDED.last_market_data_ms IS NULL
     OR EXCLUDED.last_market_data_ms >= public.day_trade_qualification_state.last_market_data_ms;
END;
$$;

REVOKE ALL ON FUNCTION public.day_trade_qualification_state_upsert_v1(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.day_trade_qualification_event_insert_v1(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.day_trade_qualification_apply_batch_v1(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.day_trade_qualification_list_v1(date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.day_trade_qualification_state_upsert_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.day_trade_qualification_event_insert_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.day_trade_qualification_apply_batch_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.day_trade_qualification_list_v1(date) TO authenticated, service_role;
