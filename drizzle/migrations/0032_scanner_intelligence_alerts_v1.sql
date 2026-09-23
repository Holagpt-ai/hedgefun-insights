-- Alert Intelligence V1: durable scanner event alerts with historical + catalyst enrichment.

CREATE TABLE IF NOT EXISTS public.scanner_intelligence_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL UNIQUE,
  symbol text NOT NULL,
  trading_date date NOT NULL,
  session_kind text NOT NULL,
  event_type text NOT NULL,
  event_at timestamptz NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  price numeric,
  move_pct numeric,
  today_volume numeric,
  prior_volume numeric,
  vol_prior numeric,
  rvol_5m numeric,
  volume_velocity numeric,
  volume_acceleration_pct numeric,
  distance_from_hod_pct numeric,
  historical_match_count integer,
  last_significant_episode_date date,
  last_significant_episode_id uuid,
  last_episode_move_pct numeric,
  last_episode_volume numeric,
  last_episode_hod_time timestamptz,
  comparable_episode_count integer,
  historical_catalyst_type text,
  catalyst_type text,
  catalyst_id uuid,
  headline text NOT NULL,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scanner_intelligence_alerts_event_type_check CHECK (
    event_type IN ('HOD_MOMENTUM', 'RUNNING_UP', 'VOLUME_EXPLOSION')
  ),
  CONSTRAINT scanner_intelligence_alerts_severity_check CHECK (
    severity IN ('info', 'attention', 'high')
  )
);

CREATE INDEX IF NOT EXISTS scanner_intelligence_alerts_event_at_idx
  ON public.scanner_intelligence_alerts (event_at DESC);

CREATE INDEX IF NOT EXISTS scanner_intelligence_alerts_symbol_idx
  ON public.scanner_intelligence_alerts (symbol, event_at DESC);

ALTER TABLE public.scanner_intelligence_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY scanner_intelligence_alerts_select_authenticated
  ON public.scanner_intelligence_alerts
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TABLE IF NOT EXISTS public.scanner_intelligence_alert_user_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  alert_id uuid NOT NULL REFERENCES public.scanner_intelligence_alerts (id) ON DELETE CASCADE,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scanner_alert_user_state_user_alert_key UNIQUE (user_id, alert_id)
);

ALTER TABLE public.scanner_intelligence_alert_user_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY scanner_alert_user_state_own_rows
  ON public.scanner_intelligence_alert_user_state
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.scanner_intelligence_alert_upsert_v1(p_row jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_row IS NULL OR coalesce(nullif(p_row->>'dedupe_key', ''), '') = '' THEN
    RAISE EXCEPTION 'dedupe_key is required';
  END IF;
  IF coalesce(nullif(p_row->>'symbol', ''), '') = '' THEN
    RAISE EXCEPTION 'symbol is required';
  END IF;

  INSERT INTO public.scanner_intelligence_alerts (
    dedupe_key,
    symbol,
    trading_date,
    session_kind,
    event_type,
    event_at,
    severity,
    price,
    move_pct,
    today_volume,
    prior_volume,
    vol_prior,
    rvol_5m,
    volume_velocity,
    volume_acceleration_pct,
    distance_from_hod_pct,
    historical_match_count,
    last_significant_episode_date,
    last_significant_episode_id,
    last_episode_move_pct,
    last_episode_volume,
    last_episode_hod_time,
    comparable_episode_count,
    historical_catalyst_type,
    catalyst_type,
    catalyst_id,
    headline,
    summary,
    metadata
  ) VALUES (
    p_row->>'dedupe_key',
    upper(trim(p_row->>'symbol')),
    (p_row->>'trading_date')::date,
    p_row->>'session_kind',
    p_row->>'event_type',
    (p_row->>'event_at')::timestamptz,
    coalesce(nullif(p_row->>'severity', ''), 'info'),
    NULLIF(p_row->>'price', '')::numeric,
    NULLIF(p_row->>'move_pct', '')::numeric,
    NULLIF(p_row->>'today_volume', '')::numeric,
    NULLIF(p_row->>'prior_volume', '')::numeric,
    NULLIF(p_row->>'vol_prior', '')::numeric,
    NULLIF(p_row->>'rvol_5m', '')::numeric,
    NULLIF(p_row->>'volume_velocity', '')::numeric,
    NULLIF(p_row->>'volume_acceleration_pct', '')::numeric,
    NULLIF(p_row->>'distance_from_hod_pct', '')::numeric,
    NULLIF(p_row->>'historical_match_count', '')::integer,
    NULLIF(p_row->>'last_significant_episode_date', '')::date,
    NULLIF(p_row->>'last_significant_episode_id', '')::uuid,
    NULLIF(p_row->>'last_episode_move_pct', '')::numeric,
    NULLIF(p_row->>'last_episode_volume', '')::numeric,
    NULLIF(p_row->>'last_episode_hod_time', '')::timestamptz,
    NULLIF(p_row->>'comparable_episode_count', '')::integer,
    NULLIF(p_row->>'historical_catalyst_type', ''),
    NULLIF(p_row->>'catalyst_type', ''),
    NULLIF(p_row->>'catalyst_id', '')::uuid,
    p_row->>'headline',
    p_row->>'summary',
    coalesce(p_row->'metadata', '{}'::jsonb)
  )
  ON CONFLICT (dedupe_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.scanner_intelligence_alert_upsert_v1(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.scanner_intelligence_alert_upsert_v1(jsonb) TO service_role;
