-- Security Identity V1.
-- Internal security id is the permanent key. Symbol history is point-in-time.
-- This does not migrate Radar, screener, or other existing tables onto security_id.
-- Not applied by this change.

CREATE TABLE IF NOT EXISTS public.securities (
  security_id uuid PRIMARY KEY,
  current_symbol text NOT NULL,
  issuer_name text,
  security_type text NOT NULL,
  exchange text,
  country text,
  adr_status text NOT NULL,
  active boolean NOT NULL,
  resolution_state text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT securities_symbol_check
    CHECK (current_symbol ~ '^[A-Z][A-Z0-9.\-]{0,11}$'),
  CONSTRAINT securities_type_check
    CHECK (security_type IN ('COMMON_STOCK', 'ADR', 'ETF', 'PREFERRED', 'WARRANT', 'UNKNOWN')),
  CONSTRAINT securities_adr_status_check
    CHECK (adr_status IN ('ADR', 'NOT_ADR', 'UNKNOWN')),
  CONSTRAINT securities_resolution_state_check
    CHECK (resolution_state IN ('RESOLVED', 'CANDIDATE')),
  CONSTRAINT securities_country_check
    CHECK (country IS NULL OR country ~ '^[A-Z]{2}$')
);

COMMENT ON TABLE public.securities IS
  'Stocksist-owned security identity. current_symbol is the open listing, not the primary key.';

CREATE INDEX IF NOT EXISTS securities_current_symbol_idx
  ON public.securities (current_symbol);

CREATE TABLE IF NOT EXISTS public.security_symbol_history (
  history_id uuid PRIMARY KEY,
  security_id uuid NOT NULL REFERENCES public.securities (security_id),
  symbol text NOT NULL,
  exchange text,
  effective_from date NOT NULL,
  effective_to date,
  source text,
  source_as_of timestamptz,
  provenance text NOT NULL,
  observed_at timestamptz,
  fetched_at timestamptz,
  CONSTRAINT security_symbol_history_symbol_check
    CHECK (symbol ~ '^[A-Z][A-Z0-9.\-]{0,11}$'),
  CONSTRAINT security_symbol_history_range_check
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT security_symbol_history_provenance_check
    CHECK (provenance IN ('PROVIDER', 'DERIVED', 'INTERNAL', 'COMPOSITE', 'UNKNOWN'))
);

COMMENT ON TABLE public.security_symbol_history IS
  'Point-in-time symbol and exchange for a security. effective_to null is the open row.';

CREATE UNIQUE INDEX IF NOT EXISTS security_symbol_history_listing_uidx
  ON public.security_symbol_history (security_id, symbol, COALESCE(exchange, ''), effective_from);

CREATE INDEX IF NOT EXISTS security_symbol_history_symbol_range_idx
  ON public.security_symbol_history (symbol, effective_from, effective_to);

CREATE INDEX IF NOT EXISTS security_symbol_history_security_id_idx
  ON public.security_symbol_history (security_id);

CREATE UNIQUE INDEX IF NOT EXISTS security_symbol_history_one_open_idx
  ON public.security_symbol_history (security_id)
  WHERE effective_to IS NULL;

CREATE TABLE IF NOT EXISTS public.security_reference_identifiers (
  security_id uuid NOT NULL REFERENCES public.securities (security_id),
  identifier_kind text NOT NULL,
  identifier_value text NOT NULL,
  source text,
  source_as_of timestamptz,
  provenance text NOT NULL,
  observed_at timestamptz,
  fetched_at timestamptz,
  PRIMARY KEY (security_id, identifier_kind),
  CONSTRAINT security_reference_identifiers_kind_check
    CHECK (identifier_kind IN ('COMPOSITE_FIGI', 'FIGI', 'PROVIDER_REFERENCE', 'CIK')),
  CONSTRAINT security_reference_identifiers_value_check
    CHECK (char_length(btrim(identifier_value)) > 0),
  CONSTRAINT security_reference_identifiers_provenance_check
    CHECK (provenance IN ('PROVIDER', 'DERIVED', 'INTERNAL', 'COMPOSITE', 'UNKNOWN'))
);

COMMENT ON TABLE public.security_reference_identifiers IS
  'Optional permanent or reference identifiers supplied by an observation. CIK is issuer-level and is not unique. FIGI, composite FIGI, and provider reference are unique per value.';

CREATE UNIQUE INDEX IF NOT EXISTS security_reference_identifiers_security_level_uidx
  ON public.security_reference_identifiers (identifier_kind, identifier_value)
  WHERE identifier_kind IN ('COMPOSITE_FIGI', 'FIGI', 'PROVIDER_REFERENCE');

CREATE INDEX IF NOT EXISTS security_reference_identifiers_cik_idx
  ON public.security_reference_identifiers (identifier_value)
  WHERE identifier_kind = 'CIK';

ALTER TABLE public.securities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_symbol_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_reference_identifiers ENABLE ROW LEVEL SECURITY;
