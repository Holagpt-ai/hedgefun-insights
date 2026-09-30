-- Catalyst Intelligence Network v1 (additive).
-- Does NOT alter public.catalyst_events.
--
-- catalyst_events remains the public provider-reported feed:
--   verification_state is locked to provider_reported,
--   one source per row, no lifecycle, and no score/confidence columns.
-- Those constraints cannot represent raw evidence, multi-source
-- verification, separate materiality/timing/reaction scores, or an
-- observation-mode distribution flag. This migration adds a parallel
-- service-only model. Downstream screens keep reading catalyst_events
-- until a later, explicit distribution step.

CREATE OR REPLACE FUNCTION public.catalyst_intel_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.catalyst_intel_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'catalyst intelligence append-only: %.% is immutable', TG_TABLE_SCHEMA, TG_TABLE_NAME;
END;
$$;

-- Data-driven source configuration. Poll cadence lives here so it can
-- change without rewriting collectors.
CREATE TABLE IF NOT EXISTS public.catalyst_intel_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE,
  company_name text,
  ticker text,
  cik text,
  source_type text NOT NULL CHECK (source_type IN (
    'SEC_FILINGS', 'COMPANY_IR', 'COMPANY_EVENTS', 'NEWS_PR', 'MARKET_REACTION'
  )),
  url text NOT NULL,
  hostname text NOT NULL,
  feed_format text NOT NULL CHECK (feed_format IN (
    'sec_atom', 'rss', 'atom', 'json', 'html', 'jsonld', 'ics', 'sitemap', 'auto'
  )),
  poll_interval_seconds integer NOT NULL DEFAULT 600 CHECK (poll_interval_seconds >= 0),
  enabled boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 0,
  evidence_tier text NOT NULL CHECK (evidence_tier IN (
    'TIER_1_PRIMARY', 'TIER_2_STRONG_SECONDARY', 'TIER_3_DISCOVERY'
  )),
  last_success_at timestamptz,
  last_content_hash text,
  last_etag text,
  last_modified text,
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  backoff_until timestamptz,
  last_error_category text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalyst_intel_sources_due_idx
  ON public.catalyst_intel_sources (source_type, enabled, priority DESC);

