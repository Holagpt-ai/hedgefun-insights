-- Batch 226 — Penny Continuation workflow handoffs (additive; not production-activated until migration applied).

CREATE TABLE IF NOT EXISTS public.penny_continuation_workflow_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  security_id uuid REFERENCES public.securities (security_id),
  symbol text NOT NULL,
  source_session_date date NOT NULL,
  capture_at timestamptz NOT NULL,
  symbol_observation_at timestamptz,
  handoff_version text NOT NULL,
  integration_version text NOT NULL,
  model_version text NOT NULL,
  publication_idempotency_key text NOT NULL,
  observation_generation_id text NOT NULL DEFAULT 'na',
  generation_sync_ms bigint NOT NULL,
  generation_sync_at timestamptz NOT NULL,
  continuation_qualified boolean NOT NULL DEFAULT true,
  publication_suppressed boolean NOT NULL DEFAULT false,
  qualification_evidence_kind text NOT NULL,
  valid_from_session_date date NOT NULL,
  valid_through_session_date date NOT NULL,
  badge_payload jsonb NOT NULL,
  rank_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT penny_cont_handoffs_evidence_kind_check CHECK (
    qualification_evidence_kind IN ('live_market', 'prior_session_capture')
  ),
  CONSTRAINT penny_cont_handoffs_symbol_session_key
    UNIQUE (symbol, source_session_date),
  CONSTRAINT penny_cont_handoffs_idempotency_key UNIQUE (publication_idempotency_key)
);

CREATE INDEX IF NOT EXISTS penny_cont_handoffs_valid_window_idx
  ON public.penny_continuation_workflow_handoffs (
    valid_from_session_date,
    valid_through_session_date
  )
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS penny_cont_handoffs_source_session_idx
  ON public.penny_continuation_workflow_handoffs (source_session_date DESC);

ALTER TABLE public.penny_continuation_workflow_handoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY penny_cont_handoffs_select_authenticated
  ON public.penny_continuation_workflow_handoffs
  FOR SELECT
  TO authenticated
  USING (revoked_at IS NULL);

COMMENT ON TABLE public.penny_continuation_workflow_handoffs IS
  'Versioned Penny Continuation AM Inbox workflow handoffs. Evidence-only; not a ranking store.';

