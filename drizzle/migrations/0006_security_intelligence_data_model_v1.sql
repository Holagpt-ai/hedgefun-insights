-- Security Intelligence data model V1.
-- Historical facts key to securities.security_id. observed_symbol is context, not identity.
-- Does not backfill, detect episodes, calculate outcomes, or alter Radar/screener tables.
-- Not applied by this change.

CREATE TABLE IF NOT EXISTS public.security_daily_history (
  security_id uuid NOT NULL REFERENCES public.securities (security_id),
  session_date date NOT NULL,
  observed_symbol text,
  exchange text,
  open numeric,
  high numeric,
  low numeric,
  close numeric,
  volume numeric,
  dollar_volume numeric,
  previous_close numeric,
  move_pct numeric,
  source text,
  source_as_of timestamptz,
  fetched_at timestamptz,
  computed_at timestamptz,
  quality text NOT NULL,
  freshness text NOT NULL,
  provenance text NOT NULL,
  PRIMARY KEY (security_id, session_date),
  CONSTRAINT security_daily_history_symbol_check
    CHECK (observed_symbol IS NULL OR observed_symbol ~ '^[A-Z][A-Z0-9.\-]{0,11}$'),
  CONSTRAINT security_daily_history_quality_check
    CHECK (quality IN ('AUTHORITATIVE', 'DERIVED', 'PARTIAL', 'DISCREPANCY', 'UNAVAILABLE', 'INVALID')),
  CONSTRAINT security_daily_history_freshness_check
    CHECK (freshness IN ('FRESH', 'AGING', 'STALE', 'UNKNOWN')),
  CONSTRAINT security_daily_history_provenance_check
    CHECK (provenance IN ('PROVIDER', 'DERIVED', 'INTERNAL', 'COMPOSITE', 'UNKNOWN'))
);

COMMENT ON TABLE public.security_daily_history IS
  'Point-in-time daily facts for a security. Missing prices, dollar volume, and move percent stay null. Present-day symbol, float, shares, market cap, exchange, and ADR status are not copied onto old sessions.';

CREATE INDEX IF NOT EXISTS security_daily_history_session_date_idx
  ON public.security_daily_history (session_date);

CREATE INDEX IF NOT EXISTS security_daily_history_session_volume_idx
  ON public.security_daily_history (session_date, volume);

CREATE INDEX IF NOT EXISTS security_daily_history_session_dollar_volume_idx
  ON public.security_daily_history (session_date, dollar_volume);

CREATE TABLE IF NOT EXISTS public.market_behavior_episodes (
  episode_id uuid PRIMARY KEY,
  security_id uuid NOT NULL REFERENCES public.securities (security_id),
  episode_start timestamptz NOT NULL,
  episode_end timestamptz,
  observed_symbol text,
  direction text NOT NULL,
  tier text NOT NULL,
  start_price numeric,
  high_price numeric,
  low_price numeric,
  end_price numeric,
  max_positive_move_pct numeric,
  max_negative_move_pct numeric,
  volume numeric,
  dollar_volume numeric,
  rvol numeric,
  float_turnover numeric,
  halt_count integer,
  close_strength numeric,
  detected_by text,
  origin text NOT NULL,
  source text,
  source_as_of timestamptz,
  fetched_at timestamptz,
  computed_at timestamptz,
  quality text NOT NULL,
  freshness text NOT NULL,
  provenance text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT market_behavior_episodes_direction_check
    CHECK (direction IN ('POSITIVE', 'NEGATIVE', 'MIXED')),
  CONSTRAINT market_behavior_episodes_tier_check
    CHECK (tier IN ('NOTABLE', 'SIGNIFICANT', 'EXTREME')),
  CONSTRAINT market_behavior_episodes_origin_check
    CHECK (origin IN ('HISTORICAL_BACKFILL', 'STOCKSIST_LIVE')),
  CONSTRAINT market_behavior_episodes_range_check
    CHECK (episode_end IS NULL OR episode_end >= episode_start),
  CONSTRAINT market_behavior_episodes_quality_check
    CHECK (quality IN ('AUTHORITATIVE', 'DERIVED', 'PARTIAL', 'DISCREPANCY', 'UNAVAILABLE', 'INVALID')),
  CONSTRAINT market_behavior_episodes_freshness_check
    CHECK (freshness IN ('FRESH', 'AGING', 'STALE', 'UNKNOWN')),
  CONSTRAINT market_behavior_episodes_provenance_check
    CHECK (provenance IN ('PROVIDER', 'DERIVED', 'INTERNAL', 'COMPOSITE', 'UNKNOWN'))
);

COMMENT ON TABLE public.market_behavior_episodes IS
  'Material trading episodes. NORMAL is not an episode tier. rvol, float turnover, halt count, and close strength stay null unless known.';

