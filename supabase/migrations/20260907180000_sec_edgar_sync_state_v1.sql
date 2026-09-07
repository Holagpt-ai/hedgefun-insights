-- SEC EDGAR V1C accession-anchor checkpoint.
-- CODE ARTIFACT ONLY. Do not apply to production in this sprint.
-- Server/service-role owned. No cron. No public/anon mutation.

CREATE TABLE IF NOT EXISTS public.sec_edgar_sync_state (
  stream_key text PRIMARY KEY,
  anchor_accessions jsonb NOT NULL DEFAULT '[]'::jsonb,
  anchor_observed_at timestamptz NOT NULL,
  last_success_at timestamptz NOT NULL,
  head_updated_at timestamptz,
  pages_fetched integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sec_edgar_sync_state_stream_key_check
    CHECK (stream_key = 'issuer_direct_latest_filings'),
  CONSTRAINT sec_edgar_sync_state_pages_fetched_check
    CHECK (pages_fetched >= 0 AND pages_fetched <= 20),
  CONSTRAINT sec_edgar_sync_state_anchors_is_array
    CHECK (jsonb_typeof(anchor_accessions) = 'array')
);

COMMENT ON TABLE public.sec_edgar_sync_state IS
  'Server-owned SEC Latest Filings accession-anchor checkpoint. Not a market-data table.';
COMMENT ON COLUMN public.sec_edgar_sync_state.anchor_accessions IS
  'Observed accession identities from the last successful start=0 page. Not a numeric high-water.';

ALTER TABLE public.sec_edgar_sync_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.sec_edgar_sync_state FROM PUBLIC;
REVOKE ALL ON TABLE public.sec_edgar_sync_state FROM anon;
REVOKE ALL ON TABLE public.sec_edgar_sync_state FROM authenticated;
GRANT ALL ON TABLE public.sec_edgar_sync_state TO service_role;