CREATE OR REPLACE FUNCTION public.penny_continuation_handoff_upsert_v1(p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_symbol text;
  v_session date;
  v_gen_ms bigint;
  v_idem text;
  v_existing record;
BEGIN
  IF p_row IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_body');
  END IF;

  v_symbol := upper(trim(coalesce(p_row->>'symbol', '')));
  IF v_symbol = '' THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_body');
  END IF;

  IF p_row->>'source_session_date' IS NULL OR p_row->>'publication_idempotency_key' IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_body');
  END IF;

  v_session := (p_row->>'source_session_date')::date;
  v_idem := nullif(trim(p_row->>'publication_idempotency_key'), '');
  IF v_idem IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_body');
  END IF;

  v_gen_ms := nullif(p_row->>'generation_sync_ms', '')::bigint;
  IF v_gen_ms IS NULL OR v_gen_ms < 0 THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_body');
  END IF;

  SELECT *
    INTO v_existing
  FROM public.penny_continuation_workflow_handoffs h
  WHERE h.symbol = v_symbol
    AND h.source_session_date = v_session
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.revoked_at IS NOT NULL THEN
      RETURN jsonb_build_object('applied', false, 'reason', 'revoked');
    END IF;
    IF v_existing.publication_idempotency_key = v_idem
       AND v_existing.generation_sync_ms = v_gen_ms THEN
      RETURN jsonb_build_object('applied', true, 'reason', 'already_current');
    END IF;
    IF v_gen_ms < v_existing.generation_sync_ms THEN
      RETURN jsonb_build_object('applied', false, 'reason', 'stale_generation');
    END IF;
    IF v_gen_ms = v_existing.generation_sync_ms
       AND v_idem IS DISTINCT FROM v_existing.publication_idempotency_key THEN
      RETURN jsonb_build_object('applied', false, 'reason', 'stale_generation');
    END IF;
  END IF;

  INSERT INTO public.penny_continuation_workflow_handoffs (
    security_id,
    symbol,
    source_session_date,
    capture_at,
    symbol_observation_at,
    handoff_version,
    integration_version,
    model_version,
    publication_idempotency_key,
    observation_generation_id,
    generation_sync_ms,
    generation_sync_at,
    continuation_qualified,
    publication_suppressed,
    qualification_evidence_kind,
    valid_from_session_date,
    valid_through_session_date,
    badge_payload,
    rank_snapshot,
    updated_at
  ) VALUES (
    nullif(p_row->>'security_id', '')::uuid,
    v_symbol,
    v_session,
    (p_row->>'capture_at')::timestamptz,
    nullif(p_row->>'symbol_observation_at', '')::timestamptz,
    p_row->>'handoff_version',
    p_row->>'integration_version',
    p_row->>'model_version',
    v_idem,
    coalesce(nullif(p_row->>'observation_generation_id', ''), 'na'),
    v_gen_ms,
    (p_row->>'generation_sync_at')::timestamptz,
    coalesce((p_row->>'continuation_qualified')::boolean, true),
    coalesce((p_row->>'publication_suppressed')::boolean, false),
    p_row->>'qualification_evidence_kind',
    (p_row->>'valid_from_session_date')::date,
    (p_row->>'valid_through_session_date')::date,
    coalesce(p_row->'badge_payload', '{}'::jsonb),
    coalesce(p_row->'rank_snapshot', '{}'::jsonb),
    now()
  )
  ON CONFLICT (symbol, source_session_date) DO UPDATE SET
    security_id = coalesce(EXCLUDED.security_id, penny_continuation_workflow_handoffs.security_id),
    capture_at = EXCLUDED.capture_at,
    symbol_observation_at = EXCLUDED.symbol_observation_at,
    handoff_version = EXCLUDED.handoff_version,
    integration_version = EXCLUDED.integration_version,
    model_version = EXCLUDED.model_version,
    publication_idempotency_key = EXCLUDED.publication_idempotency_key,
    observation_generation_id = EXCLUDED.observation_generation_id,
    generation_sync_ms = EXCLUDED.generation_sync_ms,
    generation_sync_at = EXCLUDED.generation_sync_at,
    continuation_qualified = EXCLUDED.continuation_qualified,
    publication_suppressed = EXCLUDED.publication_suppressed,
    qualification_evidence_kind = EXCLUDED.qualification_evidence_kind,
    valid_from_session_date = EXCLUDED.valid_from_session_date,
    valid_through_session_date = EXCLUDED.valid_through_session_date,
    badge_payload = EXCLUDED.badge_payload,
    rank_snapshot = EXCLUDED.rank_snapshot,
    updated_at = now()
  WHERE penny_continuation_workflow_handoffs.revoked_at IS NULL
    AND (
      EXCLUDED.generation_sync_ms > penny_continuation_workflow_handoffs.generation_sync_ms
      OR (
        EXCLUDED.generation_sync_ms = penny_continuation_workflow_handoffs.generation_sync_ms
        AND EXCLUDED.publication_idempotency_key = penny_continuation_workflow_handoffs.publication_idempotency_key
      )
    );

  IF NOT FOUND AND v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'stale_generation');
  END IF;

  RETURN jsonb_build_object(
    'applied', true,
    'reason', CASE WHEN v_existing.id IS NULL THEN 'inserted' ELSE 'updated' END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.penny_continuation_handoff_list_active_v1(
  p_am_session_date date,
  p_limit integer DEFAULT 200
)
RETURNS SETOF public.penny_continuation_workflow_handoffs
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.*
  FROM public.penny_continuation_workflow_handoffs h
  WHERE h.revoked_at IS NULL
    AND p_am_session_date >= h.valid_from_session_date
    AND p_am_session_date <= h.valid_through_session_date
  ORDER BY h.updated_at DESC, h.symbol ASC
  LIMIT LEAST(GREATEST(coalesce(p_limit, 200), 1), 500);
$$;

CREATE OR REPLACE FUNCTION public.penny_continuation_handoff_revoke_v1(
  p_symbol text,
  p_source_session_date date
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_symbol text := upper(trim(coalesce(p_symbol, '')));
  v_updated integer;
BEGIN
  IF v_symbol = '' OR p_source_session_date IS NULL THEN
    RETURN false;
  END IF;
  UPDATE public.penny_continuation_workflow_handoffs
  SET revoked_at = now(), updated_at = now()
  WHERE symbol = v_symbol
    AND source_session_date = p_source_session_date
    AND revoked_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.penny_continuation_handoff_expire_stale_v1(p_as_of_session_date date)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH deleted AS (
    DELETE FROM public.penny_continuation_workflow_handoffs
    WHERE valid_through_session_date < p_as_of_session_date
    RETURNING 1
  )
  SELECT count(*)::integer FROM deleted;
$$;

REVOKE ALL ON FUNCTION public.penny_continuation_handoff_upsert_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.penny_continuation_handoff_list_active_v1(date, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.penny_continuation_handoff_revoke_v1(text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.penny_continuation_handoff_expire_stale_v1(date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.penny_continuation_handoff_upsert_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.penny_continuation_handoff_list_active_v1(date, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.penny_continuation_handoff_revoke_v1(text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.penny_continuation_handoff_expire_stale_v1(date) TO service_role;
