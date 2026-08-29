-- Forward-only: high-frequency 52w catch-up cadence activation only.
-- Must run after:
--   1. set-based apply RPC
--   2. 14-day cron history retention
--   3. run-lease schema/RPC install
--   4. deploy of updated sync-screener-52w-baselines (lease acquire/renew)
--   5. deploy of updated radar-worker-bridge
--   6. live verification of lease RPCs/handler and retention
-- This file does not create lease tables or lease RPCs.
--
-- Window (UTC): Mon-Fri 22:00-23:59 and Tue-Sat 00:00-05:59
--   = 22:00 -> 05:59 = 8 hours, spanning midnight.
-- Cadence: every 5 minutes, 4 dates/invocation (unchanged).
--   262 dates / 4 = 66 invocations * 5 min = 330 min = 5.5 hours.
-- Hour ranges do not overlap each other; the already-installed lease
-- guards successive 5-minute Edge invocations that would otherwise overlap.

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