CREATE INDEX IF NOT EXISTS market_behavior_episodes_security_start_idx
  ON public.market_behavior_episodes (security_id, episode_start);

CREATE INDEX IF NOT EXISTS market_behavior_episodes_tier_idx
  ON public.market_behavior_episodes (tier);

CREATE INDEX IF NOT EXISTS market_behavior_episodes_origin_idx
  ON public.market_behavior_episodes (origin);

CREATE INDEX IF NOT EXISTS market_behavior_episodes_start_idx
  ON public.market_behavior_episodes (episode_start);

CREATE TABLE IF NOT EXISTS public.corporate_events (
  event_id uuid PRIMARY KEY,
  security_id uuid NOT NULL REFERENCES public.securities (security_id),
  observed_symbol text,
  event_type text NOT NULL,
  event_at timestamptz NOT NULL,
  title text NOT NULL,
  summary text,
  source text,
  source_url text,
  provider_event_id text,
  accession_id text,
  source_as_of timestamptz,
  fetched_at timestamptz,
  computed_at timestamptz,
  quality text NOT NULL,
  freshness text NOT NULL,
  provenance text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL,
  CONSTRAINT corporate_events_type_check
    CHECK (event_type IN (
      'EARNINGS', 'GUIDANCE', 'PRESS_RELEASE', 'SEC_FILING', 'INSIDER_BUY', 'INSIDER_SELL',
      'OFFERING', 'FINANCING', 'M_AND_A', 'ACQUISITION', 'PARTNERSHIP', 'CONTRACT', 'ORDER',
      'FDA_EVENT', 'CLINICAL_EVENT', 'PRODUCT_EVENT', 'PATENT', 'AI_ANNOUNCEMENT',
      'CRYPTO_ANNOUNCEMENT', 'MANAGEMENT_HIRE', 'MANAGEMENT_DEPARTURE', 'SPLIT', 'REVERSE_SPLIT',
      'SHAREHOLDER_MEETING', 'INVESTOR_CONFERENCE', 'DIVIDEND', 'BUYBACK', 'LITIGATION',
      'REGULATORY_EVENT', 'EXCHANGE_COMPLIANCE', 'OWNERSHIP_CHANGE', 'OTHER'
    )),
  CONSTRAINT corporate_events_quality_check
    CHECK (quality IN ('AUTHORITATIVE', 'DERIVED', 'PARTIAL', 'DISCREPANCY', 'UNAVAILABLE', 'INVALID')),
  CONSTRAINT corporate_events_freshness_check
    CHECK (freshness IN ('FRESH', 'AGING', 'STALE', 'UNKNOWN')),
  CONSTRAINT corporate_events_provenance_check
    CHECK (provenance IN ('PROVIDER', 'DERIVED', 'INTERNAL', 'COMPOSITE', 'UNKNOWN'))
);

COMMENT ON TABLE public.corporate_events IS
  'Canonical corporate event memory. Storing an event does not create a market-reaction link or claim causation.';

CREATE INDEX IF NOT EXISTS corporate_events_security_event_at_idx
  ON public.corporate_events (security_id, event_at);

CREATE INDEX IF NOT EXISTS corporate_events_type_idx
  ON public.corporate_events (event_type);

CREATE INDEX IF NOT EXISTS corporate_events_event_at_idx
  ON public.corporate_events (event_at);

CREATE UNIQUE INDEX IF NOT EXISTS corporate_events_provider_event_uidx
  ON public.corporate_events (source, provider_event_id)
  WHERE provider_event_id IS NOT NULL AND source IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.event_reaction_links (
  link_id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.corporate_events (event_id),
  episode_id uuid NOT NULL REFERENCES public.market_behavior_episodes (episode_id),
  security_id uuid NOT NULL REFERENCES public.securities (security_id),
  relation_type text NOT NULL,
  time_delta_seconds integer,
  time_delta_minutes integer,
  confidence numeric,
  evidence text,
  provenance text NOT NULL,
  source text,
  source_as_of timestamptz,
  created_at timestamptz NOT NULL,
  CONSTRAINT event_reaction_links_relation_check
    CHECK (relation_type IN (
      'SAME_WINDOW', 'PRECEDES_EPISODE', 'OVERLAPS_EPISODE', 'FOLLOWS_EPISODE', 'UNKNOWN_RELATIONSHIP'
    )),
  CONSTRAINT event_reaction_links_confidence_check
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  CONSTRAINT event_reaction_links_provenance_check
    CHECK (provenance IN ('PROVIDER', 'DERIVED', 'INTERNAL', 'COMPOSITE', 'UNKNOWN'))
);

COMMENT ON TABLE public.event_reaction_links IS
  'Evidence link between a corporate event and a behavior episode. Relation types are temporal. They do not assert causation.';

CREATE INDEX IF NOT EXISTS event_reaction_links_event_id_idx
  ON public.event_reaction_links (event_id);