CREATE TRIGGER trg_catalyst_intel_sources_updated
  BEFORE UPDATE ON public.catalyst_intel_sources
  FOR EACH ROW EXECUTE FUNCTION public.catalyst_intel_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.catalyst_intel_bot_config (
  bot text PRIMARY KEY CHECK (bot IN ('sec', 'ir', 'events', 'news', 'reactions')),
  enabled boolean NOT NULL DEFAULT false,
  batch_limit integer NOT NULL DEFAULT 25 CHECK (batch_limit > 0 AND batch_limit <= 200),
  concurrency integer NOT NULL DEFAULT 3 CHECK (concurrency > 0 AND concurrency <= 8),
  poll_interval_seconds integer NOT NULL DEFAULT 600 CHECK (poll_interval_seconds >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_catalyst_intel_bot_config_updated
  BEFORE UPDATE ON public.catalyst_intel_bot_config
  FOR EACH ROW EXECUTE FUNCTION public.catalyst_intel_touch_updated_at();

INSERT INTO public.catalyst_intel_bot_config
  (bot, enabled, batch_limit, concurrency, poll_interval_seconds)
VALUES
  ('sec', false, 1, 1, 180),
  ('ir', false, 25, 3, 600),
  ('events', false, 25, 3, 900),
  ('news', false, 25, 3, 180),
  ('reactions', false, 50, 4, 60)
ON CONFLICT (bot) DO NOTHING;

-- One authoritative SEC latest-filings source. Disabled until an operator
-- enables the bot. This is configuration, not a catalyst event.
INSERT INTO public.catalyst_intel_sources (
  source_key, company_name, ticker, cik, source_type, url, hostname, feed_format,
  poll_interval_seconds, enabled, priority, evidence_tier, metadata
) VALUES (
  'sec-latest-filings',
  NULL,
  NULL,
  NULL,
  'SEC_FILINGS',
  'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&owner=exclude&count=100&start=0&output=atom',
  'www.sec.gov',
  'sec_atom',
  180,
  false,
  100,
  'TIER_1_PRIMARY',
  '{"checkpoint":{"start":0}}'::jsonb
) ON CONFLICT (source_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.catalyst_intel_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot text NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  sources_attempted integer NOT NULL DEFAULT 0,
  sources_successful integer NOT NULL DEFAULT 0,
  sources_failed integer NOT NULL DEFAULT 0,
  raw_items_seen integer NOT NULL DEFAULT 0,
  new_items integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0,
  events_created integer NOT NULL DEFAULT 0,
  events_updated integer NOT NULL DEFAULT 0,
  events_invalidated integer NOT NULL DEFAULT 0,
  elapsed_ms integer,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'disabled', 'failed')),
  errors jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS catalyst_intel_runs_started_idx
  ON public.catalyst_intel_runs (bot, started_at DESC);

-- Immutable record of what a source returned.
CREATE TABLE IF NOT EXISTS public.catalyst_intel_raw_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.catalyst_intel_sources(id),
  external_id text,
  canonical_url text,
  content_hash text NOT NULL,
  published_at timestamptz,
  discovered_at timestamptz NOT NULL,
  title text,
  body_excerpt text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS catalyst_intel_raw_source_external_uidx
  ON public.catalyst_intel_raw_items (source_id, external_id);

CREATE UNIQUE INDEX IF NOT EXISTS catalyst_intel_raw_source_hash_uidx
  ON public.catalyst_intel_raw_items (source_id, content_hash);

CREATE TRIGGER trg_catalyst_intel_raw_immutable
  BEFORE UPDATE OR DELETE ON public.catalyst_intel_raw_items
  FOR EACH ROW EXECUTE FUNCTION public.catalyst_intel_reject_mutation();

-- Canonical catalyst. Evolves as evidence arrives. Starts in observation
-- so early classification does not enter trader-facing surfaces.
CREATE TABLE IF NOT EXISTS public.catalyst_intel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_key text NOT NULL UNIQUE,
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  summary text,
  announcement_summary text,
  event_type text NOT NULL CHECK (event_type IN (
    'EARNINGS', 'GUIDANCE', 'SEC_FILING', 'FINANCING', 'DILUTION', 'M_AND_A',
    'EXECUTIVE_CHANGE', 'CONTRACT', 'PARTNERSHIP', 'PRODUCT_LAUNCH',
    'PRODUCT_STRATEGY_EVENT', 'INVESTOR_EVENT', 'CONFERENCE', 'REGULATORY',
    'FDA_CLINICAL', 'LEGAL', 'ANALYST_ACTION', 'CORPORATE_ACTION',
    'OTHER_MATERIAL_EVENT'
  )),
  event_subtype text,
  lifecycle text NOT NULL CHECK (lifecycle IN (
    'discovered', 'scheduled', 'approaching', 'live', 'announced',
    'reacting', 'follow_through', 'resolved', 'invalidated'
  )),
  catalyst_state text NOT NULL CHECK (catalyst_state IN (
    'IMMEDIATE', 'DEVELOPING', 'UPCOMING', 'WATCH', 'INFORMATIONAL'
  )),
  first_discovered_at timestamptz NOT NULL,
  source_published_at timestamptz,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  scheduled_date date,
  announcement_at timestamptz,
  effective_at timestamptz,
  timing_bucket text NOT NULL CHECK (timing_bucket IN (
    'immediate', 'premarket', 'regular_session', 'after_hours',
    'next_session', 'scheduled_future', 'unknown'
  )),
  verification_state text NOT NULL CHECK (verification_state IN (
    'VERIFIED_PRIMARY', 'VERIFIED_MULTI_SOURCE', 'REPORTED',
    'UNVERIFIED', 'CONFLICTING', 'INVALIDATED'
  )),
  evidence_confidence numeric NOT NULL CHECK (evidence_confidence >= 0 AND evidence_confidence <= 100),
  materiality numeric NOT NULL CHECK (materiality >= 0 AND materiality <= 100),
  timing_urgency numeric NOT NULL CHECK (timing_urgency >= 0 AND timing_urgency <= 100),
  reaction_score numeric CHECK (reaction_score IS NULL OR (reaction_score >= 0 AND reaction_score <= 100)),
  priority_score numeric NOT NULL CHECK (priority_score >= 0 AND priority_score <= 100),
  attribution_confidence numeric NOT NULL CHECK (attribution_confidence >= 0 AND attribution_confidence <= 1),
  distribution_status text NOT NULL DEFAULT 'observation' CHECK (distribution_status IN ('observation', 'ready')),
  lifecycle_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  score_components jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalyst_intel_events_lifecycle_idx
  ON public.catalyst_intel_events (lifecycle, updated_at DESC);

CREATE INDEX IF NOT EXISTS catalyst_intel_events_distribution_idx
  ON public.catalyst_intel_events (distribution_status, priority_score DESC);

CREATE TRIGGER trg_catalyst_intel_events_updated
  BEFORE UPDATE ON public.catalyst_intel_events
  FOR EACH ROW EXECUTE FUNCTION public.catalyst_intel_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.catalyst_intel_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.catalyst_intel_events(id),
  raw_item_id uuid NOT NULL REFERENCES public.catalyst_intel_raw_items(id),
  source_id uuid NOT NULL REFERENCES public.catalyst_intel_sources(id),
  evidence_tier text NOT NULL CHECK (evidence_tier IN (
    'TIER_1_PRIMARY', 'TIER_2_STRONG_SECONDARY', 'TIER_3_DISCOVERY'
  )),
  evidence_role text NOT NULL CHECK (evidence_role IN ('primary', 'secondary')),
  canonical_url text,
  content_hash text NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, raw_item_id)
);

CREATE INDEX IF NOT EXISTS catalyst_intel_evidence_url_idx
  ON public.catalyst_intel_evidence (canonical_url);

