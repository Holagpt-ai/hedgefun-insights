-- User-owned price alerts V1 (deterministic thresholds, in-app delivery log).

CREATE TABLE IF NOT EXISTS public.user_price_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  symbol text NOT NULL,
  condition_type text NOT NULL,
  threshold numeric NOT NULL,
  reference_price numeric,
  note text,
  status text NOT NULL DEFAULT 'active',
  recurrence text NOT NULL DEFAULT 'recurring',
  cooldown_minutes integer NOT NULL DEFAULT 60,
  armed boolean NOT NULL DEFAULT true,
  last_observed_price numeric,
  last_triggered_at timestamptz,
  last_evaluated_at timestamptz,
  last_quote_price numeric,
  last_quote_at timestamptz,
  data_latency text NOT NULL DEFAULT 'unknown',
  market_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_price_alerts_symbol_format CHECK (symbol ~ '^[A-Z][A-Z0-9.-]{0,14}$'),
  CONSTRAINT user_price_alerts_condition_check CHECK (
    condition_type IN ('price_above', 'price_below', 'percent_move_up', 'percent_move_down')
  ),
  CONSTRAINT user_price_alerts_threshold_positive CHECK (threshold > 0),
  CONSTRAINT user_price_alerts_status_check CHECK (status IN ('active', 'paused')),
  CONSTRAINT user_price_alerts_recurrence_check CHECK (recurrence IN ('one_time', 'recurring')),
  CONSTRAINT user_price_alerts_cooldown_nonneg CHECK (cooldown_minutes >= 0),
  CONSTRAINT user_price_alerts_latency_check CHECK (
    data_latency IN ('unknown', 'live_delayed', 'previous_close', 'stale', 'unavailable')
  )
);

CREATE INDEX IF NOT EXISTS user_price_alerts_user_status_idx
  ON public.user_price_alerts (user_id, status);

CREATE INDEX IF NOT EXISTS user_price_alerts_symbol_idx
  ON public.user_price_alerts (symbol);

CREATE TABLE IF NOT EXISTS public.user_price_alert_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.user_price_alerts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  symbol text NOT NULL,
  condition_type text NOT NULL,
  threshold numeric NOT NULL,
  observed_price numeric NOT NULL,
  observed_move_pct numeric,
  quote_observed_at timestamptz,
  data_latency text NOT NULL,
  market_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery_channel text NOT NULL DEFAULT 'in_app',
  delivery_status text NOT NULL DEFAULT 'pending',
  delivery_error text,
  seen_at timestamptz,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_price_alert_triggers_delivery_check CHECK (
    delivery_status IN ('pending', 'delivered', 'failed')
  )
);

CREATE INDEX IF NOT EXISTS user_price_alert_triggers_user_triggered_idx
  ON public.user_price_alert_triggers (user_id, triggered_at DESC);

ALTER TABLE public.user_price_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_price_alert_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_price_alerts_own_rows
  ON public.user_price_alerts
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_price_alert_triggers_own_rows
  ON public.user_price_alert_triggers
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_price_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_price_alert_triggers TO authenticated;
GRANT ALL ON public.user_price_alerts TO service_role;
GRANT ALL ON public.user_price_alert_triggers TO service_role;

CREATE OR REPLACE FUNCTION public.touch_user_price_alert_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_price_alerts_updated_at ON public.user_price_alerts;
CREATE TRIGGER user_price_alerts_updated_at
  BEFORE UPDATE ON public.user_price_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_user_price_alert_updated_at();
