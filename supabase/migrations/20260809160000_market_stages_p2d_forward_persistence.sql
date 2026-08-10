-- Market Stages P2D: forward persistence RPC.
-- Single transactional writer for applied forward weekly evaluations.
-- No correction rebuild, cron, alerts, or Edge entrypoints.

CREATE OR REPLACE FUNCTION public.persist_market_stage_forward_v1(
  p_symbol text,
  p_algorithm_id text,
  p_expected_generation_id uuid,
  p_expected_revision bigint,
  p_effective_week_end date,
  p_evaluation_status text,
  p_candidate_stage text,
  p_input_fingerprint text,
  p_p1_status text,
  p_reason_codes jsonb,
  p_metrics jsonb,
  p_calculated_at timestamptz,
  p_confirmed_stage text,
  p_confirmed_effective_week_end date,
  p_confirmed_at_week_end date,
  p_pending_stage text,
  p_pending_count smallint,
  p_pending_start_week_end date,
  p_latest_processed_week_end date,
  p_latest_input_fingerprint text,
  p_latest_evaluation_status text,
  p_latest_valid_candidate text,
  p_latest_valid_candidate_week_end date,
  p_latest_data_effective_week_end date,
  p_next_revision bigint,
  p_transition jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_gen public.market_stage_timeline_generations%ROWTYPE;
  v_state public.market_stage_state%ROWTYPE;
  v_existing_eval public.market_stage_weekly_evaluations%ROWTYPE;
  v_existing_tr public.market_stage_transitions%ROWTYPE;
  v_gen_id uuid;
  v_updated integer;
  v_has_transition boolean := false;
  v_tr_from text;
  v_tr_to text;
  v_tr_pending_start date;
  v_tr_effective date;
  v_tr_confirmed date;
  v_tr_calculated_at timestamptz;
  v_tr_fingerprint text;
  v_tr_reason_codes jsonb;
  v_tr_metrics jsonb;
  v_tr_identity text;
  v_eval_ok boolean;
  v_state_ok boolean;
  v_tr_ok boolean;
  v_tr_found boolean;
  v_gen_ok boolean;
  v_unexpected_tr boolean;
BEGIN
  IF p_symbol IS NULL OR p_symbol !~ '^[A-Z][A-Z0-9.-]{0,14}$' THEN
    RAISE EXCEPTION 'market_stages_forward_invalid_symbol';
  END IF;
  IF p_algorithm_id IS NULL OR length(trim(p_algorithm_id)) = 0 THEN
    RAISE EXCEPTION 'market_stages_forward_invalid_algorithm';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'market_stages_forward_invalid_expected_revision';
  END IF;
  IF p_next_revision IS NULL OR p_next_revision <> (p_expected_revision + 1) THEN
    RAISE EXCEPTION 'market_stages_forward_invalid_next_revision';
  END IF;
  IF p_effective_week_end IS NULL OR EXTRACT(ISODOW FROM p_effective_week_end) <> 5 THEN
    RAISE EXCEPTION 'market_stages_forward_invalid_week';
  END IF;
  IF p_evaluation_status IS NULL THEN
    RAISE EXCEPTION 'market_stages_forward_invalid_evaluation_status';
  END IF;
  IF p_reason_codes IS NULL OR jsonb_typeof(p_reason_codes) <> 'array' THEN
    RAISE EXCEPTION 'market_stages_forward_invalid_reason_codes';
  END IF;
  IF p_metrics IS NULL OR jsonb_typeof(p_metrics) <> 'object' THEN
    RAISE EXCEPTION 'market_stages_forward_invalid_metrics';
  END IF;
  IF p_calculated_at IS NULL THEN
    RAISE EXCEPTION 'market_stages_forward_invalid_calculated_at';
  END IF;
  IF p_latest_processed_week_end IS NULL THEN
    RAISE EXCEPTION 'market_stages_forward_invalid_latest_processed';
  END IF;
  IF p_latest_evaluation_status IS NULL THEN
    RAISE EXCEPTION 'market_stages_forward_invalid_latest_status';
  END IF;
  IF p_pending_count IS NULL OR p_pending_count NOT IN (0, 1) THEN
    RAISE EXCEPTION 'market_stages_forward_invalid_pending_count';
  END IF;

  IF p_transition IS NOT NULL THEN
    IF jsonb_typeof(p_transition) <> 'object' THEN
      RAISE EXCEPTION 'market_stages_forward_invalid_transition';
    END IF;
    v_has_transition := true;
    v_tr_from := p_transition ->> 'from_stage';
    v_tr_to := p_transition ->> 'to_stage';
    v_tr_pending_start := (p_transition ->> 'pending_start_week_end')::date;
    v_tr_effective := (p_transition ->> 'effective_week_end')::date;
    v_tr_confirmed := (p_transition ->> 'confirmed_week_end')::date;
    v_tr_calculated_at := (p_transition ->> 'calculated_at')::timestamptz;
    v_tr_fingerprint := p_transition ->> 'confirmation_input_fingerprint';
    v_tr_reason_codes := p_transition -> 'reason_codes';
    v_tr_metrics := p_transition -> 'metrics_snapshot';
    v_tr_identity := p_transition ->> 'event_identity';
    IF v_tr_from IS NULL OR v_tr_to IS NULL OR v_tr_identity IS NULL
       OR v_tr_pending_start IS NULL OR v_tr_effective IS NULL
       OR v_tr_confirmed IS NULL OR v_tr_calculated_at IS NULL
       OR v_tr_fingerprint IS NULL
       OR v_tr_reason_codes IS NULL OR jsonb_typeof(v_tr_reason_codes) <> 'array'
       OR v_tr_metrics IS NULL OR jsonb_typeof(v_tr_metrics) <> 'object' THEN
      RAISE EXCEPTION 'market_stages_forward_invalid_transition';
    END IF;
  END IF;

  -- Transaction-scoped advisory lock derived from (symbol, algorithm_id).
  -- Must precede all genesis / duplicate decisions.
  PERFORM pg_advisory_xact_lock(
    hashtext('market_stages.forward.v1'),
    hashtext(p_symbol || chr(1) || p_algorithm_id)
  );

  -- ── Genesis path: expected revision 0 ──
  IF p_expected_revision = 0 THEN
    IF p_expected_generation_id IS NOT NULL THEN
      RAISE EXCEPTION 'market_stages_forward_genesis_generation_id';
    END IF;
    IF p_next_revision <> 1 THEN
      RAISE EXCEPTION 'market_stages_forward_invalid_next_revision';
    END IF;

    SELECT g.*
      INTO v_gen
      FROM public.market_stage_timeline_generations g
     WHERE g.symbol = p_symbol
       AND g.algorithm_id = p_algorithm_id
       AND g.status IN ('building', 'active')
     ORDER BY g.created_at ASC
     LIMIT 1
     FOR UPDATE;

    IF FOUND THEN
      -- Only an exact already-committed genesis write may no-op.
      IF v_gen.status IS DISTINCT FROM 'active'
         OR v_gen.reason IS DISTINCT FROM 'genesis'
         OR v_gen.parent_generation_id IS NOT NULL
         OR v_gen.checkpoint_week_end IS NOT NULL
         OR v_gen.trigger_week_end IS NOT NULL
         OR v_gen.trigger_fingerprint IS NOT NULL
         OR v_gen.activated_at IS NULL
         OR v_gen.superseded_at IS NOT NULL
         OR v_gen.failed_at IS NOT NULL
         OR v_gen.failure_code IS NOT NULL THEN
        RETURN jsonb_build_object(
          'ok', false,
          'outcome', 'inactive_generation'
        );
      END IF;

      SELECT s.*
        INTO v_state
        FROM public.market_stage_state s
       WHERE s.symbol = p_symbol
         AND s.algorithm_id = p_algorithm_id
       FOR UPDATE;

      IF NOT FOUND
         OR v_state.active_generation_id IS DISTINCT FROM v_gen.id
         OR v_state.revision IS DISTINCT FROM 1 THEN
        RETURN jsonb_build_object(
          'ok', false,
          'outcome', 'stale_revision',
          'current_revision', COALESCE(v_state.revision, 0)
        );
      END IF;

      SELECT e.*
        INTO v_existing_eval
        FROM public.market_stage_weekly_evaluations e
       WHERE e.generation_id = v_gen.id
         AND e.effective_week_end = p_effective_week_end;

      IF FOUND THEN
        v_eval_ok :=
          v_existing_eval.generation_id IS NOT DISTINCT FROM v_gen.id
          AND v_existing_eval.symbol IS NOT DISTINCT FROM p_symbol
          AND v_existing_eval.algorithm_id IS NOT DISTINCT FROM p_algorithm_id
          AND v_existing_eval.effective_week_end
                IS NOT DISTINCT FROM p_effective_week_end
          AND v_existing_eval.evaluation_status
                IS NOT DISTINCT FROM p_evaluation_status
          AND v_existing_eval.candidate_stage
                IS NOT DISTINCT FROM p_candidate_stage
          AND v_existing_eval.input_fingerprint
                IS NOT DISTINCT FROM p_input_fingerprint
          AND v_existing_eval.p1_status IS NOT DISTINCT FROM p_p1_status
          AND v_existing_eval.reason_codes IS NOT DISTINCT FROM p_reason_codes
          AND v_existing_eval.metrics IS NOT DISTINCT FROM p_metrics
          AND v_existing_eval.calculated_at IS NOT DISTINCT FROM p_calculated_at;
      ELSE
        v_eval_ok := false;
      END IF;

      v_state_ok :=
        v_state.symbol IS NOT DISTINCT FROM p_symbol
        AND v_state.algorithm_id IS NOT DISTINCT FROM p_algorithm_id
        AND v_state.active_generation_id IS NOT DISTINCT FROM v_gen.id
        AND v_state.confirmed_stage IS NOT DISTINCT FROM p_confirmed_stage
        AND v_state.confirmed_effective_week_end
              IS NOT DISTINCT FROM p_confirmed_effective_week_end
        AND v_state.confirmed_at_week_end IS NOT DISTINCT FROM p_confirmed_at_week_end
        AND v_state.pending_stage IS NOT DISTINCT FROM p_pending_stage
        AND v_state.pending_count IS NOT DISTINCT FROM p_pending_count
        AND v_state.pending_start_week_end IS NOT DISTINCT FROM p_pending_start_week_end
        AND v_state.latest_processed_week_end
              IS NOT DISTINCT FROM p_latest_processed_week_end
        AND v_state.latest_input_fingerprint
              IS NOT DISTINCT FROM p_latest_input_fingerprint
        AND v_state.latest_evaluation_status
              IS NOT DISTINCT FROM p_latest_evaluation_status
        AND v_state.latest_valid_candidate
              IS NOT DISTINCT FROM p_latest_valid_candidate
        AND v_state.latest_valid_candidate_week_end
              IS NOT DISTINCT FROM p_latest_valid_candidate_week_end
        AND v_state.latest_data_effective_week_end
              IS NOT DISTINCT FROM p_latest_data_effective_week_end
        AND v_state.revision IS NOT DISTINCT FROM 1;

      IF v_has_transition THEN
        SELECT t.*
          INTO v_existing_tr
          FROM public.market_stage_transitions t
         WHERE t.generation_id = v_gen.id
           AND t.event_identity = v_tr_identity;
        v_tr_found := FOUND;
        IF v_tr_found THEN
          v_tr_ok :=
            v_existing_tr.generation_id IS NOT DISTINCT FROM v_gen.id
            AND v_existing_tr.symbol IS NOT DISTINCT FROM p_symbol
            AND v_existing_tr.algorithm_id IS NOT DISTINCT FROM p_algorithm_id
            AND v_existing_tr.from_stage IS NOT DISTINCT FROM v_tr_from
            AND v_existing_tr.to_stage IS NOT DISTINCT FROM v_tr_to
            AND v_existing_tr.pending_start_week_end
                  IS NOT DISTINCT FROM v_tr_pending_start
            AND v_existing_tr.effective_week_end
                  IS NOT DISTINCT FROM v_tr_effective
            AND v_existing_tr.confirmed_week_end
                  IS NOT DISTINCT FROM v_tr_confirmed
            AND v_existing_tr.calculated_at
                  IS NOT DISTINCT FROM v_tr_calculated_at
            AND v_existing_tr.confirmation_input_fingerprint
                  IS NOT DISTINCT FROM v_tr_fingerprint
            AND v_existing_tr.reason_codes IS NOT DISTINCT FROM v_tr_reason_codes
            AND v_existing_tr.metrics_snapshot
                  IS NOT DISTINCT FROM v_tr_metrics
            AND v_existing_tr.event_identity IS NOT DISTINCT FROM v_tr_identity
            AND v_existing_tr.status IS NOT DISTINCT FROM 'active'
            AND v_existing_tr.alert_eligible IS NOT DISTINCT FROM false
            AND v_existing_tr.supersedes_event_id IS NULL
            AND v_existing_tr.superseded_by_event_id IS NULL
            AND v_existing_tr.withdrawn_reason IS NULL;
        ELSE
          v_tr_ok := false;
        END IF;
      ELSE
        SELECT EXISTS (
          SELECT 1
            FROM public.market_stage_transitions t
           WHERE t.generation_id = v_gen.id
             AND (
               t.confirmed_week_end = p_effective_week_end
               OR t.effective_week_end = p_effective_week_end
               OR t.pending_start_week_end = p_effective_week_end
             )
        ) INTO v_unexpected_tr;
        v_tr_ok := NOT COALESCE(v_unexpected_tr, false);
        v_tr_found := false;
      END IF;

      IF v_eval_ok AND v_state_ok AND v_tr_ok THEN
        RETURN jsonb_build_object(
          'ok', true,
          'outcome', CASE
            WHEN v_has_transition THEN 'duplicate_transition'
            ELSE 'duplicate_evaluation'
          END,
          'generation_id', v_gen.id,
          'revision', 1
        );
      END IF;

      IF v_has_transition AND v_tr_found AND NOT v_tr_ok THEN
        RAISE EXCEPTION 'market_stages_forward_transition_conflict';
      END IF;

      RETURN jsonb_build_object(
        'ok', false,
        'outcome', 'stale_revision',
        'current_revision', v_state.revision
      );
    END IF;

    SELECT s.*
      INTO v_state
      FROM public.market_stage_state s
     WHERE s.symbol = p_symbol
       AND s.algorithm_id = p_algorithm_id
     FOR UPDATE;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', false,
        'outcome', 'stale_revision',
        'current_revision', v_state.revision
      );
    END IF;

    INSERT INTO public.market_stage_timeline_generations (
      symbol,
      algorithm_id,
      status,
      parent_generation_id,
      checkpoint_week_end,
      reason,
      trigger_week_end,
      trigger_fingerprint
    ) VALUES (
      p_symbol,
      p_algorithm_id,
      'building',
      NULL,
      NULL,
      'genesis',
      NULL,
      NULL
    )
    RETURNING * INTO v_gen;

    UPDATE public.market_stage_timeline_generations g
       SET status = 'active',
           activated_at = now()
     WHERE g.id = v_gen.id
       AND g.status = 'building'
    RETURNING g.* INTO v_gen;

    IF NOT FOUND OR v_gen.status <> 'active' THEN
      RAISE EXCEPTION 'market_stages_forward_genesis_activate_failed';
    END IF;

    v_gen_id := v_gen.id;

    INSERT INTO public.market_stage_weekly_evaluations (
      generation_id,
      symbol,
      algorithm_id,
      effective_week_end,
      evaluation_status,
      candidate_stage,
      input_fingerprint,
      p1_status,
      reason_codes,
      metrics,
      calculated_at
    ) VALUES (
      v_gen_id,
      p_symbol,
      p_algorithm_id,
      p_effective_week_end,
      p_evaluation_status,
      p_candidate_stage,
      p_input_fingerprint,
      p_p1_status,
      p_reason_codes,
      p_metrics,
      p_calculated_at
    );

    INSERT INTO public.market_stage_state (
      symbol,
      algorithm_id,
      active_generation_id,
      confirmed_stage,
      confirmed_effective_week_end,
      confirmed_at_week_end,
      pending_stage,
      pending_count,
      pending_start_week_end,
      latest_processed_week_end,
      latest_input_fingerprint,
      latest_evaluation_status,
      latest_valid_candidate,
      latest_valid_candidate_week_end,
      latest_data_effective_week_end,
      revision
    ) VALUES (
      p_symbol,
      p_algorithm_id,
      v_gen_id,
      p_confirmed_stage,
      p_confirmed_effective_week_end,
      p_confirmed_at_week_end,
      p_pending_stage,
      p_pending_count,
      p_pending_start_week_end,
      p_latest_processed_week_end,
      p_latest_input_fingerprint,
      p_latest_evaluation_status,
      p_latest_valid_candidate,
      p_latest_valid_candidate_week_end,
      p_latest_data_effective_week_end,
      p_next_revision
    );

    IF v_has_transition THEN
      INSERT INTO public.market_stage_transitions (
        generation_id,
        symbol,
        algorithm_id,
        from_stage,
        to_stage,
        pending_start_week_end,
        effective_week_end,
        confirmed_week_end,
        calculated_at,
        confirmation_input_fingerprint,
        reason_codes,
        metrics_snapshot,
        event_identity,
        status,
        alert_eligible
      ) VALUES (
        v_gen_id,
        p_symbol,
        p_algorithm_id,
        v_tr_from,
        v_tr_to,
        v_tr_pending_start,
        v_tr_effective,
        v_tr_confirmed,
        v_tr_calculated_at,
        v_tr_fingerprint,
        v_tr_reason_codes,
        v_tr_metrics,
        v_tr_identity,
        'active',
        false
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'outcome', 'applied',
      'generation_id', v_gen_id,
      'revision', p_next_revision
    );
  END IF;

  -- ── Existing active generation path ──
  IF p_expected_generation_id IS NULL THEN
    RAISE EXCEPTION 'market_stages_forward_missing_generation_id';
  END IF;

  SELECT g.*
    INTO v_gen
    FROM public.market_stage_timeline_generations g
   WHERE g.id = p_expected_generation_id
     AND g.symbol = p_symbol
     AND g.algorithm_id = p_algorithm_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'inactive_generation'
    );
  END IF;

  IF v_gen.status <> 'active' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'inactive_generation'
    );
  END IF;

  v_gen_id := v_gen.id;
  v_gen_ok :=
    v_gen.symbol IS NOT DISTINCT FROM p_symbol
    AND v_gen.algorithm_id IS NOT DISTINCT FROM p_algorithm_id
    AND v_gen.status IS NOT DISTINCT FROM 'active';

  SELECT s.*
    INTO v_state
    FROM public.market_stage_state s
   WHERE s.symbol = p_symbol
     AND s.algorithm_id = p_algorithm_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'market_stages_forward_missing_state';
  END IF;

  IF v_state.active_generation_id <> v_gen_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'inactive_generation'
    );
  END IF;

  -- Duplicate detection BEFORE any mutation.
  IF v_state.revision = p_next_revision THEN
    SELECT e.*
      INTO v_existing_eval
      FROM public.market_stage_weekly_evaluations e
     WHERE e.generation_id = v_gen_id
       AND e.effective_week_end = p_effective_week_end;

    IF FOUND THEN
      v_eval_ok :=
        v_existing_eval.generation_id IS NOT DISTINCT FROM v_gen_id
        AND v_existing_eval.symbol IS NOT DISTINCT FROM p_symbol
        AND v_existing_eval.algorithm_id IS NOT DISTINCT FROM p_algorithm_id
        AND v_existing_eval.effective_week_end
              IS NOT DISTINCT FROM p_effective_week_end
        AND v_existing_eval.evaluation_status
              IS NOT DISTINCT FROM p_evaluation_status
        AND v_existing_eval.candidate_stage
              IS NOT DISTINCT FROM p_candidate_stage
        AND v_existing_eval.input_fingerprint
              IS NOT DISTINCT FROM p_input_fingerprint
        AND v_existing_eval.p1_status IS NOT DISTINCT FROM p_p1_status
        AND v_existing_eval.reason_codes IS NOT DISTINCT FROM p_reason_codes
        AND v_existing_eval.metrics IS NOT DISTINCT FROM p_metrics
        AND v_existing_eval.calculated_at IS NOT DISTINCT FROM p_calculated_at;
    ELSE
      v_eval_ok := false;
    END IF;

    v_state_ok :=
      v_state.symbol IS NOT DISTINCT FROM p_symbol
      AND v_state.algorithm_id IS NOT DISTINCT FROM p_algorithm_id
      AND v_state.active_generation_id IS NOT DISTINCT FROM v_gen_id
      AND v_state.confirmed_stage IS NOT DISTINCT FROM p_confirmed_stage
      AND v_state.confirmed_effective_week_end
            IS NOT DISTINCT FROM p_confirmed_effective_week_end
      AND v_state.confirmed_at_week_end IS NOT DISTINCT FROM p_confirmed_at_week_end
      AND v_state.pending_stage IS NOT DISTINCT FROM p_pending_stage
      AND v_state.pending_count IS NOT DISTINCT FROM p_pending_count
      AND v_state.pending_start_week_end IS NOT DISTINCT FROM p_pending_start_week_end
      AND v_state.latest_processed_week_end
            IS NOT DISTINCT FROM p_latest_processed_week_end
      AND v_state.latest_input_fingerprint
            IS NOT DISTINCT FROM p_latest_input_fingerprint
      AND v_state.latest_evaluation_status
            IS NOT DISTINCT FROM p_latest_evaluation_status
      AND v_state.latest_valid_candidate
            IS NOT DISTINCT FROM p_latest_valid_candidate
      AND v_state.latest_valid_candidate_week_end
            IS NOT DISTINCT FROM p_latest_valid_candidate_week_end
      AND v_state.latest_data_effective_week_end
            IS NOT DISTINCT FROM p_latest_data_effective_week_end
      AND v_state.revision IS NOT DISTINCT FROM p_next_revision;

    IF v_has_transition THEN
      SELECT t.*
        INTO v_existing_tr
        FROM public.market_stage_transitions t
       WHERE t.generation_id = v_gen_id
         AND t.event_identity = v_tr_identity;
      v_tr_found := FOUND;
      IF v_tr_found THEN
        v_tr_ok :=
          v_existing_tr.generation_id IS NOT DISTINCT FROM v_gen_id
          AND v_existing_tr.symbol IS NOT DISTINCT FROM p_symbol
          AND v_existing_tr.algorithm_id IS NOT DISTINCT FROM p_algorithm_id
          AND v_existing_tr.from_stage IS NOT DISTINCT FROM v_tr_from
          AND v_existing_tr.to_stage IS NOT DISTINCT FROM v_tr_to
          AND v_existing_tr.pending_start_week_end
                IS NOT DISTINCT FROM v_tr_pending_start
          AND v_existing_tr.effective_week_end IS NOT DISTINCT FROM v_tr_effective
          AND v_existing_tr.confirmed_week_end IS NOT DISTINCT FROM v_tr_confirmed
          AND v_existing_tr.calculated_at IS NOT DISTINCT FROM v_tr_calculated_at
          AND v_existing_tr.confirmation_input_fingerprint
                IS NOT DISTINCT FROM v_tr_fingerprint
          AND v_existing_tr.reason_codes IS NOT DISTINCT FROM v_tr_reason_codes
          AND v_existing_tr.metrics_snapshot IS NOT DISTINCT FROM v_tr_metrics
          AND v_existing_tr.event_identity IS NOT DISTINCT FROM v_tr_identity
          AND v_existing_tr.status IS NOT DISTINCT FROM 'active'
          AND v_existing_tr.alert_eligible IS NOT DISTINCT FROM false
          AND v_existing_tr.supersedes_event_id IS NULL
          AND v_existing_tr.superseded_by_event_id IS NULL
          AND v_existing_tr.withdrawn_reason IS NULL;
      ELSE
        v_tr_ok := false;
      END IF;
    ELSE
      SELECT EXISTS (
        SELECT 1
          FROM public.market_stage_transitions t
         WHERE t.generation_id = v_gen_id
           AND (
             t.confirmed_week_end = p_effective_week_end
             OR t.effective_week_end = p_effective_week_end
             OR t.pending_start_week_end = p_effective_week_end
           )
      ) INTO v_unexpected_tr;
      v_tr_ok := NOT COALESCE(v_unexpected_tr, false);
      v_tr_found := false;
    END IF;

    IF v_gen_ok AND v_eval_ok AND v_state_ok AND v_tr_ok THEN
      RETURN jsonb_build_object(
        'ok', true,
        'outcome', CASE
          WHEN v_has_transition THEN 'duplicate_transition'
          ELSE 'duplicate_evaluation'
        END,
        'generation_id', v_gen_id,
        'revision', p_next_revision
      );
    END IF;

    IF v_has_transition AND v_tr_found AND NOT v_tr_ok THEN
      RAISE EXCEPTION 'market_stages_forward_transition_conflict';
    END IF;

    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'stale_revision',
      'current_revision', v_state.revision
    );
  END IF;

  IF v_state.revision <> p_expected_revision THEN
    RETURN jsonb_build_object(
      'ok', false,
      'outcome', 'stale_revision',
      'current_revision', v_state.revision
    );
  END IF;

  -- New write path: refuse if evaluation already exists (immutable).
  SELECT e.*
    INTO v_existing_eval
    FROM public.market_stage_weekly_evaluations e
   WHERE e.generation_id = v_gen_id
     AND e.effective_week_end = p_effective_week_end;

  IF FOUND THEN
    RAISE EXCEPTION 'market_stages_forward_evaluation_conflict';
  END IF;

  -- Transition identity must not already exist for a classified new write.
  IF v_has_transition THEN
    SELECT t.*
      INTO v_existing_tr
      FROM public.market_stage_transitions t
     WHERE t.generation_id = v_gen_id
       AND t.event_identity = v_tr_identity;

    IF FOUND THEN
      RAISE EXCEPTION 'market_stages_forward_transition_conflict';
    END IF;
  ELSE
    SELECT EXISTS (
      SELECT 1
        FROM public.market_stage_transitions t
       WHERE t.generation_id = v_gen_id
         AND (
           t.confirmed_week_end = p_effective_week_end
           OR t.effective_week_end = p_effective_week_end
           OR t.pending_start_week_end = p_effective_week_end
         )
    ) INTO v_unexpected_tr;
    IF COALESCE(v_unexpected_tr, false) THEN
      RAISE EXCEPTION 'market_stages_forward_transition_conflict';
    END IF;
  END IF;

  INSERT INTO public.market_stage_weekly_evaluations (
    generation_id,
    symbol,
    algorithm_id,
    effective_week_end,
    evaluation_status,
    candidate_stage,
    input_fingerprint,
    p1_status,
    reason_codes,
    metrics,
    calculated_at
  ) VALUES (
    v_gen_id,
    p_symbol,
    p_algorithm_id,
    p_effective_week_end,
    p_evaluation_status,
    p_candidate_stage,
    p_input_fingerprint,
    p_p1_status,
    p_reason_codes,
    p_metrics,
    p_calculated_at
  );

  UPDATE public.market_stage_state s
     SET confirmed_stage = p_confirmed_stage,
         confirmed_effective_week_end = p_confirmed_effective_week_end,
         confirmed_at_week_end = p_confirmed_at_week_end,
         pending_stage = p_pending_stage,
         pending_count = p_pending_count,
         pending_start_week_end = p_pending_start_week_end,
         latest_processed_week_end = p_latest_processed_week_end,
         latest_input_fingerprint = p_latest_input_fingerprint,
         latest_evaluation_status = p_latest_evaluation_status,
         latest_valid_candidate = p_latest_valid_candidate,
         latest_valid_candidate_week_end = p_latest_valid_candidate_week_end,
         latest_data_effective_week_end = p_latest_data_effective_week_end,
         revision = p_next_revision,
         updated_at = now()
   WHERE s.symbol = p_symbol
     AND s.algorithm_id = p_algorithm_id
     AND s.active_generation_id = v_gen_id
     AND s.revision = p_expected_revision;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'market_stages_forward_cas_failed';
  END IF;

  IF v_has_transition THEN
    INSERT INTO public.market_stage_transitions (
      generation_id,
      symbol,
      algorithm_id,
      from_stage,
      to_stage,
      pending_start_week_end,
      effective_week_end,
      confirmed_week_end,
      calculated_at,
      confirmation_input_fingerprint,
      reason_codes,
      metrics_snapshot,
      event_identity,
      status,
      alert_eligible
    ) VALUES (
      v_gen_id,
      p_symbol,
      p_algorithm_id,
      v_tr_from,
      v_tr_to,
      v_tr_pending_start,
      v_tr_effective,
      v_tr_confirmed,
      v_tr_calculated_at,
      v_tr_fingerprint,
      v_tr_reason_codes,
      v_tr_metrics,
      v_tr_identity,
      'active',
      false
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'outcome', 'applied',
    'generation_id', v_gen_id,
    'revision', p_next_revision
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.persist_market_stage_forward_v1(
  text, text, uuid, bigint, date, text, text, text, text, jsonb, jsonb, timestamptz,
  text, date, date, text, smallint, date, date, text, text, text, date, date, bigint, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.persist_market_stage_forward_v1(
  text, text, uuid, bigint, date, text, text, text, text, jsonb, jsonb, timestamptz,
  text, date, date, text, smallint, date, date, text, text, text, date, date, bigint, jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.persist_market_stage_forward_v1(
  text, text, uuid, bigint, date, text, text, text, text, jsonb, jsonb, timestamptz,
  text, date, date, text, smallint, date, date, text, text, text, date, date, bigint, jsonb
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.persist_market_stage_forward_v1(
  text, text, uuid, bigint, date, text, text, text, text, jsonb, jsonb, timestamptz,
  text, date, date, text, smallint, date, date, text, text, text, date, date, bigint, jsonb
) TO service_role;
