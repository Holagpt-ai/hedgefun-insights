DO $mig$
DECLARE
  v_count integer;
  v_secret text;
BEGIN
  SELECT count(*) INTO v_count
  FROM vault.decrypted_secrets
  WHERE name = 'sync_secret' AND decrypted_secret IS NOT NULL AND length(decrypted_secret) > 0;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'sync_secret vault entry missing, blank, or duplicated (count=%)', v_count;
  END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'sync_secret' LIMIT 1;
  IF v_secret IS NULL OR length(v_secret) = 0 THEN
    RAISE EXCEPTION 'sync_secret vault entry blank';
  END IF;
END $mig$;

-- Guardedly unschedule prior jobs of these exact names.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'brief-dispatch-am') THEN
    PERFORM cron.unschedule('brief-dispatch-am');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'brief-dispatch-pm') THEN
    PERFORM cron.unschedule('brief-dispatch-pm');
  END IF;
END $$;

SELECT cron.schedule(
  'brief-dispatch-am',
  '*/5 10-11 * * 1-5',
  $cmd$SELECT net.http_post(
    url := 'https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/brief-dispatch',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sync_secret' LIMIT 1)
    ),
    body := '{"briefType":"am"}'::jsonb
  ) AS request_id;$cmd$
);

SELECT cron.schedule(
  'brief-dispatch-pm',
  '*/5 17-22 * * 1-5',
  $cmd$SELECT net.http_post(
    url := 'https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/brief-dispatch',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sync_secret' LIMIT 1)
    ),
    body := '{"briefType":"pm"}'::jsonb
  ) AS request_id;$cmd$
);

-- Rollback (documented, not executed):
-- SELECT cron.unschedule('brief-dispatch-am');
-- SELECT cron.unschedule('brief-dispatch-pm');