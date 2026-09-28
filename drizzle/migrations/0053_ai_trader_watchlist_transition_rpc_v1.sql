-- AI Trader watchlist transition RPC v1 (Sprint 3C.1).
-- WRITE ONLY. Do not apply in this sprint.
-- Atomic current-state + append-only history. No orders, positions, trades, brokers.
-- No pgvector. No embeddings. No seed rows. Does not change operating_mode.

ALTER TABLE public.ai_trader_watchlist_transitions
  ADD COLUMN IF NOT EXISTS idempotency_key text;

COMMENT ON COLUMN public.ai_trader_watchlist_transitions.idempotency_key IS
  'Durable transition identity. Not occurred_at. Same logical retry must not duplicate history.';

CREATE UNIQUE INDEX IF NOT EXISTS ai_trader_watchlist_transitions_idempotency_uidx
  ON public.ai_trader_watchlist_transitions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ai_trader_apply_watchlist_transition_v1(p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO public
AS $$
DECLARE
  v_symbol text := NULLIF(btrim(p_row->>'symbol'), '');
  v_new_state text := NULLIF(p_row->>'new_state', '');
  v_expected_prior text := NULLIF(p_row->>'expected_prior_state', '');
  v_expected_updated_at timestamptz := NULLIF(p_row->>'expected_updated_at', '')::timestamptz;
  v_key text := NULLIF(btrim(p_row->>'idempotency_key'), '');
  v_occurred_at timestamptz := COALESCE(NULLIF(p_row->>'occurred_at', '')::timestamptz, now());
  v_source_rank integer := NULLIF(p_row->>'source_rank', '')::integer;
  v_source text := COALESCE(NULLIF(p_row->>'source', ''), 'radar_v22_board');
  v_source_session text := NULLIF(p_row->>'source_session', '');
  v_reason_codes text[] := ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_row->'reason_codes', '[]'::jsonb)));
  v_evidence_ids text[] := ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_row->'evidence_ids', '[]'::jsonb)));
  v_context_snapshot_id uuid := NULLIF(p_row->>'context_snapshot_id', '')::uuid;
  v_session_id uuid := NULLIF(p_row->>'session_id', '')::uuid;
  v_actor_type text := COALESCE(NULLIF(p_row->>'actor_type', ''), 'SYSTEM');
  v_catalyst_refs jsonb := COALESCE(p_row->'catalyst_refs', '[]'::jsonb);
  v_market_evidence_refs jsonb := COALESCE(p_row->'market_evidence_refs', '[]'::jsonb);
  v_cooldown_until timestamptz := NULLIF(p_row->>'cooldown_until', '')::timestamptz;
  v_expires_at timestamptz := NULLIF(p_row->>'expires_at', '')::timestamptz;
  v_confidence numeric := NULLIF(p_row->>'confidence', '')::numeric;
  v_item public.ai_trader_watchlist_items%ROWTYPE;
  v_existing_tx public.ai_trader_watchlist_transitions%ROWTYPE;
  v_transition_id uuid;
  v_legal boolean := false;
  v_shadow_allowed boolean := false;
