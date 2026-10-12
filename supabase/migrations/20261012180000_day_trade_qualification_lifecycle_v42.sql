-- Scanner V42: Day Trade qualification lifecycle (ACTIVE / GRACE / EXPIRED monitoring).

CREATE TABLE IF NOT EXISTS public.day_trade_qualification_state (
  session_date date NOT NULL,
  symbol text NOT NULL,
  phase text,
  first_qualified_at timestamptz,
  last_qualified_at timestamptz,
  grace_first_failure_at timestamptz,
  grace_failure_count integer NOT NULL DEFAULT 0,
  expired_at timestamptz,
  expiration_reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  pillar_outcomes jsonb,
  monitored_price numeric,
  monitored_volume bigint,
  provider_as_of timestamptz,
  prior_episodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_snapshot_key text,
  last_market_data_ms bigint,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT day_trade_qualification_state_pkey PRIMARY KEY (session_date, symbol),
  CONSTRAINT day_trade_qualification_state_phase_check CHECK (
    phase IS NULL OR phase IN ('ACTIVE', 'GRACE', 'EXPIRED')
  )
);

CREATE INDEX IF NOT EXISTS day_trade_qualification_state_session_phase_idx
  ON public.day_trade_qualification_state (session_date, phase);

COMMENT ON TABLE public.day_trade_qualification_state IS
  'Server-side Day Trade Five Pillars lifecycle per surveillance session.';

CREATE TABLE IF NOT EXISTS public.day_trade_qualification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date date NOT NULL,
  symbol text NOT NULL,
  event_type text NOT NULL,
  event_at timestamptz NOT NULL,
  dedupe_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT day_trade_qualification_events_type_check CHECK (
    event_type IN ('QUALIFIED', 'GRACE_ENTERED', 'RECOVERED', 'EXPIRED', 'REQUALIFIED')
  ),
  CONSTRAINT day_trade_qualification_events_dedupe_key UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS day_trade_qualification_events_session_symbol_idx
  ON public.day_trade_qualification_events (session_date, symbol, event_at DESC);

ALTER TABLE public.day_trade_qualification_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.day_trade_qualification_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY day_trade_qualification_state_select_authenticated
  ON public.day_trade_qualification_state
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY day_trade_qualification_events_select_authenticated
  ON public.day_trade_qualification_events
  FOR SELECT
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.day_trade_qualification_state_upsert_v1(p_row jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_row IS NULL OR coalesce(nullif(p_row->>'symbol', ''), '') = '' THEN
    RAISE EXCEPTION 'symbol is required';
  END IF;
  IF p_row->>'session_date' IS NULL THEN
    RAISE EXCEPTION 'session_date is required';
  END IF;

  INSERT INTO public.day_trade_qualification_state (
    session_date,
    symbol,
    phase,
    first_qualified_at,
    last_qualified_at,
    grace_first_failure_at,
    grace_failure_count,
    expired_at,
    expiration_reason_codes,
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
    nullif(p_row->>'phase', ''),
    nullif(p_row->>'first_qualified_at', '')::timestamptz,
    nullif(p_row->>'last_qualified_at', '')::timestamptz,
    nullif(p_row->>'grace_first_failure_at', '')::timestamptz,
    coalesce((p_row->>'grace_failure_count')::integer, 0),
    nullif(p_row->>'expired_at', '')::timestamptz,
    coalesce(p_row->'expiration_reason_codes', '[]'::jsonb),
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
    phase = EXCLUDED.phase,
    first_qualified_at = EXCLUDED.first_qualified_at,
    last_qualified_at = EXCLUDED.last_qualified_at,
    grace_first_failure_at = EXCLUDED.grace_first_failure_at,
    grace_failure_count = EXCLUDED.grace_failure_count,
    expired_at = EXCLUDED.expired_at,
    expiration_reason_codes = EXCLUDED.expiration_reason_codes,
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

CREATE OR REPLACE FUNCTION public.day_trade_qualification_event_insert_v1(p_row jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_row IS NULL OR coalesce(nullif(p_row->>'dedupe_key', ''), '') = '' THEN
    RAISE EXCEPTION 'dedupe_key is required';
  END IF;

  INSERT INTO public.day_trade_qualification_events (
    session_date,
    symbol,
    event_type,
    event_at,
    dedupe_key,
    payload
  ) VALUES (
    (p_row->>'session_date')::date,
    upper(trim(p_row->>'symbol')),
    p_row->>'event_type',
    (p_row->>'event_at')::timestamptz,
    p_row->>'dedupe_key',
    coalesce(p_row->'payload', '{}'::jsonb)
  )
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.day_trade_qualification_list_v1(p_session_date date)
RETURNS SETOF public.day_trade_qualification_state
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.day_trade_qualification_state
  WHERE session_date = p_session_date
  ORDER BY symbol ASC;
$$;

REVOKE ALL ON FUNCTION public.day_trade_qualification_state_upsert_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.day_trade_qualification_event_insert_v1(jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.day_trade_qualification_state_upsert_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.day_trade_qualification_event_insert_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.day_trade_qualification_list_v1(date) TO authenticated, service_role;
