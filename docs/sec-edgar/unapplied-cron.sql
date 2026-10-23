-- DO NOT APPLY from Cursor / CI.
-- Gate I draft: vault-backed pg_cron → sync-sec-edgar-filings.
-- Requires migration 20261024103000_sec_edgar_recurring_ingestion_v1.sql and Edge deploy.
-- Pattern follows 20260720201554_w2r1_convert_crons_to_vault.sql (net.http_post + vault secret).

-- Preconditions:
--   SEC_EDGAR_WRITE_ENABLED=true on Edge (only when ops approves writes)
--   SYNC_SECRET in vault; cron body MUST include {"mode":"write"} for writes
--   Single-flight lease prevents overlapping runs at */5 cadence

-- Example (replace placeholders; unschedule names must be unique per environment):

-- SELECT cron.unschedule('sync-sec-edgar-filings-weekday-est-day');
-- SELECT cron.schedule(
--   'sync-sec-edgar-filings-weekday-est-day',
--   '*/5 9-23 * * 1-5',
--   $$
--   SELECT net.http_post(
--     url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/sync-sec-edgar-filings',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SYNC_SECRET')
--     ),
--     body := '{"mode":"write"}'::jsonb
--   ) AS request_id;
--   $$
-- );

-- Weekday EST late window (UTC 0–2, Tue–Sat for Mon–Fri ET evening):
-- SELECT cron.schedule(
--   'sync-sec-edgar-filings-weekday-est-late',
--   '*/5 0-2 * * 2-6',
--   $$ /* same http_post body */ $$
-- );

-- Weekday EDT sketches (see overlap-and-cadence.md):
--   Day:   '*/5 8-23 * * 1-5'
--   Late:  '*/5 0-1 * * 2-6'

-- Weekend: prefer disabled or */30 until weekday stability is proven.

-- Dry-run cron (optional ops validation only — no checkpoint advance in dry_run):
-- body := '{}'::jsonb
