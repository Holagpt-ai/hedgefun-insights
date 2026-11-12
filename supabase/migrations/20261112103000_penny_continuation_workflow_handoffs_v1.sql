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

-- Direct authenticated reads are denied; use penny_continuation_handoff_list_active_v1 only.
REVOKE ALL ON TABLE public.penny_continuation_workflow_handoffs FROM PUBLIC;
REVOKE ALL ON TABLE public.penny_continuation_workflow_handoffs FROM authenticated;
REVOKE ALL ON TABLE public.penny_continuation_workflow_handoffs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.penny_continuation_workflow_handoffs TO service_role;

COMMENT ON TABLE public.penny_continuation_workflow_handoffs IS
  'Versioned Penny Continuation AM Inbox workflow handoffs. Evidence-only; not a ranking store.';

CREATE OR REPLACE FUNCTION public.penny_continuation_handoff_upsert_v1(p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_symbol text;
  v_session date;
  v_gen_ms bigint;
  v_gen_at timestamptz;
  v_idem text;
  v_evidence_kind text;
  v_valid_from date;
  v_valid_through date;
  v_capture_at timestamptz;
  v_obs_at timestamptz;
  v_badge jsonb;
  v_existing record;
  v_row_count integer;
  v_cont_qualified boolean;
BEGIN
  IF p_row IS NULL OR jsonb_typeof(p_row) <> 'object' THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_body');
  END IF;

  v_symbol := upper(trim(coalesce(p_row->>'symbol', '')));
  IF v_symbol = '' OR length(v_symbol) > 16 THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_body');
  END IF;

  IF p_row->>'source_session_date' IS NULL
     OR p_row->>'source_session_date' !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_body');
  END IF;
  v_session := (p_row->>'source_session_date')::date;

  IF p_row->>'handoff_version' IS DISTINCT FROM 'penny_continuation_workflow_handoff_v1'
     OR p_row->>'integration_version' IS DISTINCT FROM 'penny_continuation_integration_v1'
     OR p_row->>'model_version' IS DISTINCT FROM 'penny_continuation_v1' THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_body');
  END IF;

  IF NOT (p_row ? 'continuation_qualified') THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_body');
  END IF;
  BEGIN
    v_cont_qualified := (p_row->>'continuation_qualified')::boolean;
  EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('applied', false, 'reason', 'invalid_body');
  END;
  IF v_cont_qualified IS NOT TRUE THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_body');
  END IF;

  v_idem := nullif(trim(p_row->>'publication_idempotency_key'), '');
  IF v_idem IS NULL OR length(v_idem) > 512 THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_body');
  END IF;
  IF position(v_symbol in v_idem) < 1 OR position((v_session::text) in v_idem) < 1 THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_body');
  END IF;

  BEGIN
    v_gen_ms := nullif(p_row->>'generation_sync_ms', '')::bigint;
    v_gen_at := (p_row->>'generation_sync_at')::timestamptz;
    v_capture_at := (p_row->>'capture_at')::timestamptz;
    v_obs_at := nullif(p_row->>'symbol_observation_at', '')::timestamptz;
    v_valid_from := (p_row->>'valid_from_session_date')::date;
    v_valid_through := (p_row->>'valid_through_session_date')::date;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_body');
  END;

  IF v_gen_ms IS NULL OR v_gen_ms < 0 OR v_gen_at IS NULL OR v_capture_at IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_body');
  END IF;
  IF abs((extract(epoch from v_gen_at) * 1000)::bigint - v_gen_ms) > 5000 THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_body');
  END IF;
  IF v_obs_at IS NOT NULL AND v_obs_at > v_capture_at THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_body');
  END IF;

  v_evidence_kind := nullif(trim(p_row->>'qualification_evidence_kind'), '');
  IF v_evidence_kind IS NULL OR v_evidence_kind NOT IN ('live_market', 'prior_session_capture') THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_body');
  END IF;

  v_badge := p_row->'badge_payload';

  IF v_valid_from IS NULL OR v_valid_through IS NULL OR v_valid_from > v_valid_through THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_body');
  END IF;
  IF v_evidence_kind = 'live_market' THEN
  IF v_valid_from = v_session AND v_valid_through = v_session THEN
      NULL;
    ELSIF coalesce(v_badge->'supplementalLabels', '[]'::jsonb) @> '["next_session_carry"]'::jsonb
      AND v_valid_from > v_session
      AND v_valid_through = v_valid_from THEN
      NULL;
    ELSE
      RETURN jsonb_build_object('applied', false, 'reason', 'invalid_body');
    END IF;
  ELSE
    IF v_valid_from <= v_session OR v_valid_through <> v_valid_from THEN
      RETURN jsonb_build_object('applied', false, 'reason', 'invalid_body');
    END IF;
  END IF;

  IF v_badge IS NULL
     OR jsonb_typeof(v_badge) <> 'object'
     OR v_badge->>'kind' IS DISTINCT FROM 'penny_continuation_v1'
     OR v_badge->>'model_version' IS DISTINCT FROM 'penny_continuation_v1'
     OR (v_badge->>'continuationQualified')::boolean IS NOT TRUE
     OR upper(trim(coalesce(v_badge->>'symbol', ''))) <> v_symbol
     OR v_badge->>'sessionDate' IS DISTINCT FROM (v_session::text)
     OR (
       v_badge->>'dataFreshnessLabel' IS NOT NULL
       AND v_badge->>'dataFreshnessLabel' NOT IN ('live', 'delayed', 'stale')
     ) THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'invalid_body');
  END IF;

  SELECT h.*
    INTO v_existing
  FROM public.penny_continuation_workflow_handoffs AS h
  WHERE h.symbol = v_symbol
    AND h.source_session_date = v_session
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.revoked_at IS NOT NULL THEN
      RETURN jsonb_build_object('applied', false, 'reason', 'revoked');
    END IF;
    IF v_existing.publication_idempotency_key = v_idem
       AND v_existing.generation_sync_ms = v_gen_ms THEN
      RETURN jsonb_build_object('applied', false, 'reason', 'already_current');
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
    v_capture_at,
    v_obs_at,
    p_row->>'handoff_version',
    p_row->>'integration_version',
    p_row->>'model_version',
    v_idem,
    coalesce(nullif(p_row->>'observation_generation_id', ''), 'na'),
    v_gen_ms,
    v_gen_at,
    true,
    coalesce((p_row->>'publication_suppressed')::boolean, false),
    v_evidence_kind,
    v_valid_from,
    v_valid_through,
    v_badge,
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

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count = 0 THEN
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
  p_pairs jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_array_len integer;
  v_valid_count integer;
  v_distinct_count integer;
  v_items jsonb;
