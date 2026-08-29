-- Forward-only: durable 52w catch-up run lease, then high-frequency cadence.
-- Must run after 14-day cron history retention so catch-up cannot activate
-- if retention failed to install.
--
-- Lease: single-row TTL lock. Acquisition is one INSERT ... ON CONFLICT
-- (lease_key) DO UPDATE ... WHERE same-holder OR expired ... RETURNING.
-- Concurrent first-acquires serialize on the primary key; the loser gets
-- DO UPDATE, the WHERE fails if the winner is still live, and the function
-- returns false. It cannot raise unique_violation. Release DELETEs only
-- the matching holder; an empty table after release is safe because the
-- next acquire is the same atomic INSERT. expires_at <= now lets a later
-- invocation recover if the previous Edge request died. Same holder can
-- renew. Default TTL 6 minutes (max 8). Does not wedge the job permanently.
--
-- Window (UTC): Mon-Fri 22:00-23:59 and Tue-Sat 00:00-05:59
--   = 22:00 -> 05:59 = 8 hours, spanning midnight.
-- Cadence: every 5 minutes, 4 dates/invocation (unchanged).
--   262 dates / 4 = 66 invocations * 5 min = 330 min = 5.5 hours.
-- Hour ranges do not overlap each other; the lease guards successive
-- 5-minute Edge invocations that would otherwise overlap in time.

CREATE TABLE IF NOT EXISTS public.screener_52w_baseline_run_lease (
  lease_key text PRIMARY KEY,
  holder_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT screener_52w_baseline_run_lease_key_check
    CHECK (lease_key = 'current')
);

ALTER TABLE public.screener_52w_baseline_run_lease ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.screener_52w_baseline_run_lease FROM PUBLIC;
REVOKE ALL ON TABLE public.screener_52w_baseline_run_lease FROM anon;
REVOKE ALL ON TABLE public.screener_52w_baseline_run_lease FROM authenticated;
GRANT ALL ON TABLE public.screener_52w_baseline_run_lease TO service_role;

CREATE OR REPLACE FUNCTION public.try_acquire_screener_52w_baseline_run_lease_v1(
  p_holder_id text,
  p_ttl_ms integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_ttl integer := GREATEST(1000, LEAST(COALESCE(p_ttl_ms, 360000), 480000));
  v_got text;
BEGIN
  IF p_holder_id IS NULL OR length(trim(p_holder_id)) = 0
     OR char_length(p_holder_id) > 200 THEN
    RAISE EXCEPTION 'holder required';
  END IF;

  INSERT INTO public.screener_52w_baseline_run_lease (
    lease_key, holder_id, expires_at, updated_at
  ) VALUES (
    'current',
    p_holder_id,
    v_now + make_interval(secs => v_ttl / 1000.0),
    v_now
  )
  ON CONFLICT (lease_key) DO UPDATE
  SET holder_id = EXCLUDED.holder_id,
      expires_at = EXCLUDED.expires_at,
      updated_at = EXCLUDED.updated_at
  WHERE public.screener_52w_baseline_run_lease.holder_id = EXCLUDED.holder_id
     OR public.screener_52w_baseline_run_lease.expires_at <= v_now
  RETURNING public.screener_52w_baseline_run_lease.lease_key
  INTO v_got;

  RETURN v_got IS NOT NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.release_screener_52w_baseline_run_lease_v1(
  p_holder_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  DELETE FROM public.screener_52w_baseline_run_lease
  WHERE lease_key = 'current'
    AND holder_id = p_holder_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.try_acquire_screener_52w_baseline_run_lease_v1(text, integer)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.try_acquire_screener_52w_baseline_run_lease_v1(text, integer)
  FROM anon;
REVOKE ALL ON FUNCTION public.try_acquire_screener_52w_baseline_run_lease_v1(text, integer)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.try_acquire_screener_52w_baseline_run_lease_v1(text, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.release_screener_52w_baseline_run_lease_v1(text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_screener_52w_baseline_run_lease_v1(text)
  FROM anon;
REVOKE ALL ON FUNCTION public.release_screener_52w_baseline_run_lease_v1(text)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_screener_52w_baseline_run_lease_v1(text)
  TO service_role;

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
