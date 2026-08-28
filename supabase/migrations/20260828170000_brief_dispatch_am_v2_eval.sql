-- AM Intelligence Brief V2: evaluate every 15 minutes across a UTC range
-- wide enough for EST and EDT. The dispatcher still fail-closes outside
-- 4:00–9:30 America/New_York.
--
-- UTC 08:00 = 4:00 AM EDT / 3:00 AM EST
-- UTC 14:45 = 10:45 AM EDT / 9:45 AM EST
--
-- Do NOT rewrite historical migrations. Do NOT touch brief-dispatch-pm.

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

-- Rollback (documented, not executed):
-- SELECT cron.unschedule('brief-dispatch-am');
-- then restore the prior AM schedule from 20260713173443.
