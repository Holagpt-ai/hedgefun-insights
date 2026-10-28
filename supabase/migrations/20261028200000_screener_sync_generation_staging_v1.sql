-- Batch 190: durable staging for chunked sync-screener-data execution.
-- Forward-only. NOT APPLIED in Cursor — Lovable Cloud applies when approved.

CREATE TABLE IF NOT EXISTS public.screener_sync_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id uuid NOT NULL UNIQUE,
  status text NOT NULL,
  observation jsonb NOT NULL,
  all_tickers jsonb NOT NULL,
  gainers jsonb NOT NULL DEFAULT '[]'::jsonb,
  losers jsonb NOT NULL DEFAULT '[]'::jsonb,
  chunk_size integer NOT NULL,
  next_chunk_index integer NOT NULL DEFAULT 0,
  total_chunks integer NOT NULL,
  merged_artifacts jsonb NOT NULL DEFAULT '{}'::jsonb,
  lease_token uuid,
  lease_expires_at timestamptz,
  nhl_baseline_loaded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT screener_sync_generation_jobs_status_check
    CHECK (status IN ('chunking', 'finalizing', 'published', 'failed', 'aborted')),
  CONSTRAINT screener_sync_generation_jobs_chunk_nonneg
    CHECK (chunk_size > 0 AND total_chunks > 0 AND next_chunk_index >= 0)
);

COMMENT ON TABLE public.screener_sync_generation_jobs IS
  'In-progress sync-screener-data generations. Chunked CPU work; atomic publish via replace_screener_results_generation_v1 at finalize.';

CREATE INDEX IF NOT EXISTS screener_sync_generation_jobs_status_idx
  ON public.screener_sync_generation_jobs (status, updated_at DESC);

ALTER TABLE public.screener_sync_generation_jobs ENABLE ROW LEVEL SECURITY;

-- Service role only (Edge sync-screener-data).
REVOKE ALL ON public.screener_sync_generation_jobs FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.screener_sync_generation_jobs TO service_role;
