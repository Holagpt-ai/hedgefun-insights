-- W2-R1 R1-2: convert cron jobids 25 and 26 from literal credentials
-- to call-time Vault reads. Job identities, schedules and active states remain unchanged.
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobid = 25
      AND jobname = 'sync-screener-every-5min'
  ) THEN
    RAISE EXCEPTION 'W2-R1 R1-2: expected cron jobid 25 sync-screener-every-5min';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobid = 26
      AND jobname = 'sync-game-prices'
  ) THEN
    RAISE EXCEPTION 'W2-R1 R1-2: expected cron jobid 26 sync-game-prices';
  END IF;
END;
$guard$;

SELECT cron.alter_job(
  job_id := 25,
  command := $cron25$
DO $cmd$
DECLARE
  v_secret_count integer;
  v_secret text;
  v_request_id bigint;
BEGIN
  SELECT count(*) INTO v_secret_count
  FROM vault.decrypted_secrets
  WHERE name = 'sync_secret';
  IF v_secret_count <> 1 THEN
    RAISE WARNING 'sync-screener-every-5min: expected exactly one Vault sync_secret row; request skipped';
    RETURN;
  END IF;
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'sync_secret';
  SELECT net.http_post(
    url := 'https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/sync-screener-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb
  ) INTO v_request_id;
END;
$cmd$;
$cron25$
);

SELECT cron.alter_job(
  job_id := 26,
  command := $cron26$
DO $cmd$
DECLARE
  v_secret_count integer;
  v_secret text;
  v_request_id bigint;
BEGIN
  SELECT count(*) INTO v_secret_count
  FROM vault.decrypted_secrets
  WHERE name = 'sync_secret';
  IF v_secret_count <> 1 THEN
    RAISE WARNING 'sync-game-prices: expected exactly one Vault sync_secret row; request skipped';
    RETURN;
  END IF;
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'sync_secret';
  SELECT net.http_post(
    url := 'https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/game-sync-prices',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb
  ) INTO v_request_id;
END;
$cmd$;
$cron26$
);