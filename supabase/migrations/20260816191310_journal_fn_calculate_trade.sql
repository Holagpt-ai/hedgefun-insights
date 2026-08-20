-- journal_calculate_trade_v1
-- Mirrors src/journal/calc/engine.ts calculatePosition() + resolveInitialRisk().
-- SECURITY INVOKER. Authenticated callers may only calculate their own trades.
-- Service-role (auth.uid() IS NULL AND auth.role() = service_role) may calculate
-- any trade id. Cross-user access returns the same 'trade not found' error.
-- Writes begin only after a successful compute. over_exit_blocked raises first.
-- integrity-md5: a22c1160044dd175df43bc035e5ddace
DO $journal_seg$
DECLARE
  v_statements text[] := ARRAY[
    $journal_stmt$CREATE OR REPLACE FUNCTION public.journal_calculate_trade_v1(p_trade_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $calc$
DECLARE
  v_uid uuid;
  v_role text;
  v_trade public.journal_trades%ROWTYPE;
  v_plan public.journal_trade_plans%ROWTYPE;
  v_exec public.journal_executions%ROWTYPE;
  v_fee public.journal_execution_fees%ROWTYPE;
  v_direction text;
  v_is_open boolean;
  v_qty numeric;
  v_price numeric;
  v_mult numeric;
  v_exec_fees numeric;
  v_fee_n integer;
  v_open_sum numeric;
  v_left numeric;
  v_matched numeric;
  v_delta numeric;
  v_lot_qty numeric[] := ARRAY[]::numeric[];
  v_lot_px numeric[] := ARRAY[]::numeric[];
  v_opened_qty numeric := 0;
  v_closed_qty numeric := 0;
  v_entry_px_qty numeric := 0;
  v_exit_px_qty numeric := 0;
  v_entry_notional numeric := 0;
  v_exit_notional numeric := 0;
  v_fees numeric := 0;
  v_gross numeric := 0;
  v_net numeric := 0;
  v_remaining numeric := 0;
  v_avg_entry numeric;
  v_avg_exit numeric;
  v_hold integer;
  v_return_pct numeric;
  v_first_open timestamptz;
  v_last_close timestamptz;
  v_run_id uuid;
  v_state text := 'authoritative';
  v_fees_incomplete boolean := false;
  v_exec_count integer := 0;
  v_first_leg_mult numeric;
  v_plan_entry numeric;
  v_plan_stop numeric;
  v_plan_size numeric;
  v_stored_risk numeric;
  v_plan_mult numeric;
  v_risk_per_share numeric;
  v_initial_risk numeric;
  v_planned_qty numeric;
  v_risk_source text := 'unavailable';
  v_r numeric;
  v_outcome text;
  v_exclusions text[] := ARRAY[]::text[];
  v_asset text;
  v_i integer;
BEGIN
  IF p_trade_id IS NULL THEN
    RAISE EXCEPTION 'p_trade_id required';
  END IF;

  v_uid := auth.uid();
  v_role := coalesce(auth.role(), '');

  SELECT * INTO v_trade
  FROM public.journal_trades
  WHERE id = p_trade_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade not found' USING ERRCODE = '42501';
  END IF;

  IF v_uid IS NULL THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
  ELSIF v_trade.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'trade not found' USING ERRCODE = '42501';
  END IF;

  v_direction := COALESCE(
    v_trade.direction,
    CASE WHEN lower(coalesce(v_trade.side, '')) IN ('short', 'sell') THEN 'short' ELSE 'long' END
  );
  v_asset := coalesce(v_trade.asset_class, 'stock');

  SELECT * INTO v_plan
  FROM public.journal_trade_plans
  WHERE trade_id = p_trade_id;

  SELECT multiplier INTO v_first_leg_mult
  FROM public.journal_trade_legs
  WHERE trade_id = p_trade_id
  ORDER BY sequence_index, created_at, id
  LIMIT 1;

  v_plan_mult := coalesce(
    nullif(v_first_leg_mult, 0),
    CASE WHEN v_asset = 'equity_option' THEN 100 ELSE 1 END
  );
  v_plan_entry := coalesce(v_plan.planned_entry, v_trade.planned_entry);
  v_plan_stop := coalesce(v_plan.planned_stop, v_trade.planned_stop);
  v_plan_size := coalesce(v_plan.planned_size, v_trade.planned_size);
  v_stored_risk := coalesce(v_plan.planned_risk, v_trade.planned_risk);
  v_planned_qty := v_plan_size;

  IF v_plan_entry IS NOT NULL AND v_plan_stop IS NOT NULL AND v_plan_size IS NOT NULL THEN
    v_risk_per_share := abs(v_plan_entry - v_plan_stop);
    v_initial_risk := v_risk_per_share * v_plan_size * v_plan_mult;
    v_risk_source := 'plan_inputs';
  ELSIF v_stored_risk IS NOT NULL THEN
    v_initial_risk := v_stored_risk;
    v_risk_source := 'stored_planned_risk';
    IF v_plan_entry IS NOT NULL AND v_plan_stop IS NOT NULL THEN
      v_risk_per_share := abs(v_plan_entry - v_plan_stop);
    END IF;
  ELSE
    v_initial_risk := NULL;
    v_risk_source := 'unavailable';
    IF v_plan_entry IS NOT NULL AND v_plan_stop IS NOT NULL THEN
      v_risk_per_share := abs(v_plan_entry - v_plan_stop);
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_exec_count
  FROM public.journal_executions
  WHERE trade_id = p_trade_id;

  IF v_exec_count = 0 THEN
    v_state := 'unavailable';
    v_exclusions := array_append(v_exclusions, 'no_executions');
    v_outcome := 'excluded';
    v_net := 0;
    v_gross := 0;
    v_fees := 0;
    v_remaining := 0;
  ELSE
    FOR v_exec IN
      SELECT *
      FROM public.journal_executions
      WHERE trade_id = p_trade_id
      ORDER BY
        coalesce(occurred_at_utc, occurred_at, created_at),
        sequence_index,
        created_at,
        id
    LOOP
      v_qty := v_exec.quantity;
      v_price := v_exec.price;
      -- Per-execution multiplier. Never reuse the last loop value for the full trade.
      v_mult := coalesce(nullif(v_exec.multiplier, 0), nullif(v_first_leg_mult, 0), 1);

      SELECT COUNT(*) INTO v_fee_n
      FROM public.journal_execution_fees
      WHERE execution_id = v_exec.id;

      v_exec_fees := 0;
      IF v_fee_n > 0 THEN
        FOR v_fee IN
          SELECT *
          FROM public.journal_execution_fees
          WHERE execution_id = v_exec.id
        LOOP
          IF v_fee.account_currency_amount IS NOT NULL THEN
            v_exec_fees := v_exec_fees + v_fee.account_currency_amount;
          ELSIF v_fee.native_currency IS NOT NULL
            AND v_fee.currency IS NOT NULL
            AND v_fee.native_currency IS DISTINCT FROM v_fee.currency
            AND v_fee.conversion_rate IS NULL THEN
            v_fees_incomplete := true;
          ELSE
            v_exec_fees := v_exec_fees + coalesce(v_fee.amount, 0);
          END IF;
        END LOOP;
      ELSE
        v_exec_fees := coalesce(v_exec.commission, 0)
          + coalesce(v_exec.regulatory_fee, 0)
          + coalesce(v_exec.other_fee, 0);
      END IF;
      v_fees := v_fees + v_exec_fees;

      v_is_open := CASE
        WHEN v_direction = 'short' THEN lower(v_exec.action) = 'short'
        ELSE lower(v_exec.action) = 'buy'
      END;

      IF v_is_open THEN
        v_lot_qty := array_append(v_lot_qty, v_qty);
        v_lot_px := array_append(v_lot_px, v_price);
        v_opened_qty := v_opened_qty + v_qty;
        v_entry_notional := v_entry_notional + (v_price * v_qty * v_mult);
        v_entry_px_qty := v_entry_px_qty + (v_price * v_qty);
        v_first_open := COALESCE(v_first_open, coalesce(v_exec.occurred_at_utc, v_exec.occurred_at));
      ELSE
        v_open_sum := 0;
        IF coalesce(array_length(v_lot_qty, 1), 0) > 0 THEN
          FOR v_i IN 1 .. array_length(v_lot_qty, 1) LOOP
            v_open_sum := v_open_sum + v_lot_qty[v_i];
          END LOOP;
        END IF;
        IF v_qty > v_open_sum THEN
          RAISE EXCEPTION 'over_exit_blocked'
            USING ERRCODE = 'P0001',
                  HINT = 'over_exit_blocked',
                  DETAIL = 'Closing quantity exceeds remaining open quantity.';
        END IF;

        v_left := v_qty;
        WHILE v_left > 0 LOOP
          v_matched := LEAST(v_left, v_lot_qty[1]);
          v_delta := (v_price - v_lot_px[1]) * v_matched * v_mult;
          IF v_direction = 'short' THEN
            v_delta := -v_delta;
          END IF;
          v_gross := v_gross + v_delta;
          v_exit_notional := v_exit_notional + (v_price * v_matched * v_mult);
          v_exit_px_qty := v_exit_px_qty + (v_price * v_matched);
          v_closed_qty := v_closed_qty + v_matched;
          v_lot_qty[1] := v_lot_qty[1] - v_matched;
          v_left := v_left - v_matched;
          v_last_close := coalesce(v_exec.occurred_at_utc, v_exec.occurred_at);
          IF v_lot_qty[1] = 0 THEN
            v_lot_qty := v_lot_qty[2:];
            v_lot_px := v_lot_px[2:];
          END IF;
        END LOOP;
      END IF;
    END LOOP;

    v_remaining := 0;
    IF coalesce(array_length(v_lot_qty, 1), 0) > 0 THEN
      FOR v_i IN 1 .. array_length(v_lot_qty, 1) LOOP
        v_remaining := v_remaining + v_lot_qty[v_i];
      END LOOP;
    END IF;

    v_net := v_gross - v_fees;
    IF v_opened_qty > 0 THEN
      v_avg_entry := v_entry_px_qty / v_opened_qty;
    END IF;
    IF v_closed_qty > 0 THEN
      v_avg_exit := v_exit_px_qty / v_closed_qty;
    END IF;
    IF v_first_open IS NOT NULL AND v_last_close IS NOT NULL THEN
      v_hold := ROUND((EXTRACT(EPOCH FROM (v_last_close - v_first_open))::numeric) / 60)::integer;
    END IF;
    IF v_entry_notional IS NOT NULL AND v_entry_notional <> 0 THEN
      v_return_pct := v_net / v_entry_notional;
    END IF;
    IF v_fees_incomplete THEN
      v_state := 'incomplete';
      v_exclusions := array_append(v_exclusions, 'missing_fee_conversion');
    END IF;
  END IF;

  IF v_initial_risk IS NOT NULL AND v_initial_risk <> 0 THEN
    v_r := v_net / v_initial_risk;
  ELSE
    v_r := NULL;
  END IF;

  IF v_state = 'unavailable' THEN
    v_outcome := 'excluded';
  ELSIF v_remaining > 0 AND v_closed_qty = 0 THEN
    v_outcome := 'open';
  ELSIF v_remaining > 0 AND v_net = 0 THEN
    v_outcome := 'open';
  ELSIF v_r IS NOT NULL AND abs(v_r) <= 0.05 THEN
    v_outcome := 'breakeven';
  ELSIF v_net > 0 THEN
    v_outcome := 'win';
  ELSIF v_net < 0 THEN
    v_outcome := 'loss';
  ELSE
    v_outcome := 'breakeven';
  END IF;

  -- writes begin after successful compute; over_exit raises before this point
  UPDATE public.journal_trades
  SET
    return_dollars = v_net,
    return_pct = v_return_pct,
    hold_duration_minutes = v_hold,
    calculation_version = 'journal-calc.v1',
    is_wash = (v_outcome = 'breakeven'),
    direction = COALESCE(direction, v_direction),
    updated_at = now()
  WHERE id = p_trade_id
    AND user_id = v_trade.user_id;

  INSERT INTO public.journal_calculation_runs (
    user_id, trade_id, calculation_version, input_version, state, result,
    gross_pnl, net_pnl, fees, remaining_qty, weighted_avg_entry, weighted_avg_exit,
    initial_risk, risk_per_share, planned_quantity, plan_multiplier,
    planned_risk_source, r_multiple, outcome, over_exit_blocked
  ) VALUES (
    v_trade.user_id,
    p_trade_id,
    'journal-calc.v1',
    'journal-input.v1',
    v_state,
    jsonb_build_object(
      'gross_pnl', v_gross,
      'net_pnl', v_net,
      'fees', v_fees,
      'remaining_qty', v_remaining,
      'weighted_avg_entry', v_avg_entry,
      'weighted_avg_exit', v_avg_exit,
      'open_qty', v_opened_qty,
      'closed_qty', v_closed_qty,
      'entry_notional', v_entry_notional,
      'exit_notional', v_exit_notional,
      'direction', v_direction,
      'initial_risk', v_initial_risk,
      'risk_per_share', v_risk_per_share,
      'planned_quantity', v_planned_qty,
      'plan_multiplier', v_plan_mult,
      'planned_risk_source', v_risk_source,
      'r_multiple', v_r,
      'outcome', v_outcome,
      'over_exit_blocked', false,
      'calculation_state', v_state,
      'exclusions', to_jsonb(v_exclusions)
    ),
    v_gross, v_net, v_fees, v_remaining, v_avg_entry, v_avg_exit,
    v_initial_risk, v_risk_per_share, v_planned_qty, v_plan_mult,
    v_risk_source, v_r, v_outcome, false
  )
  ON CONFLICT (trade_id, calculation_version) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    input_version = EXCLUDED.input_version,
    state = EXCLUDED.state,
    result = EXCLUDED.result,
    gross_pnl = EXCLUDED.gross_pnl,
    net_pnl = EXCLUDED.net_pnl,
    fees = EXCLUDED.fees,
    remaining_qty = EXCLUDED.remaining_qty,
    weighted_avg_entry = EXCLUDED.weighted_avg_entry,
    weighted_avg_exit = EXCLUDED.weighted_avg_exit,
    initial_risk = EXCLUDED.initial_risk,
    risk_per_share = EXCLUDED.risk_per_share,
    planned_quantity = EXCLUDED.planned_quantity,
    plan_multiplier = EXCLUDED.plan_multiplier,
    planned_risk_source = EXCLUDED.planned_risk_source,
    r_multiple = EXCLUDED.r_multiple,
    outcome = EXCLUDED.outcome,
    over_exit_blocked = EXCLUDED.over_exit_blocked
  RETURNING id INTO v_run_id;

  RETURN jsonb_build_object(
    'trade_id', p_trade_id,
    'calculation_run_id', v_run_id,
    'gross_pnl', v_gross,
    'net_pnl', v_net,
    'fees', v_fees,
    'remaining_qty', v_remaining,
    'weighted_avg_entry', v_avg_entry,
    'weighted_avg_exit', v_avg_exit,
    'initial_risk', v_initial_risk,
    'risk_per_share', v_risk_per_share,
    'planned_quantity', v_planned_qty,
    'plan_multiplier', v_plan_mult,
    'planned_risk_source', v_risk_source,
    'r_multiple', v_r,
    'outcome', v_outcome,
    'over_exit_blocked', false,
    'state', v_state,
    'exclusions', to_jsonb(v_exclusions)
  );
END;
$calc$
$journal_stmt$,
    $journal_stmt$GRANT EXECUTE ON FUNCTION public.journal_calculate_trade_v1(uuid) TO authenticated, service_role
$journal_stmt$,
    $journal_stmt$REVOKE ALL ON FUNCTION public.journal_calculate_trade_v1(uuid) FROM PUBLIC
$journal_stmt$
  ];
  v_expected text := 'a22c1160044dd175df43bc035e5ddace';
  v_digest text;
  v_stmt text;
BEGIN
  v_digest := md5(array_to_string(v_statements, E'\x1e'));
  IF v_digest IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION
      'journal migration integrity mismatch: expected %, got %',
      v_expected,
      v_digest;
  END IF;
  FOREACH v_stmt IN ARRAY v_statements LOOP
    EXECUTE v_stmt;
  END LOOP;
END;
$journal_seg$;
