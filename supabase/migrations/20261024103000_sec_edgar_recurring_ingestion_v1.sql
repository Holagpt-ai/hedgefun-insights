-- Gate I — SEC EDGAR recurring ingestion: run lease, run telemetry, pause/failure counters.
-- Does not schedule cron. Reuses stream_key issuer_direct_latest_filings.

CREATE TABLE IF NOT EXISTS public.sec_edgar_sync_lease (
  stream_key text PRIMARY KEY,
  holder_id text NOT NULL,
  acquired_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CONSTRAINT sec_edgar_sync_lease_stream_key_check
    CHECK (stream_key = 'issuer_direct_latest_filings')
);

COMMENT ON TABLE public.sec_edgar_sync_lease IS
  'Single-flight lease for sync-sec-edgar-filings. Prevents overlapping SEC walks.';

ALTER TABLE public.sec_edgar_sync_lease ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sec_edgar_sync_lease FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.sec_edgar_sync_lease TO service_role;

CREATE TABLE IF NOT EXISTS public.sec_edgar_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_key text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('dry_run', 'write')),
  status text NOT NULL CHECK (status IN ('ok', 'error', 'lease_busy', 'paused', 'write_disabled')),
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  error_code text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sec_edgar_sync_runs_stream_key_check
    CHECK (stream_key = 'issuer_direct_latest_filings')
);

CREATE INDEX IF NOT EXISTS sec_edgar_sync_runs_started_idx
  ON public.sec_edgar_sync_runs (started_at DESC);

ALTER TABLE public.sec_edgar_sync_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sec_edgar_sync_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.sec_edgar_sync_runs TO service_role;

ALTER TABLE public.sec_edgar_sync_state
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0;

ALTER TABLE public.sec_edgar_sync_state
  ADD COLUMN IF NOT EXISTS ingestion_paused boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sec_edgar_sync_state.consecutive_failures IS
  'Incremented on failed runs (provider/checkpoint/unknown). Reset on successful write or dry_run ok.';
COMMENT ON COLUMN public.sec_edgar_sync_state.ingestion_paused IS
  'When true, write-mode sync returns paused without SEC provider calls.';

CREATE OR REPLACE FUNCTION public.try_acquire_sec_edgar_sync_lease_v1(
  p_stream_key text,
  p_holder_id text,
  p_ttl_seconds integer DEFAULT 900
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_ttl integer := GREATEST(60, LEAST(COALESCE(p_ttl_seconds, 900), 3600));
  v_existing public.sec_edgar_sync_lease%ROWTYPE;
BEGIN
  IF p_stream_key IS DISTINCT FROM 'issuer_direct_latest_filings' THEN
    RAISE EXCEPTION 'invalid sec edgar stream key';
  END IF;
  IF p_holder_id IS NULL OR length(btrim(p_holder_id)) = 0 THEN
    RAISE EXCEPTION 'holder_id required';
  END IF;

  SELECT * INTO v_existing
  FROM public.sec_edgar_sync_lease
  WHERE stream_key = p_stream_key
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.sec_edgar_sync_lease (stream_key, holder_id, acquired_at, expires_at)
    VALUES (p_stream_key, p_holder_id, v_now, v_now + make_interval(secs => v_ttl));
    RETURN true;
  END IF;

  IF v_existing.expires_at <= v_now OR v_existing.holder_id = p_holder_id THEN
    UPDATE public.sec_edgar_sync_lease
    SET holder_id = p_holder_id,
        acquired_at = v_now,
        expires_at = v_now + make_interval(secs => v_ttl)
    WHERE stream_key = p_stream_key;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_sec_edgar_sync_lease_v1(
  p_stream_key text,
  p_holder_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_stream_key IS DISTINCT FROM 'issuer_direct_latest_filings' THEN
    RAISE EXCEPTION 'invalid sec edgar stream key';
  END IF;
  DELETE FROM public.sec_edgar_sync_lease
  WHERE stream_key = p_stream_key AND holder_id = p_holder_id;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.try_acquire_sec_edgar_sync_lease_v1(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_sec_edgar_sync_lease_v1(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_acquire_sec_edgar_sync_lease_v1(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_sec_edgar_sync_lease_v1(text, text) TO service_role;
