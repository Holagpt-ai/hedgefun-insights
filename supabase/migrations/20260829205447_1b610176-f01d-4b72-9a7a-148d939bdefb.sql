-- Forward-only: high-frequency 52w catch-up cadence activation only.
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