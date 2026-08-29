-- AM Intelligence Brief reliability: start weekday index sync early enough
-- that the 08:00 UTC brief-dispatch-am tick sees market_indexes.updated_at
-- within the 10-minute freshness gate.
--
-- Before: */2 9-23 * * 1-5  (first tick 09:00 UTC — after AM dispatch begins)
-- After:  */2 7-23 * * 1-5  (first tick 07:00 UTC; last tick before 08:00 is 07:58)
--
-- Single job rename-in-place. Does not add a second sync-indexes-2min job.
-- Does not touch sync-indexes-2min-early (hour 0 Tue-Sat).
-- Does not touch brief-dispatch-am/pm, 52w cadence, or retention.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-indexes-2min') THEN
    PERFORM cron.unschedule('sync-indexes-2min');
  END IF;
END $$;

SELECT cron.schedule(
  'sync-indexes-2min',
  '*/2 7-23 * * 1-5',
  $$SELECT net.http_post(url := 'https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/sync-indexes', headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sync_secret' LIMIT 1)), body := '{}'::jsonb) AS request_id;$$
);
