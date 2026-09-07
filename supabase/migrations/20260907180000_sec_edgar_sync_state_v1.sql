-- SEC EDGAR V1C accession-anchor checkpoint.
-- Executable by future migration tooling. Not yet applied to production.
-- "Artifact only" means it has not been applied; it does not make this SQL inert.
-- Server/service-role owned. No cron. No public/anon mutation.

CREATE TABLE IF NOT EXISTS public.sec_edgar_sync_state (
  stream_key text PRIMARY KEY,
  anchor_accessions jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 0,
  anchor_observed_at timestamptz NOT NULL,
  last_success_at timestamptz NOT NULL,
  head_updated_at timestamptz,
  pages_fetched integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sec_edgar_sync_state_stream_key_check
    CHECK (stream_key = 'issuer_direct_latest_filings'),
  CONSTRAINT sec_edgar_sync_state_revision_check
    CHECK (revision >= 0),
  CONSTRAINT sec_edgar_sync_state_pages_fetched_check
    CHECK (pages_fetched >= 0 AND pages_fetched <= 20),
  CONSTRAINT sec_edgar_sync_state_anchors_is_array
    CHECK (
      jsonb_typeof(anchor_accessions) = 'array'
      AND jsonb_array_length(anchor_accessions) BETWEEN 1 AND 100
    )
);

COMMENT ON TABLE public.sec_edgar_sync_state IS
  'Server-owned SEC Latest Filings accession-anchor checkpoint. Not a market-data table.';
COMMENT ON COLUMN public.sec_edgar_sync_state.anchor_accessions IS
  'Observed accession identities from the last successful start=0 page. Not a numeric high-water. Bounded 1..100.';
COMMENT ON COLUMN public.sec_edgar_sync_state.revision IS
  'Optimistic CAS token. Advance only with update-if-revision=N or insert-if-absent bootstrap.';

ALTER TABLE public.sec_edgar_sync_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.sec_edgar_sync_state FROM PUBLIC;
REVOKE ALL ON TABLE public.sec_edgar_sync_state FROM anon;
REVOKE ALL ON TABLE public.sec_edgar_sync_state FROM authenticated;
GRANT ALL ON TABLE public.sec_edgar_sync_state TO service_role;
