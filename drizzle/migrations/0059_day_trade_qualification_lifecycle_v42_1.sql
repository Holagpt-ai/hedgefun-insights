-- Scanner V42.1 (backward-compatible): additive pillar_* columns + desk/monitoring fields.
-- Production may already have V42 legacy columns (phase, expired_at, expiration_reason_codes).

ALTER TABLE public.day_trade_qualification_state
  ADD COLUMN IF NOT EXISTS pillar_phase text,
  ADD COLUMN IF NOT EXISTS pillar_expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS pillar_expiration_reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ever_on_desk boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS currently_on_desk boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_desk_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_desk_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_desk_departure_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_desk_departure_reason text,
  ADD COLUMN IF NOT EXISTS five_pillars_pass boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS monitoring_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS monitoring_data_status text NOT NULL DEFAULT 'UNAVAILABLE';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'day_trade_qualification_state'
      AND column_name = 'phase'
  ) THEN
    UPDATE public.day_trade_qualification_state
    SET
      pillar_phase = COALESCE(pillar_phase, phase),
      pillar_expired_at = COALESCE(pillar_expired_at, expired_at),
      pillar_expiration_reason_codes = CASE
        WHEN pillar_expiration_reason_codes IS NULL
          OR pillar_expiration_reason_codes = '[]'::jsonb
        THEN COALESCE(expiration_reason_codes, '[]'::jsonb)
        ELSE pillar_expiration_reason_codes
      END
    WHERE pillar_phase IS NULL
       OR pillar_expired_at IS NULL
       OR pillar_expiration_reason_codes IS NULL
       OR pillar_expiration_reason_codes = '[]'::jsonb;
  END IF;
END $$;

ALTER TABLE public.day_trade_qualification_state
  DROP CONSTRAINT IF EXISTS day_trade_qualification_state_pillar_phase_check;

ALTER TABLE public.day_trade_qualification_state
  ADD CONSTRAINT day_trade_qualification_state_pillar_phase_check CHECK (
    pillar_phase IS NULL OR pillar_phase IN ('ACTIVE', 'GRACE', 'EXPIRED')
  );

ALTER TABLE public.day_trade_qualification_state
  DROP CONSTRAINT IF EXISTS day_trade_qualification_state_desk_departure_reason_check;

ALTER TABLE public.day_trade_qualification_state
  ADD CONSTRAINT day_trade_qualification_state_desk_departure_reason_check CHECK (
    last_desk_departure_reason IS NULL OR last_desk_departure_reason IN (
      'PILLAR_EXPIRED',
      'FRESHNESS_DISQUALIFIED',
      'OPPORTUNITY_BELOW_THRESHOLD',
      'TOP10_DISPLACED',
      'DESK_SELECTION_EXCLUDED'
    )
  );

ALTER TABLE public.day_trade_qualification_state
  DROP CONSTRAINT IF EXISTS day_trade_qualification_state_monitoring_data_status_check;

ALTER TABLE public.day_trade_qualification_state
  ADD CONSTRAINT day_trade_qualification_state_monitoring_data_status_check CHECK (
    monitoring_data_status IN ('LIVE', 'STALE', 'UNAVAILABLE')
  );

ALTER TABLE public.day_trade_qualification_events
  DROP CONSTRAINT IF EXISTS day_trade_qualification_events_type_check;

ALTER TABLE public.day_trade_qualification_events
  ADD CONSTRAINT day_trade_qualification_events_type_check CHECK (
    event_type IN (
      'QUALIFIED', 'GRACE_ENTERED', 'RECOVERED', 'EXPIRED', 'REQUALIFIED',
      'DESK_ENTERED', 'DESK_EXITED', 'DESK_REENTERED'
    )
  );

CREATE OR REPLACE FUNCTION public.day_trade_qualification_state_upsert_v1(p_row jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pillar_phase text;
  v_pillar_expired_at timestamptz;
  v_pillar_expiration_reason_codes jsonb;
BEGIN
  IF p_row IS NULL OR coalesce(nullif(p_row->>'symbol', ''), '') = '' THEN
    RAISE EXCEPTION 'symbol is required';
  END IF;
  IF p_row->>'session_date' IS NULL THEN
    RAISE EXCEPTION 'session_date is required';
  END IF;

  v_pillar_phase := nullif(p_row->>'pillar_phase', '');
  v_pillar_expired_at := nullif(p_row->>'pillar_expired_at', '')::timestamptz;
  v_pillar_expiration_reason_codes := coalesce(p_row->'pillar_expiration_reason_codes', '[]'::jsonb);

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
    (p_row->>'session_date')::date,
    upper(trim(p_row->>'symbol')),
    v_pillar_phase,
    v_pillar_expired_at,
    v_pillar_expiration_reason_codes,
    v_pillar_phase,
    nullif(p_row->>'first_qualified_at', '')::timestamptz,
    nullif(p_row->>'last_qualified_at', '')::timestamptz,
    nullif(p_row->>'grace_first_failure_at', '')::timestamptz,
    coalesce((p_row->>'grace_failure_count')::integer, 0),
    v_pillar_expired_at,
    v_pillar_expiration_reason_codes,
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
    nullif(p_row->>'last_market_data_ms', '')::bigint,
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
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.day_trade_qualification_apply_batch_v1(p_batch jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  ev jsonb;
  applied integer := 0;
BEGIN
  IF p_batch IS NULL OR jsonb_typeof(p_batch) <> 'array' THEN
    RAISE EXCEPTION 'batch must be a json array';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_batch)
  LOOP
    PERFORM public.day_trade_qualification_state_upsert_v1(item -> 'state');
    IF item ? 'events' AND jsonb_typeof(item -> 'events') = 'array' THEN
      FOR ev IN SELECT value FROM jsonb_array_elements(item -> 'events')
      LOOP
        PERFORM public.day_trade_qualification_event_insert_v1(ev);
      END LOOP;
    END IF;
    applied := applied + 1;
  END LOOP;

  RETURN applied;
END;
$$;

REVOKE ALL ON FUNCTION public.day_trade_qualification_apply_batch_v1(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.day_trade_qualification_apply_batch_v1(jsonb) TO service_role;
