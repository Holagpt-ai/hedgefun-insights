-- DO NOT APPLY from Cursor / CI.
-- Leftover draft only. Production scheduled ingestion was already activated as cron job 52.
-- A subsequent scheduled run inserted 22 records and advanced the checkpoint.
-- This file is not a live-state record. Do not reschedule it.
-- Gate I.3 production schedule draft for sync-sec-edgar-filings.
-- Requires migrations 20261024103000 + 20261024153000 and Edge deploy.
-- SEC_EDGAR_WRITE_ENABLED and vault SYNC_SECRET must be configured before activation.

-- Cadence: every 30 minutes UTC; ET weekday/window enforced in SQL (DST-safe).
-- Single-flight lease prevents overlapping runs at the same tick.

-- SELECT cron.unschedule('sync-sec-edgar-filings-weekday-et');

-- SELECT cron.schedule(
--   'sync-sec-edgar-filings-weekday-et',
--   '*/30 * * * *',
--   $cmd$
--   SELECT CASE
--     WHEN public.sec_edgar_sync_cron_should_invoke_v1() THEN
--       net.http_post(
--         url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1)
--           || '/functions/v1/sync-sec-edgar-filings',
--         headers := jsonb_build_object(
--           'Content-Type', 'application/json',
--           'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SYNC_SECRET' LIMIT 1)
--         ),
--         body := '{"mode":"write"}'::jsonb
--       )
--     ELSE NULL
--   END AS request_id;
--   $cmd$
-- );

-- Disable: SELECT cron.unschedule('sync-sec-edgar-filings-weekday-et');
-- Manual resume after auto-pause (service_role): SELECT resume_sec_edgar_ingestion_v1('issuer_direct_latest_filings');
