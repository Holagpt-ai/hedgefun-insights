-- Forward-only: replace the once-per-weekday 21:30 UTC 52w baseline cron
-- with two non-overlapping after-close / overnight jobs.
--
-- Window (UTC): Mon-Fri 22:00-23:59 and Tue-Sat 00:00-05:59
--   = 22:00 -> 05:59 = 8 hours, spanning midnight.
-- Cadence: every 5 minutes, 4 dates/invocation (unchanged).
--   262 dates / 4 = 66 invocations * 5 min = 330 min = 5.5 hours.
-- Does not run 06:00-21:59 UTC (covers regular US equity hours).
-- Re-runs are cheap no-ops once the published baseline period_end is current.
-- Idempotent: unschedules existing 52w baseline dispatch jobs first.

DO $setup$
DECLARE
  v_job_id bigint;
  v_dispatch text;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'sync-screener-52w-baselines-after-close',
      'sync-screener-52w-baselines-overnight'
    )
    OR command LIKE '%/functions/v1/sync-screener-52w-baselines%'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  v_dispatch := $cmd$
SELECT net.http_post(
  url := 'https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/sync-screener-52w-baselines',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sync_secret' LIMIT 1)
  ),
  body := '{}'::jsonb
) AS request_id;
$cmd$;

  PERFORM cron.schedule(
    'sync-screener-52w-baselines-after-close',
    '*/5 22-23 * * 1-5',
    v_dispatch
  );

  PERFORM cron.schedule(
    'sync-screener-52w-baselines-overnight',
    '*/5 0-5 * * 2-6',
    v_dispatch
  );
END;
$setup$;