BEGIN
  IF p_am_session_date IS NULL OR p_pairs IS NULL OR jsonb_typeof(p_pairs) <> 'array' THEN
    RETURN jsonb_build_object(
      'projection_version', 'penny_continuation_handoff_read_v1',
      'error', 'invalid_pairs'
    );
  END IF;

  v_array_len := jsonb_array_length(p_pairs);
  IF v_array_len < 1 OR v_array_len > 64 THEN
    RETURN jsonb_build_object(
      'projection_version', 'penny_continuation_handoff_read_v1',
      'error', 'invalid_pairs'
    );
  END IF;

  SELECT count(*)::integer,
         count(DISTINCT (upper(trim(elem->>'symbol')), elem->>'source_session_date'))::integer
    INTO v_valid_count, v_distinct_count
  FROM jsonb_array_elements(p_pairs) AS elem
  WHERE upper(trim(coalesce(elem->>'symbol', ''))) <> ''
    AND elem->>'source_session_date' ~ '^\d{4}-\d{2}-\d{2}$';

  IF v_valid_count <> v_array_len OR v_distinct_count <> v_valid_count THEN
    RETURN jsonb_build_object(
      'projection_version', 'penny_continuation_handoff_read_v1',
      'error', 'invalid_pairs'
    );
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'projection_version', 'penny_continuation_handoff_read_v1',
        'handoff_version', h.handoff_version,
        'integration_version', h.integration_version,
        'model_version', h.model_version,
        'symbol', h.symbol,
        'source_session_date', h.source_session_date,
        'capture_at', h.capture_at,
        'symbol_observation_at', h.symbol_observation_at,
        'publication_idempotency_key', h.publication_idempotency_key,
        'publication_suppressed', h.publication_suppressed,
        'qualification_evidence_kind', h.qualification_evidence_kind,
        'continuation_qualified', h.continuation_qualified,
        'badge_payload', h.badge_payload,
        'rank_snapshot', h.rank_snapshot
      )
      ORDER BY h.updated_at DESC
    ),
    '[]'::jsonb
  )
    INTO v_items
  FROM jsonb_array_elements(p_pairs) AS elem
  INNER JOIN public.penny_continuation_workflow_handoffs AS h
    ON h.symbol = upper(trim(elem->>'symbol'))
    AND h.source_session_date = (elem->>'source_session_date')::date
  WHERE h.revoked_at IS NULL
    AND p_am_session_date >= h.valid_from_session_date
    AND p_am_session_date <= h.valid_through_session_date;

  RETURN jsonb_build_object(
    'projection_version', 'penny_continuation_handoff_read_v1',
    'items', v_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.penny_continuation_handoff_revoke_v1(
  p_symbol text,
  p_source_session_date date
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_symbol text := upper(trim(coalesce(p_symbol, '')));
  v_updated integer;
BEGIN
  IF v_symbol = '' OR p_source_session_date IS NULL THEN
    RETURN false;
  END IF;
  UPDATE public.penny_continuation_workflow_handoffs AS h
  SET revoked_at = now(), updated_at = now()
  WHERE h.symbol = v_symbol
    AND h.source_session_date = p_source_session_date
    AND h.revoked_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.penny_continuation_handoff_expire_stale_v1(p_as_of_session_date date)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH deleted AS (
    DELETE FROM public.penny_continuation_workflow_handoffs AS h
    WHERE h.valid_through_session_date < p_as_of_session_date
    RETURNING 1
  )
  SELECT count(*)::integer FROM deleted;
$$;

REVOKE ALL ON FUNCTION public.penny_continuation_handoff_upsert_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.penny_continuation_handoff_list_active_v1(date, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.penny_continuation_handoff_revoke_v1(text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.penny_continuation_handoff_expire_stale_v1(date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.penny_continuation_handoff_upsert_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.penny_continuation_handoff_list_active_v1(date, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.penny_continuation_handoff_revoke_v1(text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.penny_continuation_handoff_expire_stale_v1(date) TO service_role;
