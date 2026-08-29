-- Forward-only: bounded 14-day retention for cron.job_run_details.
-- Deletes only completed rows older than 14 days, oldest-first, 5000/run.
-- Does not TRUNCATE, VACUUM FULL, or touch running/in-flight rows.
--
-- Ordered before lease install and catch-up cadence so high-frequency 52w
-- invocations cannot become active if this privilege-gated install fails.
--
-- Post-deploy (Lovable, after the backlog has drained; do not run in this PR):
--   VACUUM (ANALYZE) cron.job_run_details;
-- is appropriate to update planner stats and reclaim dead-tuple space
-- for reuse inside the table. It does not shrink the file on disk
-- the way VACUUM FULL would, and should be run in a low-traffic window.

DO $guard$
DECLARE
  v_missing text;
BEGIN
  IF to_regclass('cron.job_run_details') IS NULL THEN
    RAISE EXCEPTION
      'blocker: cron.job_run_details does not exist; 14-day retention cannot be installed';
  END IF;

  SELECT string_agg(col, ', ' ORDER BY col)
    INTO v_missing
  FROM (VALUES ('runid'), ('status'), ('end_time')) AS expected(col)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'cron'
      AND c.relname = 'job_run_details'
      AND a.attname = expected.col
      AND a.attnum > 0
      AND NOT a.attisdropped
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'blocker: cron.job_run_details missing columns: %', v_missing;
  END IF;

  IF NOT has_table_privilege('cron.job_run_details', 'SELECT')
     OR NOT has_table_privilege('cron.job_run_details', 'DELETE') THEN
    RAISE EXCEPTION
      'blocker: current role lacks SELECT/DELETE on cron.job_run_details; 14-day retention cannot be installed without inventing grants';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.prune_cron_job_run_details_v1()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_deleted integer := 0;
  v_cutoff timestamptz := clock_timestamp() - interval '14 days';
BEGIN
  IF NOT pg_try_advisory_xact_lock(
    ('x' || substr(md5('prune_cron_job_run_details_v1'), 1, 16))::bit(64)::bigint
  ) THEN
    RETURN 0;
  END IF;

  DELETE FROM cron.job_run_details
  WHERE runid IN (
    SELECT d.runid
    FROM cron.job_run_details AS d
    WHERE d.end_time IS NOT NULL
      AND d.end_time < v_cutoff
      AND d.status IN ('succeeded', 'failed')
    ORDER BY d.runid
    LIMIT 5000
  );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$fn$;

COMMENT ON FUNCTION public.prune_cron_job_run_details_v1() IS
  'Bounded 14-day retention for completed cron.job_run_details rows. Max 5000 rows per call, oldest runid first. Does not touch running jobs.';

REVOKE ALL ON FUNCTION public.prune_cron_job_run_details_v1()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prune_cron_job_run_details_v1()
  FROM anon;
REVOKE ALL ON FUNCTION public.prune_cron_job_run_details_v1()
  FROM authenticated;

DO $schedule$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'prune-cron-job-run-details-14d'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'prune-cron-job-run-details-14d',
    '*/15 * * * *',
    $cmd$SELECT public.prune_cron_job_run_details_v1();$cmd$
  );
END
$schedule$;