CREATE INDEX IF NOT EXISTS catalyst_intel_evidence_hash_idx
  ON public.catalyst_intel_evidence (content_hash);

CREATE TRIGGER trg_catalyst_intel_evidence_immutable
  BEFORE UPDATE OR DELETE ON public.catalyst_intel_evidence
  FOR EACH ROW EXECUTE FUNCTION public.catalyst_intel_reject_mutation();

CREATE TABLE IF NOT EXISTS public.catalyst_intel_event_tickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.catalyst_intel_events(id),
  ticker text NOT NULL,
  relation text NOT NULL CHECK (relation IN (
    'DIRECT', 'PRIMARY', 'SECONDARY', 'SUPPLIER', 'CUSTOMER',
    'COMPETITOR', 'SECTOR', 'MENTION'
  )),
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  is_primary boolean NOT NULL DEFAULT false,
  evidence_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, ticker, relation)
);

CREATE INDEX IF NOT EXISTS catalyst_intel_event_tickers_ticker_idx
  ON public.catalyst_intel_event_tickers (ticker, event_id);

-- One current snapshot per event and window. Historical windows are
-- distinct rows (m1, m5, session_end, next_session, ...).
CREATE TABLE IF NOT EXISTS public.catalyst_intel_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.catalyst_intel_events(id),
  window_kind text NOT NULL CHECK (window_kind IN (
    'm1', 'm5', 'm15', 'm30', 'session_end', 'after_hours',
    'next_session', 'multi_day', 'point'
  )),
  observed_at timestamptz,
  availability text NOT NULL CHECK (availability IN ('available', 'unavailable', 'stale')),
  reference_price numeric,
  current_price numeric,
  percent_move numeric,
  intraday_high numeric,
  intraday_low numeric,
  volume numeric,
  dollar_volume numeric,
  rvol_5m numeric,
  time_adjusted_rvol numeric,
  volume_velocity numeric,
  volume_acceleration numeric,
  vwap numeric,
  vwap_side text,
  hod_distance_pct numeric,
  lod_distance_pct numeric,
  float_turnover numeric,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, window_kind)
);

CREATE INDEX IF NOT EXISTS catalyst_intel_reactions_event_idx
  ON public.catalyst_intel_reactions (event_id, observed_at DESC);

CREATE TRIGGER trg_catalyst_intel_reactions_updated
  BEFORE UPDATE ON public.catalyst_intel_reactions
  FOR EACH ROW EXECUTE FUNCTION public.catalyst_intel_touch_updated_at();

-- Service-role read model. observation rows stay queryable for review.
-- distribution_status = 'ready' is the explicit gate for later product surfaces.
CREATE OR REPLACE VIEW public.catalyst_intel_distribution AS
SELECT
  e.id AS event_id,
  t.ticker,
  e.title,
  COALESCE(e.announcement_summary, e.summary) AS summary,
  e.event_type,
  e.event_subtype,
  e.lifecycle,
  e.catalyst_state,
  e.scheduled_start_at,
  e.scheduled_date,
  e.announcement_at,
  e.timing_bucket,
  e.verification_state,
  e.evidence_confidence,
  e.materiality,
  e.timing_urgency,
  e.reaction_score,
  e.priority_score,
  e.distribution_status,
  e.score_components,
  r.availability AS reaction_availability,
  r.percent_move,
  r.volume,
  r.rvol_5m,
  r.volume_velocity,
  r.observed_at AS reaction_observed_at
FROM public.catalyst_intel_events e
LEFT JOIN LATERAL (
  SELECT ticker
  FROM public.catalyst_intel_event_tickers et
  WHERE et.event_id = e.id AND et.is_primary
  ORDER BY et.confidence DESC
  LIMIT 1
) t ON true
LEFT JOIN public.catalyst_intel_reactions r
  ON r.event_id = e.id AND r.window_kind = 'point';

REVOKE ALL ON public.catalyst_intel_sources FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.catalyst_intel_bot_config FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.catalyst_intel_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.catalyst_intel_raw_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.catalyst_intel_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.catalyst_intel_evidence FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.catalyst_intel_event_tickers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.catalyst_intel_reactions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.catalyst_intel_distribution FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.catalyst_intel_sources TO service_role;
GRANT ALL ON public.catalyst_intel_bot_config TO service_role;
GRANT ALL ON public.catalyst_intel_runs TO service_role;
GRANT ALL ON public.catalyst_intel_raw_items TO service_role;
GRANT ALL ON public.catalyst_intel_events TO service_role;
GRANT ALL ON public.catalyst_intel_evidence TO service_role;
GRANT ALL ON public.catalyst_intel_event_tickers TO service_role;
GRANT ALL ON public.catalyst_intel_reactions TO service_role;
GRANT SELECT ON public.catalyst_intel_distribution TO service_role;

ALTER TABLE public.catalyst_intel_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalyst_intel_bot_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalyst_intel_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalyst_intel_raw_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalyst_intel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalyst_intel_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalyst_intel_event_tickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalyst_intel_reactions ENABLE ROW LEVEL SECURITY;
