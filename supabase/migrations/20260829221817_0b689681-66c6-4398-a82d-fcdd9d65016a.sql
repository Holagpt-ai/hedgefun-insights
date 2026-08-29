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