-- Batch 190.6: durable staged finalization abort diagnostics (ISS-034 acceptance evidence).
-- NOT APPLIED in Cursor — Lovable Cloud applies when approved.

ALTER TABLE public.screener_sync_generation_jobs
  ADD COLUMN IF NOT EXISTS abort_reason text,
  ADD COLUMN IF NOT EXISTS abort_evidence jsonb;

ALTER TABLE public.screener_sync_generation_jobs
  DROP CONSTRAINT IF EXISTS screener_sync_generation_jobs_abort_reason_check;

ALTER TABLE public.screener_sync_generation_jobs
  ADD CONSTRAINT screener_sync_generation_jobs_abort_reason_check
  CHECK (
    abort_reason IS NULL
    OR abort_reason IN (
      'prior_generation_retained',
      'newer_generation_live'
    )
  );

ALTER TABLE public.screener_sync_generation_jobs
  DROP CONSTRAINT IF EXISTS screener_sync_generation_jobs_abort_evidence_size_check;

ALTER TABLE public.screener_sync_generation_jobs
  ADD CONSTRAINT screener_sync_generation_jobs_abort_evidence_size_check
  CHECK (
    abort_evidence IS NULL
    OR pg_column_size(abort_evidence) <= 4096
  );

COMMENT ON COLUMN public.screener_sync_generation_jobs.abort_reason IS
  'Terminal abort classifier when status=aborted (finalization decision). Distinct from continue_last_error.';

COMMENT ON COLUMN public.screener_sync_generation_jobs.abort_evidence IS
  'Compact JSONB summary for abort_reason (protected-tab preservation comparison or candidate ids).';
