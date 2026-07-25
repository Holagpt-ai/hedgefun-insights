-- Forward-only: schedule the two Catalyst ingestion cron jobs.
-- Never modifies watchlist / earnings / market-data / brief / rvol jobs.

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid FROM cron.job
     WHERE jobname IN (
       'sync-catalyst-events-15min-weekdays',
       'sync-catalyst-events-hourly-weekends'
     )
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;
END $$;

DO $$
DECLARE
  v_secret_count int;
  v_secret text;
BEGIN
  SELECT count(*) INTO v_secret_count
    FROM vault.decrypted_secrets WHERE name = 'sync_secret';
  IF v_secret_count <> 1 THEN
    RAISE EXCEPTION 'catalyst_cron_setup: expected exactly one vault secret sync_secret, found %', v_secret_count;
  END IF;
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'sync_secret';

  PERFORM cron.schedule(
    'sync-catalyst-events-15min-weekdays',
    '*/15 * * * 1-5',
    format($cron$
      SELECT net.http_post(
        url     := 'https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/sync-catalyst-events',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sync_secret')
        ),
        body    := '{}'::jsonb
      );
    $cron$)
  );

  PERFORM cron.schedule(
    'sync-catalyst-events-hourly-weekends',
    '0 * * * 0,6',
    format($cron$
      SELECT net.http_post(
        url     := 'https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/sync-catalyst-events',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sync_secret')
        ),
        body    := '{}'::jsonb
      );
    $cron$)
  );
END $$;