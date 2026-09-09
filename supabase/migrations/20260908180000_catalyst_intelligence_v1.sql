-- Catalyst Intelligence V1A foundation.
-- Artifact only: created in-repo, not applied to production in this sprint.
-- Server/service-role owned. No cron. No public/anon mutation.
-- No notification delivery. No provider adapter execution.

CREATE TABLE IF NOT EXISTS public.catalyst_intelligence (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_event_id uuid REFERENCES public.catalyst_events(id) ON DELETE CASCADE,
  source_dedupe_key text NOT NULL,
  symbol text NOT NULL,
  classification text NOT NULL CHECK (classification IN ('hard', 'emerging', 'context', 'commentary')),
  direction text NOT NULL CHECK (direction IN ('bullish', 'bearish', 'mixed', 'unknown')),
  fact_state text NOT NULL CHECK (fact_state IN ('provider_fact', 'derived', 'ai_interpretation')),
  source_quality_score integer NOT NULL CHECK (source_quality_score BETWEEN 0 AND 100),
  ticker_specificity_score integer NOT NULL CHECK (ticker_specificity_score BETWEEN 0 AND 100),
  materiality_score integer NOT NULL CHECK (materiality_score BETWEEN 0 AND 100),
  freshness_score integer NOT NULL CHECK (freshness_score BETWEEN 0 AND 100),
  confidence_score integer NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  catalyst_score integer NOT NULL CHECK (catalyst_score BETWEEN 0 AND 100),
  provider text NOT NULL,
  event_type text NOT NULL,
  title text NOT NULL,
  source_name text NOT NULL,
  source_url text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  scoring_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalyst_intelligence_source_dedupe_key_key UNIQUE (source_dedupe_key),
  CONSTRAINT catalyst_intelligence_title_nonempty_check CHECK (length(btrim(title)) > 0),
  CONSTRAINT catalyst_intelligence_symbol_nonempty_check CHECK (length(btrim(symbol)) > 0)
);

COMMENT ON TABLE public.catalyst_intelligence IS
  'Derived Catalyst Intelligence V1A records. Does not replace catalyst_events. Service-role only.';
COMMENT ON COLUMN public.catalyst_intelligence.fact_state IS
  'provider_fact preserves SEC/earnings provider facts. derived is intelligence. ai_interpretation is reserved and unused in V1.';
COMMENT ON COLUMN public.catalyst_intelligence.event_type IS
  'Copied from catalyst_events.event_type. sec_filing_news remains unchanged.';

CREATE INDEX IF NOT EXISTS idx_catalyst_intelligence_symbol
  ON public.catalyst_intelligence(symbol);
CREATE INDEX IF NOT EXISTS idx_catalyst_intelligence_score
  ON public.catalyst_intelligence(catalyst_score DESC);
CREATE INDEX IF NOT EXISTS idx_catalyst_intelligence_classification
  ON public.catalyst_intelligence(classification);

ALTER TABLE public.catalyst_intelligence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.catalyst_intelligence FROM PUBLIC;
REVOKE ALL ON TABLE public.catalyst_intelligence FROM anon;
REVOKE ALL ON TABLE public.catalyst_intelligence FROM authenticated;
GRANT ALL ON TABLE public.catalyst_intelligence TO service_role;

CREATE TABLE IF NOT EXISTS public.alert_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dedupe_key text NOT NULL,
  intelligence_id uuid REFERENCES public.catalyst_intelligence(id) ON DELETE CASCADE,
  intelligence_source_dedupe_key text NOT NULL,
  symbol text NOT NULL,
  classification text NOT NULL CHECK (classification IN ('hard', 'emerging', 'context', 'commentary')),
  direction text NOT NULL CHECK (direction IN ('bullish', 'bearish', 'mixed', 'unknown')),
  catalyst_score integer NOT NULL CHECK (catalyst_score BETWEEN 0 AND 100),
  title text NOT NULL,
  source_url text,
  source_name text NOT NULL,
  provider text NOT NULL,
  fact_state text NOT NULL CHECK (fact_state IN ('provider_fact', 'derived', 'ai_interpretation')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery_status text NOT NULL DEFAULT 'suppressed'
    CHECK (delivery_status IN ('queued', 'suppressed', 'failed')),
  delivery_suppressed_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alert_events_dedupe_key_key UNIQUE (dedupe_key)
);

COMMENT ON TABLE public.alert_events IS
  'Internal alert queue only. Notification Router is the sole delivery boundary. V1 delivery is suppressed.';

CREATE INDEX IF NOT EXISTS idx_alert_events_symbol ON public.alert_events(symbol);
CREATE INDEX IF NOT EXISTS idx_alert_events_created_at ON public.alert_events(created_at DESC);

ALTER TABLE public.alert_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.alert_events FROM PUBLIC;
REVOKE ALL ON TABLE public.alert_events FROM anon;
REVOKE ALL ON TABLE public.alert_events FROM authenticated;
GRANT ALL ON TABLE public.alert_events TO service_role;