CREATE INDEX IF NOT EXISTS event_reaction_links_episode_id_idx
  ON public.event_reaction_links (episode_id);

CREATE INDEX IF NOT EXISTS event_reaction_links_security_id_idx
  ON public.event_reaction_links (security_id);

CREATE TABLE IF NOT EXISTS public.forward_outcomes (
  episode_id uuid NOT NULL REFERENCES public.market_behavior_episodes (episode_id),
  horizon text NOT NULL,
  reference_timestamp timestamptz,
  reference_price numeric,
  outcome_price numeric,
  return_pct numeric,
  max_gain_pct numeric,
  max_drawdown_pct numeric,
  high_price numeric,
  low_price numeric,
  data_available boolean NOT NULL,
  source text,
  source_as_of timestamptz,
  fetched_at timestamptz,
  computed_at timestamptz,
  quality text NOT NULL,
  freshness text NOT NULL,
  provenance text NOT NULL,
  PRIMARY KEY (episode_id, horizon),
  CONSTRAINT forward_outcomes_horizon_check
    CHECK (horizon IN (
      '5M', '15M', '30M', '1H', 'CLOSE', 'AFTER_HOURS', 'NEXT_OPEN',
      'D1', 'D2', 'D3', 'D5', 'D10', 'D30'
    )),
  CONSTRAINT forward_outcomes_quality_check
    CHECK (quality IN ('AUTHORITATIVE', 'DERIVED', 'PARTIAL', 'DISCREPANCY', 'UNAVAILABLE', 'INVALID')),
  CONSTRAINT forward_outcomes_freshness_check
    CHECK (freshness IN ('FRESH', 'AGING', 'STALE', 'UNKNOWN')),
  CONSTRAINT forward_outcomes_provenance_check
    CHECK (provenance IN ('PROVIDER', 'DERIVED', 'INTERNAL', 'COMPOSITE', 'UNKNOWN'))
);

COMMENT ON TABLE public.forward_outcomes IS
  'Structural horizons for later comparison. V1 does not calculate returns.';

CREATE TABLE IF NOT EXISTS public.security_episode_events (
  episode_event_id uuid PRIMARY KEY,
  episode_id uuid NOT NULL REFERENCES public.market_behavior_episodes (episode_id),
  security_id uuid NOT NULL REFERENCES public.securities (security_id),
  event_type text NOT NULL,
  event_at timestamptz NOT NULL,
  price numeric,
  volume numeric,
  metadata jsonb,
  provenance text NOT NULL,
  source text,
  source_as_of timestamptz,
  created_at timestamptz NOT NULL,
  CONSTRAINT security_episode_events_type_check
    CHECK (event_type IN (
      'DISCOVERED', 'VOLUME_TRIGGER', 'MOMENTUM_TRIGGER', 'NEW_HOD', 'NEW_LOD',
      'HALT', 'RESUME', 'PULLBACK', 'VWAP_LOSS', 'VWAP_RECLAIM', 'RANGE_EXPANSION'
    )),
  CONSTRAINT security_episode_events_provenance_check
    CHECK (provenance IN ('PROVIDER', 'DERIVED', 'INTERNAL', 'COMPOSITE', 'UNKNOWN'))
);

CREATE INDEX IF NOT EXISTS security_episode_events_episode_at_idx
  ON public.security_episode_events (episode_id, event_at);

CREATE INDEX IF NOT EXISTS security_episode_events_security_at_idx
  ON public.security_episode_events (security_id, event_at);

CREATE TABLE IF NOT EXISTS public.security_backfill_jobs (
  job_id uuid PRIMARY KEY,
  job_type text NOT NULL,
  state text NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL,
  cursor_date date,
  cursor_token text,
  processed_count integer NOT NULL,
  error_count integer NOT NULL,
  started_at timestamptz,
  updated_at timestamptz NOT NULL,
  completed_at timestamptz,
  metadata jsonb,
  CONSTRAINT security_backfill_jobs_state_check
    CHECK (state IN ('PENDING', 'RUNNING', 'PAUSED', 'FAILED', 'COMPLETE')),
  CONSTRAINT security_backfill_jobs_range_check
    CHECK (date_from <= date_to),
  CONSTRAINT security_backfill_jobs_counts_check
    CHECK (processed_count >= 0 AND error_count >= 0)
);

COMMENT ON TABLE public.security_backfill_jobs IS
  'Generic resumable backfill job. Not provider-specific and not executed by this migration.';

CREATE INDEX IF NOT EXISTS security_backfill_jobs_state_idx
  ON public.security_backfill_jobs (state, job_type);

ALTER TABLE public.security_daily_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_behavior_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_reaction_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forward_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_episode_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_backfill_jobs ENABLE ROW LEVEL SECURITY;
