-- Watchlist V2 provider-call telemetry. Additive counters on watchlist_analysis_runs.
-- Never stores keys, prompts, or model output.

CREATE OR REPLACE FUNCTION public.record_wl_v2_provider_call(
  p_run_id uuid,
  p_provider text,
  p_model text,
  p_ok boolean,
  p_latency_ms integer,
  p_input_tokens integer,
  p_output_tokens integer,
  p_retry_count integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_codes jsonb;
  v_ai jsonb;
BEGIN
  IF p_run_id IS NULL THEN
    RETURN;
  END IF;
  IF p_provider IS NULL OR p_provider !~ '^[a-z][a-z0-9_-]{0,31}$' THEN
    RAISE EXCEPTION 'invalid_ai_provider';
  END IF;

  SELECT coalesce(reason_codes, '{}'::jsonb)
    INTO v_codes
    FROM public.watchlist_analysis_runs
   WHERE run_id = p_run_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_ai := coalesce(v_codes->'ai', '{}'::jsonb);
  v_ai := jsonb_set(v_ai, '{provider}', to_jsonb(p_provider), true);
  IF p_model IS NOT NULL AND length(p_model) > 0 THEN
    v_ai := jsonb_set(v_ai, '{model}', to_jsonb(left(p_model, 64)), true);
  END IF;
  v_ai := jsonb_set(v_ai, '{calls}', to_jsonb(coalesce((v_ai->>'calls')::int, 0) + 1), true);
  IF p_ok THEN
    v_ai := jsonb_set(v_ai, '{ok}', to_jsonb(coalesce((v_ai->>'ok')::int, 0) + 1), true);
  ELSE
    v_ai := jsonb_set(v_ai, '{failed}', to_jsonb(coalesce((v_ai->>'failed')::int, 0) + 1), true);
  END IF;
  IF p_input_tokens IS NOT NULL AND p_input_tokens > 0 THEN
    v_ai := jsonb_set(v_ai, '{input_tokens}', to_jsonb(coalesce((v_ai->>'input_tokens')::int, 0) + p_input_tokens), true);
  END IF;
  IF p_output_tokens IS NOT NULL AND p_output_tokens > 0 THEN
    v_ai := jsonb_set(v_ai, '{output_tokens}', to_jsonb(coalesce((v_ai->>'output_tokens')::int, 0) + p_output_tokens), true);
  END IF;
  IF p_retry_count IS NOT NULL AND p_retry_count > 0 THEN
    v_ai := jsonb_set(v_ai, '{retries}', to_jsonb(coalesce((v_ai->>'retries')::int, 0) + p_retry_count), true);
  END IF;
  IF p_latency_ms IS NOT NULL AND p_latency_ms >= 0 THEN
    v_ai := jsonb_set(v_ai, '{last_latency_ms}', to_jsonb(p_latency_ms), true);
  END IF;
  v_ai := jsonb_set(v_ai, '{fallback}', '"off"'::jsonb, true);

  UPDATE public.watchlist_analysis_runs
     SET reason_codes = jsonb_set(v_codes, '{ai}', v_ai, true)
   WHERE run_id = p_run_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_wl_v2_provider_call(uuid, text, text, boolean, integer, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_wl_v2_provider_call(uuid, text, text, boolean, integer, integer, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_wl_v2_provider_call(uuid, text, text, boolean, integer, integer, integer, integer) TO service_role;
