DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'brief-dispatch-am') THEN
    PERFORM cron.unschedule('brief-dispatch-am');
  END IF;
END $$;

SELECT cron.schedule(
  'brief-dispatch-am',
  '*/15 8-14 * * 1-5',
  $cmd$SELECT net.http_post(
    url := 'https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/brief-dispatch',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sync_secret' LIMIT 1)
    ),
    body := '{"briefType":"am"}'::jsonb
  ) AS request_id;$cmd$
);