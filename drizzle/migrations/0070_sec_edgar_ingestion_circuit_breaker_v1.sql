-- Gate I.3 — automatic pause on consecutive failures, manual resume, ET cron guard.

ALTER TABLE public.sec_edgar_sync_state
  ADD COLUMN IF NOT EXISTS failure_pause_threshold integer NOT NULL DEFAULT 3;

ALTER TABLE public.sec_edgar_sync_state
  ADD COLUMN IF NOT EXISTS ingestion_paused_at timestamptz;

ALTER TABLE public.sec_edgar_sync_state
  ADD COLUMN IF NOT EXISTS ingestion_pause_reason text;

ALTER TABLE public.sec_edgar_sync_state
  DROP CONSTRAINT IF EXISTS sec_edgar_sync_state_failure_pause_threshold_check;

ALTER TABLE public.sec_edgar_sync_state
  ADD CONSTRAINT sec_edgar_sync_state_failure_pause_threshold_check
  CHECK (failure_pause_threshold BETWEEN 1 AND 20);

COMMENT ON COLUMN public.sec_edgar_sync_state.failure_pause_threshold IS
  'Consecutive qualifying failed runs before ingestion_paused is set automatically.';
COMMENT ON COLUMN public.sec_edgar_sync_state.ingestion_paused_at IS
  'When automatic or manual pause last took effect.';
COMMENT ON COLUMN public.sec_edgar_sync_state.ingestion_pause_reason IS
  'consecutive_failures | manual | null when unpaused.';

CREATE OR REPLACE FUNCTION public.apply_sec_edgar_sync_run_outcome_v1(
  p_stream_key text,
  p_success boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.sec_edgar_sync_state%ROWTYPE;
  v_next integer;
  v_threshold integer;
  v_auto_pause boolean := false;
  v_now timestamptz := now();
BEGIN
  IF p_stream_key IS DISTINCT FROM 'issuer_direct_latest_filings' THEN
    RAISE EXCEPTION 'invalid sec edgar stream key';
  END IF;

  SELECT * INTO v_row
  FROM public.sec_edgar_sync_state
  WHERE stream_key = p_stream_key
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_success THEN
      RETURN jsonb_build_object(
        'consecutive_failures', 0,
        'ingestion_paused', false,
        'auto_pause_applied', false
      );
    END IF;
    RETURN jsonb_build_object(
      'consecutive_failures', 0,
      'ingestion_paused', false,
      'auto_pause_applied', false
    );
  END IF;

  v_threshold := GREATEST(1, LEAST(COALESCE(v_row.failure_pause_threshold, 3), 20));

  IF p_success THEN
    UPDATE public.sec_edgar_sync_state
    SET consecutive_failures = 0,
        updated_at = v_now
    WHERE stream_key = p_stream_key;
    RETURN jsonb_build_object(
      'consecutive_failures', 0,
      'ingestion_paused', v_row.ingestion_paused,
      'auto_pause_applied', false
    );
  END IF;

  v_next := COALESCE(v_row.consecutive_failures, 0) + 1;

  IF v_next >= v_threshold THEN
    v_auto_pause := NOT COALESCE(v_row.ingestion_paused, false);
    UPDATE public.sec_edgar_sync_state
    SET consecutive_failures = v_next,
        ingestion_paused = true,
        ingestion_paused_at = CASE WHEN v_auto_pause THEN v_now ELSE ingestion_paused_at END,
        ingestion_pause_reason = CASE
          WHEN v_auto_pause THEN 'consecutive_failures'
          ELSE COALESCE(ingestion_pause_reason, 'consecutive_failures')
        END,
        updated_at = v_now
    WHERE stream_key = p_stream_key;
    RETURN jsonb_build_object(
      'consecutive_failures', v_next,
      'ingestion_paused', true,
      'auto_pause_applied', v_auto_pause
    );
  END IF;

  UPDATE public.sec_edgar_sync_state
  SET consecutive_failures = v_next,
      updated_at = v_now
  WHERE stream_key = p_stream_key;

  RETURN jsonb_build_object(
    'consecutive_failures', v_next,
    'ingestion_paused', COALESCE(v_row.ingestion_paused, false),
    'auto_pause_applied', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_sec_edgar_ingestion_v1(
  p_stream_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  IF p_stream_key IS DISTINCT FROM 'issuer_direct_latest_filings' THEN
    RAISE EXCEPTION 'invalid sec edgar stream key';
  END IF;
  UPDATE public.sec_edgar_sync_state
  SET ingestion_paused = false,
      ingestion_pause_reason = NULL,
      updated_at = v_now
  WHERE stream_key = p_stream_key;
  RETURN FOUND;
END;
$$;

-- Weekday 4:00–22:00 America/New_York (22:00 exclusive). Used by pg_cron tick (see unapplied-cron.sql).
CREATE OR REPLACE FUNCTION public.sec_edgar_sync_cron_should_invoke_v1()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_local timestamp without time zone;
  v_dow integer;
  v_minutes integer;
BEGIN
  v_local := (now() AT TIME ZONE 'America/New_York');
  v_dow := EXTRACT(ISODOW FROM v_local);
  IF v_dow < 1 OR v_dow > 5 THEN
    RETURN false;
  END IF;
  v_minutes := EXTRACT(HOUR FROM v_local)::integer * 60
    + EXTRACT(MINUTE FROM v_local)::integer;
  IF v_minutes < 240 THEN
    RETURN false;
  END IF;
  IF v_minutes >= 1320 THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_sec_edgar_sync_run_outcome_v1(text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resume_sec_edgar_ingestion_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sec_edgar_sync_cron_should_invoke_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_sec_edgar_sync_run_outcome_v1(text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.resume_sec_edgar_ingestion_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sec_edgar_sync_cron_should_invoke_v1() TO service_role;
