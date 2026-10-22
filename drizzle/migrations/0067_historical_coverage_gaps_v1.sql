-- Historical coverage gaps (Batch 33.5): explicit provenance for entitlement-restricted intervals.
-- No OHLCV fabrication; OPEN gaps may be revisited when provider entitlements change.

CREATE TABLE IF NOT EXISTS public.security_historical_coverage_gaps (
  gap_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  security_id uuid NOT NULL REFERENCES public.securities (security_id),
  observed_symbol text NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL,
  provider text NOT NULL,
  restriction_reason text NOT NULL,
  coverage_state text NOT NULL,
  provider_request_id text,
  provider_status text,
  provider_message text,
  observed_at timestamptz NOT NULL,
  backfill_job_id uuid REFERENCES public.security_backfill_jobs (job_id),
  resolution_state text NOT NULL DEFAULT 'OPEN',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_historical_coverage_gaps_symbol_check
    CHECK (observed_symbol ~ '^[A-Z][A-Z0-9.\-]{0,11}$'),
  CONSTRAINT security_historical_coverage_gaps_dates_check
    CHECK (date_from <= date_to),
  CONSTRAINT security_historical_coverage_gaps_restriction_reason_check
    CHECK (restriction_reason IN (
      'PROVIDER_ENTITLEMENT_TIMEFRAME',
      'CONFIG_ENTITLEMENT_FLOOR',
      'PROVIDER_NOT_AUTHORIZED_OTHER',
      'PROVIDER_UNAVAILABLE'
    )),
  CONSTRAINT security_historical_coverage_gaps_coverage_state_check
    CHECK (coverage_state IN (
      'ENTITLEMENT_RESTRICTED',
      'PROVIDER_UNAVAILABLE'
    )),
  CONSTRAINT security_historical_coverage_gaps_resolution_state_check
    CHECK (resolution_state IN ('OPEN', 'FILLED', 'SUPERSEDED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS security_historical_coverage_gaps_identity_idx
  ON public.security_historical_coverage_gaps (
    security_id,
    observed_symbol,
    date_from,
    date_to,
    restriction_reason,
    coverage_state
  );

COMMENT ON TABLE public.security_historical_coverage_gaps IS
  'Explicit non-OHLCV coverage gaps for historical backfill. OPEN rows may be revisited after entitlement changes.';

CREATE OR REPLACE FUNCTION public.historical_apply_coverage_gap_batch(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a jsonb array';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) AS t(value)
  LOOP
    INSERT INTO public.security_historical_coverage_gaps (
      security_id,
      observed_symbol,
      date_from,
      date_to,
      provider,
      restriction_reason,
      coverage_state,
      provider_request_id,
      provider_status,
      provider_message,
      observed_at,
      backfill_job_id,
      resolution_state,
      updated_at
    ) VALUES (
      (item->>'security_id')::uuid,
      item->>'observed_symbol',
      (item->>'date_from')::date,
      (item->>'date_to')::date,
      item->>'provider',
      item->>'restriction_reason',
      item->>'coverage_state',
      nullif(item->>'provider_request_id', ''),
      nullif(item->>'provider_status', ''),
      nullif(item->>'provider_message', ''),
      (item->>'observed_at')::timestamptz,
      nullif(item->>'backfill_job_id', '')::uuid,
      coalesce(nullif(item->>'resolution_state', ''), 'OPEN'),
      now()
    )
    ON CONFLICT (
      security_id,
      observed_symbol,
      date_from,
      date_to,
      restriction_reason,
      coverage_state
    )
    DO UPDATE SET
      provider_request_id = EXCLUDED.provider_request_id,
      provider_status = EXCLUDED.provider_status,
      provider_message = EXCLUDED.provider_message,
      observed_at = EXCLUDED.observed_at,
      backfill_job_id = EXCLUDED.backfill_job_id,
      updated_at = now();
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.historical_apply_coverage_gap_batch(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.historical_apply_coverage_gap_batch(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.historical_apply_coverage_gap_batch(jsonb) FROM authenticated;
REVOKE ALL ON TABLE public.security_historical_coverage_gaps FROM PUBLIC;
REVOKE ALL ON TABLE public.security_historical_coverage_gaps FROM anon;
REVOKE ALL ON TABLE public.security_historical_coverage_gaps FROM authenticated;
GRANT EXECUTE ON FUNCTION public.historical_apply_coverage_gap_batch(jsonb) TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.security_historical_coverage_gaps TO service_role;
