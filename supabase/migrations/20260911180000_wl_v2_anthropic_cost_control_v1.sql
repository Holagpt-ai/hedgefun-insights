-- Watchlist V2 Anthropic cost control V1.
-- Ticker-level analysis lease persisted on watchlist_analysis_requests.
-- The lease row (not a short advisory-lock transaction) serializes Claude calls.

ALTER TABLE public.watchlist_analysis_requests
  ADD COLUMN IF NOT EXISTS session_date date,
  ADD COLUMN IF NOT EXISTS session_type public.watchlist_session,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS watchlist_analysis_requests_active_ticker_lease_idx
  ON public.watchlist_analysis_requests (ticker, session_date, session_type)
  WHERE status = 'pending' AND lease_expires_at IS NOT NULL;

-- Clear the lease when a request leaves pending so a crashed holder cannot
-- keep the unique slot after finalize/fail/skip. Expired pending leases are
-- reclaimed by claim_watchlist_v2_ticker_lease.
CREATE OR REPLACE FUNCTION public._wl_v2_clear_ticker_lease()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.lease_expires_at := NULL;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_wl_v2_clear_lease_on_complete ON public.watchlist_analysis_requests;
CREATE TRIGGER trg_wl_v2_clear_lease_on_complete
BEFORE UPDATE ON public.watchlist_analysis_requests
FOR EACH ROW
WHEN (OLD.status = 'pending' AND NEW.status IN ('succeeded', 'failed'))
EXECUTE FUNCTION public._wl_v2_clear_ticker_lease();