BEGIN
  IF v_symbol IS NULL OR v_new_state IS NULL OR v_key IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'FAILED',
      'item_id', NULL,
      'transition_id', NULL,
      'symbol', v_symbol,
      'prior_state', v_expected_prior,
      'new_state', v_new_state,
      'idempotency_key', v_key,
      'message', 'symbol, new_state, and idempotency_key are required'
    );
  END IF;

  IF v_new_state IN ('ENTRY_READY', 'POSITION_OPEN', 'EXITED') THEN
    RETURN jsonb_build_object(
      'status', 'PROHIBITED_STATE',
      'item_id', NULL,
      'transition_id', NULL,
      'symbol', v_symbol,
      'prior_state', v_expected_prior,
      'new_state', v_new_state,
      'idempotency_key', v_key,
      'message', 'SHADOW-era RPC cannot enter ENTRY_READY, POSITION_OPEN, or EXITED'
    );
  END IF;

  v_shadow_allowed := v_new_state IN (
    'DISCOVERED', 'RESEARCHING', 'WATCHING', 'HIGH_PRIORITY', 'COOLDOWN', 'REMOVED'
  );
  IF NOT v_shadow_allowed THEN
    RETURN jsonb_build_object(
      'status', 'PROHIBITED_STATE',
      'item_id', NULL,
      'transition_id', NULL,
      'symbol', v_symbol,
      'prior_state', v_expected_prior,
      'new_state', v_new_state,
      'idempotency_key', v_key,
      'message', 'new_state is not a SHADOW-era watchlist state'
    );
  END IF;

  IF v_source_rank IS NULL OR v_source_rank < 1 THEN
    RETURN jsonb_build_object(
      'status', 'FAILED',
      'item_id', NULL,
      'transition_id', NULL,
      'symbol', v_symbol,
      'prior_state', v_expected_prior,
      'new_state', v_new_state,
      'idempotency_key', v_key,
      'message', 'source_rank must be >= 1'
    );
  END IF;

  SELECT * INTO v_existing_tx
  FROM public.ai_trader_watchlist_transitions
  WHERE idempotency_key = v_key
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'NO_CHANGE',
      'item_id', v_existing_tx.watchlist_item_id,
      'transition_id', v_existing_tx.id,
      'symbol', v_existing_tx.symbol,
      'prior_state', v_existing_tx.prior_state,
      'new_state', v_existing_tx.new_state,
      'idempotency_key', v_existing_tx.idempotency_key,
      'message', 'idempotent retry'
    );
  END IF;

  SELECT * INTO v_item
  FROM public.ai_trader_watchlist_items
  WHERE symbol = v_symbol
  FOR UPDATE;

  IF NOT FOUND THEN
    IF v_expected_prior IS NOT NULL THEN
      RETURN jsonb_build_object(
        'status', 'CONFLICT',
        'item_id', NULL,
        'transition_id', NULL,
        'symbol', v_symbol,
        'prior_state', v_expected_prior,
        'new_state', v_new_state,
        'idempotency_key', v_key,
        'message', 'expected an existing item'
      );
    END IF;
    IF v_new_state <> 'DISCOVERED' THEN
      RETURN jsonb_build_object(
        'status', 'INVALID_TRANSITION',
        'item_id', NULL,
        'transition_id', NULL,
        'symbol', v_symbol,
        'prior_state', NULL,
        'new_state', v_new_state,
        'idempotency_key', v_key,
        'message', 'first row must be DISCOVERED'
      );
    END IF;

    BEGIN
      INSERT INTO public.ai_trader_watchlist_items (
        symbol, state, discovered_at, last_evaluated_at, current_priority, source, source_rank,
        source_session, context_snapshot_id, catalyst_refs, market_evidence_refs, reason_codes,
        confidence, expires_at, cooldown_until
      ) VALUES (
        v_symbol, 'DISCOVERED', v_occurred_at, v_occurred_at, v_source_rank, v_source, v_source_rank,
        v_source_session, v_context_snapshot_id, v_catalyst_refs, v_market_evidence_refs, v_reason_codes,
        v_confidence, v_expires_at, NULL
      )
      RETURNING * INTO v_item;

      INSERT INTO public.ai_trader_watchlist_transitions (
        watchlist_item_id, symbol, prior_state, new_state, occurred_at, reason_codes,
        evidence_ids, context_snapshot_id, session_id, source_rank, confidence, actor_type, source,
        idempotency_key
      ) VALUES (
        v_item.id, v_symbol, NULL, 'DISCOVERED', v_occurred_at, v_reason_codes,
        v_evidence_ids, v_context_snapshot_id, v_session_id, v_source_rank, v_confidence, v_actor_type, v_source,
        v_key
      )
      RETURNING id INTO v_transition_id;

      RETURN jsonb_build_object(
        'status', 'APPLIED',
        'item_id', v_item.id,
        'transition_id', v_transition_id,
        'symbol', v_symbol,
        'prior_state', NULL,
        'new_state', 'DISCOVERED',
        'idempotency_key', v_key
      );
    EXCEPTION
      WHEN unique_violation THEN
        SELECT * INTO v_existing_tx
        FROM public.ai_trader_watchlist_transitions
        WHERE idempotency_key = v_key
        LIMIT 1;
        IF FOUND THEN
          RETURN jsonb_build_object(
            'status', 'NO_CHANGE',
            'item_id', v_existing_tx.watchlist_item_id,
            'transition_id', v_existing_tx.id,
            'symbol', v_existing_tx.symbol,
            'prior_state', v_existing_tx.prior_state,
            'new_state', v_existing_tx.new_state,
            'idempotency_key', v_existing_tx.idempotency_key,
            'message', 'idempotent retry after race'
          );
        END IF;

        SELECT * INTO v_item
        FROM public.ai_trader_watchlist_items
        WHERE symbol = v_symbol
        FOR UPDATE;
        IF NOT FOUND THEN
          RETURN jsonb_build_object(
            'status', 'FAILED',
            'item_id', NULL,
            'transition_id', NULL,
            'symbol', v_symbol,
            'prior_state', NULL,
            'new_state', v_new_state,
            'idempotency_key', v_key,
            'message', 'unique violation without recoverable row'
          );
        END IF;
    END;
  END IF;

  IF v_item.state IN ('ENTRY_READY', 'POSITION_OPEN', 'EXITED') THEN
    RETURN jsonb_build_object(
      'status', 'PROHIBITED_STATE',
      'item_id', v_item.id,
      'transition_id', NULL,
      'symbol', v_symbol,
      'prior_state', v_item.state,
      'new_state', v_new_state,
      'idempotency_key', v_key,
      'message', 'SHADOW-era RPC cannot mutate trading-state items'
    );
  END IF;

  IF v_expected_prior IS DISTINCT FROM v_item.state THEN
    RETURN jsonb_build_object(
      'status', 'CONFLICT',
      'item_id', v_item.id,
      'transition_id', NULL,
      'symbol', v_symbol,
      'prior_state', v_item.state,
      'new_state', v_new_state,
      'idempotency_key', v_key,
      'message', 'expected_prior_state does not match locked current state'
    );
  END IF;

  IF v_expected_updated_at IS NOT NULL AND v_item.updated_at IS DISTINCT FROM v_expected_updated_at THEN
    RETURN jsonb_build_object(
      'status', 'CONFLICT',
      'item_id', v_item.id,
      'transition_id', NULL,
      'symbol', v_symbol,
      'prior_state', v_item.state,
      'new_state', v_new_state,
      'idempotency_key', v_key,
      'message', 'expected_updated_at does not match locked current row'
    );
  END IF;

  IF v_item.state = v_new_state THEN
    RETURN jsonb_build_object(
      'status', 'NO_CHANGE',
      'item_id', v_item.id,
      'transition_id', NULL,
      'symbol', v_symbol,
      'prior_state', v_item.state,
      'new_state', v_new_state,
      'idempotency_key', v_key,
      'message', 'current state already equals new_state'
    );
  END IF;

  v_legal := (v_item.state, v_new_state) IN (
    ('DISCOVERED', 'RESEARCHING'),
    ('DISCOVERED', 'REMOVED'),
    ('DISCOVERED', 'COOLDOWN'),
    ('RESEARCHING', 'WATCHING'),
    ('RESEARCHING', 'REMOVED'),
    ('RESEARCHING', 'COOLDOWN'),
    ('RESEARCHING', 'DISCOVERED'),
    ('WATCHING', 'HIGH_PRIORITY'),
    ('WATCHING', 'REMOVED'),
    ('WATCHING', 'COOLDOWN'),
    ('WATCHING', 'RESEARCHING'),
    ('HIGH_PRIORITY', 'REMOVED'),
    ('HIGH_PRIORITY', 'COOLDOWN'),
    ('HIGH_PRIORITY', 'WATCHING'),
    ('COOLDOWN', 'WATCHING'),
    ('COOLDOWN', 'REMOVED'),
    ('REMOVED', 'DISCOVERED')
  );

  IF NOT v_legal THEN
    RETURN jsonb_build_object(
      'status', 'INVALID_TRANSITION',
      'item_id', v_item.id,
      'transition_id', NULL,
      'symbol', v_symbol,
      'prior_state', v_item.state,
      'new_state', v_new_state,
      'idempotency_key', v_key,
      'message', format('illegal watchlist transition %s → %s', v_item.state, v_new_state)
    );
  END IF;

  BEGIN
    INSERT INTO public.ai_trader_watchlist_transitions (
      watchlist_item_id, symbol, prior_state, new_state, occurred_at, reason_codes,
      evidence_ids, context_snapshot_id, session_id, source_rank, confidence, actor_type, source,
      idempotency_key
    ) VALUES (
      v_item.id, v_symbol, v_item.state, v_new_state, v_occurred_at, v_reason_codes,
      v_evidence_ids, v_context_snapshot_id, v_session_id, v_source_rank, v_confidence, v_actor_type, v_source,
      v_key
    )
    RETURNING id INTO v_transition_id;

    UPDATE public.ai_trader_watchlist_items
    SET
      state = v_new_state,
      last_evaluated_at = v_occurred_at,
      current_priority = v_source_rank,
      source = v_source,
      source_rank = v_source_rank,
      source_session = v_source_session,
      context_snapshot_id = COALESCE(v_context_snapshot_id, context_snapshot_id),
      catalyst_refs = v_catalyst_refs,
      market_evidence_refs = v_market_evidence_refs,
      reason_codes = v_reason_codes,
      confidence = v_confidence,
      expires_at = v_expires_at,
      cooldown_until = CASE WHEN v_new_state = 'COOLDOWN' THEN v_cooldown_until ELSE NULL END,
      updated_at = v_occurred_at
    WHERE id = v_item.id;

    RETURN jsonb_build_object(
      'status', 'APPLIED',
      'item_id', v_item.id,
      'transition_id', v_transition_id,
      'symbol', v_symbol,
      'prior_state', v_item.state,
      'new_state', v_new_state,
      'idempotency_key', v_key
    );
  EXCEPTION
    WHEN unique_violation THEN
      SELECT * INTO v_existing_tx
      FROM public.ai_trader_watchlist_transitions
      WHERE idempotency_key = v_key
      LIMIT 1;
      IF FOUND THEN
        RETURN jsonb_build_object(
          'status', 'NO_CHANGE',
          'item_id', v_existing_tx.watchlist_item_id,
          'transition_id', v_existing_tx.id,
          'symbol', v_existing_tx.symbol,
          'prior_state', v_existing_tx.prior_state,
          'new_state', v_existing_tx.new_state,
          'idempotency_key', v_existing_tx.idempotency_key,
          'message', 'idempotent retry after race'
        );
      END IF;
      RAISE;
  END;
END;
$$;

COMMENT ON FUNCTION public.ai_trader_apply_watchlist_transition_v1(jsonb) IS
  'Atomic AI Trader watchlist current-state + transition history. INVOKER. SHADOW-era states only. Not applied until Lovable review.';

REVOKE ALL ON FUNCTION public.ai_trader_apply_watchlist_transition_v1(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_trader_apply_watchlist_transition_v1(jsonb) TO service_role;
