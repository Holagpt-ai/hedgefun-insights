-- Gate H — SEC V1C historical misattribution remediation (schema only).
-- Soft-invalidate allowlisted catalyst_events rows; no DELETE; checkpoint untouched.

ALTER TABLE public.catalyst_events
  DROP CONSTRAINT IF EXISTS catalyst_events_verification_state_check;

ALTER TABLE public.catalyst_events
  ADD CONSTRAINT catalyst_events_verification_state_check
  CHECK (verification_state IN ('provider_reported', 'attribution_invalidated'));

COMMENT ON CONSTRAINT catalyst_events_verification_state_check ON public.catalyst_events IS
  'provider_reported = active feed; attribution_invalidated = reversible SEC V1C misattribution remediation.';

CREATE TABLE IF NOT EXISTS public.sec_v1c_remediation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  dedupe_key text NOT NULL,
  action text NOT NULL CHECK (action IN ('invalidate', 'rollback')),
  previous_verification_state text NOT NULL,
  new_verification_state text NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  policy_version text NOT NULL CHECK (length(btrim(policy_version)) > 0),
  facts_patch jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sec_v1c_remediation_audit_batch_idx
  ON public.sec_v1c_remediation_audit (batch_id, applied_at DESC);

CREATE INDEX IF NOT EXISTS sec_v1c_remediation_audit_dedupe_idx
  ON public.sec_v1c_remediation_audit (dedupe_key, applied_at DESC);

ALTER TABLE public.sec_v1c_remediation_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sec_v1c_remediation_audit FROM PUBLIC;
REVOKE ALL ON TABLE public.sec_v1c_remediation_audit FROM anon;
REVOKE ALL ON TABLE public.sec_v1c_remediation_audit FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.sec_v1c_remediation_audit TO service_role;

CREATE OR REPLACE FUNCTION public.apply_sec_v1c_attribution_invalidation(
  p_items jsonb,
  p_policy_version text,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id uuid := gen_random_uuid();
  v_item jsonb;
  v_key text;
  v_reason text;
  v_reviewed_by text;
  v_reviewed_at timestamptz;
  v_row public.catalyst_events%ROWTYPE;
  v_would_apply int := 0;
  v_applied int := 0;
  v_skipped int := 0;
  v_not_found int := 0;
  v_patch jsonb;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'apply_sec_v1c_attribution_invalidation: empty allowlist';
  END IF;
  IF p_policy_version IS NULL OR length(btrim(p_policy_version)) = 0 THEN
    RAISE EXCEPTION 'apply_sec_v1c_attribution_invalidation: policy_version required';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS t(value) LOOP
    v_key := btrim(v_item->>'dedupe_key');
    v_reason := btrim(v_item->>'reason');
    v_reviewed_by := NULLIF(btrim(v_item->>'reviewed_by'), '');
    v_reviewed_at := COALESCE((v_item->>'reviewed_at')::timestamptz, now());

    IF v_key IS NULL OR length(v_key) = 0 OR v_reason IS NULL OR length(v_reason) = 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT * INTO v_row
    FROM public.catalyst_events
    WHERE dedupe_key = v_key
      AND provider = 'sec_edgar'
    FOR UPDATE;

    IF NOT FOUND THEN
      v_not_found := v_not_found + 1;
      CONTINUE;
    END IF;

    IF v_row.verification_state = 'attribution_invalidated' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF v_row.verification_state <> 'provider_reported' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_would_apply := v_would_apply + 1;

    IF p_dry_run THEN
      CONTINUE;
    END IF;

    v_patch := jsonb_build_object(
      'attribution_remediation', jsonb_build_object(
        'policy_version', p_policy_version,
        'previous_verification_state', v_row.verification_state,
        'invalidated_at', now(),
        'reason', v_reason,
        'reviewed_by', v_reviewed_by,
        'reviewed_at', v_reviewed_at,
        'batch_id', v_batch_id::text
      )
    );

    UPDATE public.catalyst_events
    SET verification_state = 'attribution_invalidated',
        facts = COALESCE(facts, '{}'::jsonb) || v_patch,
        updated_at = now()
    WHERE id = v_row.id;

    INSERT INTO public.sec_v1c_remediation_audit (
      batch_id,
      dedupe_key,
      action,
      previous_verification_state,
      new_verification_state,
      reason,
      policy_version,
      facts_patch
    ) VALUES (
      v_batch_id,
      v_row.dedupe_key,
      'invalidate',
      'provider_reported',
      'attribution_invalidated',
      v_reason,
      p_policy_version,
      v_patch
    );

    v_applied := v_applied + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'batch_id', v_batch_id,
    'policy_version', p_policy_version,
    'requested_keys', jsonb_array_length(p_items),
    'would_apply', v_would_apply,
    'applied', v_applied,
    'skipped', v_skipped,
    'not_found', v_not_found
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rollback_sec_v1c_attribution_invalidation(
  p_batch_id uuid,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit public.sec_v1c_remediation_audit%ROWTYPE;
  v_row public.catalyst_events%ROWTYPE;
  v_would_rollback int := 0;
  v_rolled_back int := 0;
  v_skipped int := 0;
  v_rollback_batch uuid := gen_random_uuid();
BEGIN
  FOR v_audit IN
    SELECT *
    FROM public.sec_v1c_remediation_audit
    WHERE batch_id = p_batch_id
      AND action = 'invalidate'
    ORDER BY applied_at ASC
    FOR UPDATE
  LOOP
    SELECT * INTO v_row
    FROM public.catalyst_events
    WHERE dedupe_key = v_audit.dedupe_key
      AND provider = 'sec_edgar'
    FOR UPDATE;

    IF NOT FOUND THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF v_row.verification_state <> 'attribution_invalidated' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_would_rollback := v_would_rollback + 1;

    IF p_dry_run THEN
      CONTINUE;
    END IF;

    UPDATE public.catalyst_events
    SET verification_state = v_audit.previous_verification_state,
        facts = COALESCE(facts, '{}'::jsonb) - 'attribution_remediation',
        updated_at = now()
    WHERE id = v_row.id;

    INSERT INTO public.sec_v1c_remediation_audit (
      batch_id,
      dedupe_key,
      action,
      previous_verification_state,
      new_verification_state,
      reason,
      policy_version,
      facts_patch
    ) VALUES (
      v_rollback_batch,
      v_audit.dedupe_key,
      'rollback',
      'attribution_invalidated',
      v_audit.previous_verification_state,
      'rollback batch ' || p_batch_id::text,
      v_audit.policy_version,
      '{}'::jsonb
    );

    v_rolled_back := v_rolled_back + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'source_batch_id', p_batch_id,
    'rollback_batch_id', v_rollback_batch,
    'would_rollback', v_would_rollback,
    'rolled_back', v_rolled_back,
    'skipped', v_skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_sec_v1c_attribution_invalidation(jsonb, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rollback_sec_v1c_attribution_invalidation(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_sec_v1c_attribution_invalidation(jsonb, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.rollback_sec_v1c_attribution_invalidation(uuid, boolean) TO service_role;