CREATE OR REPLACE FUNCTION public.record_wl_v2_claude_decision(
  p_run_id uuid,
  p_decision text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_bucket text;
  v_codes jsonb;
BEGIN
  IF p_run_id IS NULL THEN
    RETURN;
  END IF;
  IF p_decision NOT IN (
    'claude_called_new',
    'claude_called_expired_changed',
    'claude_called_manual',
    'skipped_still_valid',
    'skipped_unchanged',
    'skipped_insufficient_data',
    'skipped_in_flight',
    'error'
  ) THEN
    RAISE EXCEPTION 'invalid_claude_decision';
  END IF;

  IF p_decision IN (
    'claude_called_new',
    'claude_called_expired_changed',
    'claude_called_manual'
  ) THEN
    v_bucket := 'claude_called';
  ELSIF p_decision = 'error' THEN
    v_bucket := 'error';
  ELSE
    v_bucket := 'claude_skipped';
  END IF;

  UPDATE public.watchlist_analysis_runs r
     SET reason_codes = CASE
       WHEN coalesce(r.reason_codes, '{}'::jsonb) ? 'claude' THEN r.reason_codes
       ELSE jsonb_set(coalesce(r.reason_codes, '{}'::jsonb), '{claude}', '{}'::jsonb, true)
     END
   WHERE r.run_id = p_run_id;

  SELECT coalesce(reason_codes, '{}'::jsonb) INTO v_codes
    FROM public.watchlist_analysis_runs
   WHERE run_id = p_run_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_codes := jsonb_set(v_codes, '{claude}', coalesce(v_codes->'claude', '{}'::jsonb), true);
  v_codes := jsonb_set(
    v_codes,
    ARRAY['claude', p_decision],
    to_jsonb(coalesce((v_codes->'claude'->>p_decision)::int, 0) + 1),
    true
  );
  v_codes := jsonb_set(
    v_codes,
    ARRAY['claude', v_bucket],
    to_jsonb(coalesce((v_codes->'claude'->>v_bucket)::int, 0) + 1),
    true
  );

  UPDATE public.watchlist_analysis_runs
     SET reason_codes = v_codes
   WHERE run_id = p_run_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_wl_v2_claude_decision(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_wl_v2_claude_decision(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_wl_v2_claude_decision(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_watchlist_v2_ticker_lease(
  p_request_id uuid,
  p_ticker text,
  p_session_date date,
  p_session_type public.watchlist_session,
  p_lease_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz := now();
  v_expires timestamptz;
  v_status text;
  v_ticker text;
  v_holder uuid;
  v_holder_expires timestamptz;
BEGIN
  IF p_request_id IS NULL OR p_ticker IS NULL OR p_session_date IS NULL OR p_session_type IS NULL THEN
    RAISE EXCEPTION 'missing_parameters';
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 15 OR p_lease_seconds > 300 THEN
    RAISE EXCEPTION 'invalid_lease_seconds';
  END IF;

  SELECT status, ticker
    INTO v_status, v_ticker
    FROM public.watchlist_analysis_requests
   WHERE id = p_request_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;
  IF v_ticker <> p_ticker THEN
    RAISE EXCEPTION 'ticker_mismatch';
  END IF;
  IF v_status <> 'pending' THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'request_not_pending');
  END IF;

  v_expires := v_now + make_interval(secs => p_lease_seconds);

  -- Expired pending leases are reclaimable so a crashed Edge Function cannot
  -- permanently block analysis.
  UPDATE public.watchlist_analysis_requests
     SET lease_expires_at = NULL
   WHERE ticker = p_ticker
     AND session_date = p_session_date
     AND session_type = p_session_type
     AND status = 'pending'
     AND lease_expires_at IS NOT NULL
     AND lease_expires_at <= v_now;

  SELECT id, lease_expires_at
    INTO v_holder, v_holder_expires
    FROM public.watchlist_analysis_requests
   WHERE ticker = p_ticker
     AND session_date = p_session_date
     AND session_type = p_session_type
     AND status = 'pending'
     AND lease_expires_at IS NOT NULL
     AND lease_expires_at > v_now
     AND id <> p_request_id
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'acquired', false,
      'holder_request_id', v_holder,
      'lease_expires_at', v_holder_expires
    );
  END IF;

  BEGIN
    UPDATE public.watchlist_analysis_requests
       SET session_date = p_session_date,
           session_type = p_session_type,
           lease_expires_at = v_expires
     WHERE id = p_request_id
       AND status = 'pending';
  EXCEPTION WHEN unique_violation THEN
    SELECT id, lease_expires_at
      INTO v_holder, v_holder_expires
      FROM public.watchlist_analysis_requests
     WHERE ticker = p_ticker
       AND session_date = p_session_date
       AND session_type = p_session_type
       AND status = 'pending'
       AND lease_expires_at IS NOT NULL
       AND lease_expires_at > v_now
       AND id <> p_request_id
     LIMIT 1;
    RETURN jsonb_build_object(
      'acquired', false,
      'holder_request_id', v_holder,
      'lease_expires_at', v_holder_expires,
      'reason', 'lost_race'
    );
  END;

  RETURN jsonb_build_object(
    'acquired', true,
    'holder_request_id', p_request_id,
    'lease_expires_at', v_expires
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_watchlist_v2_ticker_lease(uuid, text, date, public.watchlist_session, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_watchlist_v2_ticker_lease(uuid, text, date, public.watchlist_session, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_watchlist_v2_ticker_lease(uuid, text, date, public.watchlist_session, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.release_watchlist_v2_ticker_lease(
  p_request_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_request_id IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.watchlist_analysis_requests
     SET lease_expires_at = NULL
   WHERE id = p_request_id
     AND status = 'pending';
END;
$function$;

REVOKE ALL ON FUNCTION public.release_watchlist_v2_ticker_lease(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_watchlist_v2_ticker_lease(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_watchlist_v2_ticker_lease(uuid) TO service_role;

-- Completes a request without inserting watchlist_analysis_history.
-- Optional valid_through extension reuses the prior narrative/direction.
CREATE OR REPLACE FUNCTION public.skip_watchlist_analysis_v2(
  p_request_id uuid,
  p_user_id uuid,
  p_ticker text,
  p_run_id uuid,
  p_decision text,
  p_extend_valid_through timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_status text;
  v_req_user uuid;
  v_req_ticker text;
  v_analyzed_at timestamptz;
BEGIN
  IF p_request_id IS NULL OR p_user_id IS NULL OR p_ticker IS NULL OR p_decision IS NULL THEN
    RAISE EXCEPTION 'missing_parameters';
  END IF;
  IF p_decision NOT IN (
    'skipped_still_valid',
    'skipped_unchanged',
    'skipped_in_flight'
  ) THEN
    RAISE EXCEPTION 'invalid_skip_decision';
  END IF;
  IF p_decision = 'skipped_unchanged' AND p_extend_valid_through IS NULL THEN
    RAISE EXCEPTION 'missing_valid_through';
  END IF;

  SELECT status, user_id, ticker
    INTO v_status, v_req_user, v_req_ticker
    FROM public.watchlist_analysis_requests
   WHERE id = p_request_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;
  IF v_req_user <> p_user_id THEN
    RAISE EXCEPTION 'user_mismatch';
  END IF;
  IF v_req_ticker <> p_ticker THEN
    RAISE EXCEPTION 'ticker_mismatch';
  END IF;
  IF v_status = 'succeeded' THEN
    RETURN jsonb_build_object('status', 'already_finalized', 'history_inserted', false);
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'request_already_finalized';
  END IF;

  IF p_extend_valid_through IS NOT NULL THEN
    SELECT analyzed_at INTO v_analyzed_at
      FROM public.watchlist_analysis_v2
     WHERE ticker = p_ticker;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'analysis_not_found';
    END IF;
    IF p_extend_valid_through <= v_analyzed_at THEN
      RAISE EXCEPTION 'valid_through_not_after_analyzed_at';
    END IF;
    UPDATE public.watchlist_analysis_v2
       SET valid_through = p_extend_valid_through
     WHERE ticker = p_ticker;
    -- Intentionally no INSERT into watchlist_analysis_history.
  END IF;

  UPDATE public.watchlist_analysis_requests
     SET status = 'succeeded',
         completed_at = now(),
         error_code = NULL,
         session_date = coalesce(session_date, (SELECT session_date FROM public.watchlist_analysis_v2 WHERE ticker = p_ticker)),
         session_type = coalesce(session_type, (SELECT session_type FROM public.watchlist_analysis_v2 WHERE ticker = p_ticker))
   WHERE id = p_request_id;

  IF p_run_id IS NOT NULL THEN
    UPDATE public.watchlist_analysis_runs
       SET tickers_total = coalesce(tickers_total, 0) + 1,
           tickers_ok    = coalesce(tickers_ok, 0) + 1
     WHERE run_id = p_run_id AND status = 'running';
    PERFORM public.record_wl_v2_claude_decision(p_run_id, p_decision);
  END IF;

  RETURN jsonb_build_object(
    'status', 'succeeded',
    'history_inserted', false,
    'decision', p_decision
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.skip_watchlist_analysis_v2(uuid, uuid, text, uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.skip_watchlist_analysis_v2(uuid, uuid, text, uuid, text, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.skip_watchlist_analysis_v2(uuid, uuid, text, uuid, text, timestamptz) TO service_role;
