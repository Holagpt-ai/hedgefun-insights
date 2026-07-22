-- W2-P2 Scoreless Watchlist V2 additive schema
-- Enums
CREATE TYPE public.watchlist_direction AS ENUM ('bullish','bearish','neutral','data_unavailable');
CREATE TYPE public.watchlist_session AS ENUM ('premarket','rth','postclose');

-- Runs (internal)
CREATE TABLE public.watchlist_analysis_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL CHECK (mode IN ('batch','ticker','trigger')),
  session_type public.watchlist_session,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('running','completed','budget_resumed','failed')),
  cursor_start text,
  cursor_end text,
  tickers_total integer NOT NULL DEFAULT 0,
  tickers_ok integer NOT NULL DEFAULT 0,
  tickers_unavailable integer NOT NULL DEFAULT 0,
  tickers_error integer NOT NULL DEFAULT 0,
  reason_codes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(reason_codes) = 'object')
);
GRANT ALL ON public.watchlist_analysis_runs TO service_role;
ALTER TABLE public.watchlist_analysis_runs ENABLE ROW LEVEL SECURITY;

-- Analysis V2 (client-readable, ticker-global)
CREATE TABLE public.watchlist_analysis_v2 (
  ticker text PRIMARY KEY,
  contract_version integer NOT NULL DEFAULT 2 CHECK (contract_version = 2),
  session_date date NOT NULL,
  session_type public.watchlist_session NOT NULL,
  valid_through timestamptz NOT NULL,
  direction public.watchlist_direction NOT NULL,
  explanation text NOT NULL,
  driver_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(driver_ids) = 'array'),
  failure_reason text,
  price numeric,
  change_pct numeric,
  intraday jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(intraday) = 'array'),
  volume bigint CHECK (volume IS NULL OR volume >= 0),
  rvol numeric CHECK (rvol IS NULL OR rvol >= 0),
  rvol_class text CHECK (rvol_class IS NULL OR rvol_class IN ('normal','elevated','unusual')),
  market_signals jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(market_signals) = 'array'),
  recent_events jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(recent_events) = 'array'),
  key_levels jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(key_levels) = 'object'),
  inputs_quality jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(inputs_quality) = 'object'),
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  run_id uuid REFERENCES public.watchlist_analysis_runs(run_id),
  CONSTRAINT watchlist_analysis_v2_ticker_format CHECK (ticker ~ '^[A-Z][A-Z0-9.-]{0,14}$'),
  CONSTRAINT watchlist_analysis_v2_failure_reason_consistency CHECK (
    (direction = 'data_unavailable' AND failure_reason IS NOT NULL AND length(failure_reason) > 0)
    OR (direction IN ('bullish','bearish','neutral') AND failure_reason IS NULL)
  )
);
GRANT SELECT ON public.watchlist_analysis_v2 TO authenticated;
GRANT ALL ON public.watchlist_analysis_v2 TO service_role;
ALTER TABLE public.watchlist_analysis_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "V2 analysis visible to watchlist owners"
  ON public.watchlist_analysis_v2 FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.watchlists w
    WHERE w.user_id = auth.uid() AND w.symbol = watchlist_analysis_v2.ticker
  ));

-- History
CREATE TABLE public.watchlist_analysis_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  session_date date NOT NULL,
  session_type public.watchlist_session NOT NULL,
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  direction public.watchlist_direction NOT NULL,
  explanation text NOT NULL,
  market_signals jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(market_signals) = 'array'),
  run_id uuid REFERENCES public.watchlist_analysis_runs(run_id),
  CONSTRAINT watchlist_analysis_history_ticker_format CHECK (ticker ~ '^[A-Z][A-Z0-9.-]{0,14}$')
);
CREATE INDEX watchlist_analysis_history_ticker_analyzed_idx
  ON public.watchlist_analysis_history (ticker, analyzed_at DESC);
GRANT SELECT ON public.watchlist_analysis_history TO authenticated;
GRANT ALL ON public.watchlist_analysis_history TO service_role;
ALTER TABLE public.watchlist_analysis_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "V2 history visible to watchlist owners"
  ON public.watchlist_analysis_history FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.watchlists w
    WHERE w.user_id = auth.uid() AND w.symbol = watchlist_analysis_history.ticker
  ));

-- RVOL baseline (internal)
CREATE TABLE public.watchlist_rvol_baseline (
  ticker text NOT NULL,
  baseline_date date NOT NULL,
  curve jsonb NOT NULL CHECK (jsonb_typeof(curve) = 'array'),
  sessions_used integer NOT NULL CHECK (sessions_used BETWEEN 10 AND 20),
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, baseline_date),
  CONSTRAINT watchlist_rvol_baseline_ticker_format CHECK (ticker ~ '^[A-Z][A-Z0-9.-]{0,14}$')
);
GRANT ALL ON public.watchlist_rvol_baseline TO service_role;
ALTER TABLE public.watchlist_rvol_baseline ENABLE ROW LEVEL SECURITY;

-- Alerts V2
CREATE TABLE public.watchlist_alerts_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  alert_type text NOT NULL CHECK (alert_type IN (
    'direction_change','unusual_volume','market_signal','company_event','key_level','earnings_upcoming'
  )),
  reason text NOT NULL,
  facts jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(facts) = 'object'),
  event_time timestamptz NOT NULL DEFAULT now(),
  session_date date,
  dedupe_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT watchlist_alerts_v2_ticker_format CHECK (ticker ~ '^[A-Z][A-Z0-9.-]{0,14}$')
);
CREATE INDEX watchlist_alerts_v2_ticker_created_idx
  ON public.watchlist_alerts_v2 (ticker, created_at DESC);
GRANT SELECT ON public.watchlist_alerts_v2 TO authenticated;
GRANT ALL ON public.watchlist_alerts_v2 TO service_role;
ALTER TABLE public.watchlist_alerts_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "V2 alerts visible to watchlist owners"
  ON public.watchlist_alerts_v2 FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.watchlists w
    WHERE w.user_id = auth.uid() AND w.symbol = watchlist_alerts_v2.ticker
  ));

-- Realtime (guarded)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'watchlist_analysis_v2'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.watchlist_analysis_v2';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'watchlist_alerts_v2'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.watchlist_alerts_v2';
  END IF;
END $$;-- Tighten V2 grants (project has legacy wide public-schema defaults)
REVOKE ALL ON public.watchlist_analysis_v2 FROM anon, authenticated;
REVOKE ALL ON public.watchlist_analysis_history FROM anon, authenticated;
REVOKE ALL ON public.watchlist_alerts_v2 FROM anon, authenticated;
REVOKE ALL ON public.watchlist_rvol_baseline FROM anon, authenticated;
REVOKE ALL ON public.watchlist_analysis_runs FROM anon, authenticated;

GRANT SELECT ON public.watchlist_analysis_v2 TO authenticated;
GRANT SELECT ON public.watchlist_analysis_history TO authenticated;
GRANT SELECT ON public.watchlist_alerts_v2 TO authenticated;