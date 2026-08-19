-- Stocksist Trading Journal functions, metric seed, and backfill helpers.
-- plpgsql with SET search_path = public. NUMERIC arithmetic only (no float).

-- ---------------------------------------------------------------------------
-- System metric catalog (English + Spanish) + journal-calc.v1 formulas
-- ---------------------------------------------------------------------------

INSERT INTO public.journal_metric_definitions (
  id, user_id, metric_key, name_en, name_es, definition_en, definition_es, unit, category
) VALUES
  (
    '11111111-1111-4111-8111-000000000001', NULL, 'win_rate',
    'Win rate', 'Tasa de aciertos',
    'Share of included closed trades with a winning outcome.',
    'Proporción de operaciones cerradas incluidas con resultado ganador.',
    'ratio', 'performance'
  ),
  (
    '11111111-1111-4111-8111-000000000002', NULL, 'breakeven',
    'Breakeven', 'Punto de equilibrio',
    'Closed trades treated as neither win nor loss, including wash trades.',
    'Operaciones cerradas que no son ganancia ni pérdida, incluidas las wash trades.',
    'count', 'performance'
  ),
  (
    '11111111-1111-4111-8111-000000000003', NULL, 'r_multiple',
    'R multiple', 'Múltiplo R',
    'Net result divided by planned initial risk (R).',
    'Resultado neto dividido por el riesgo inicial planificado (R).',
    'r', 'performance'
  ),
  (
    '11111111-1111-4111-8111-000000000004', NULL, 'profit_factor',
    'Profit factor', 'Factor de beneficio',
    'Gross profits divided by the absolute value of gross losses.',
    'Ganancias brutas divididas por el valor absoluto de las pérdidas brutas.',
    'ratio', 'performance'
  ),
  (
    '11111111-1111-4111-8111-000000000005', NULL, 'expectancy',
    'Expectancy', 'Esperanza matemática',
    'Average net result per included closed trade.',
    'Resultado neto promedio por operación cerrada incluida.',
    'currency', 'performance'
  ),
  (
    '11111111-1111-4111-8111-000000000006', NULL, 'net_pnl',
    'Net P&L', 'P&L neto',
    'Gross realized P&L minus fees.',
    'P&L realizado bruto menos comisiones y fees.',
    'currency', 'pnl'
  ),
  (
    '11111111-1111-4111-8111-000000000007', NULL, 'gross_pnl',
    'Gross P&L', 'P&L bruto',
    'Realized P&L before fees.',
    'P&L realizado antes de fees.',
    'currency', 'pnl'
  ),
  (
    '11111111-1111-4111-8111-000000000008', NULL, 'fees',
    'Fees', 'Comisiones',
    'Sum of commissions, regulatory, and other execution fees.',
    'Suma de comisiones, fees regulatorios y otros fees de ejecución.',
    'currency', 'cost'
  ),
  (
    '11111111-1111-4111-8111-000000000009', NULL, 'drawdown',
    'Drawdown', 'Drawdown',
    'Peak-to-trough decline in cumulative net P&L.',
    'Caída de pico a valle del P&L neto acumulado.',
    'currency', 'risk'
  )
ON CONFLICT (id) DO UPDATE SET
  metric_key = EXCLUDED.metric_key,
  name_en = EXCLUDED.name_en,
  name_es = EXCLUDED.name_es,
  definition_en = EXCLUDED.definition_en,
  definition_es = EXCLUDED.definition_es,
  unit = EXCLUDED.unit,
  category = EXCLUDED.category,
  updated_at = now();

INSERT INTO public.journal_metric_formula_versions (metric_definition_id, formula_version, expression)
SELECT d.id, 'journal-calc.v1', v.expression
FROM public.journal_metric_definitions d
JOIN (
  VALUES
    ('win_rate', 'wins / nullif(included_closed_trades, 0)'),
    ('breakeven', 'count_breakeven_including_wash_trades'),
    ('r_multiple', 'net_pnl / nullif(resolved_initial_risk, 0)'),
    ('profit_factor', 'gross_profits / nullif(abs(gross_losses), 0)'),
    ('expectancy', 'net_pnl / nullif(included_closed_trades, 0)'),
    ('net_pnl', 'gross_pnl - fees'),
    ('gross_pnl', 'sum(realized_pnl_before_fees)'),
    ('fees', 'sum(execution_fees)'),
    ('drawdown', 'max(peak_equity - equity)')
) AS v(metric_key, expression) ON v.metric_key = d.metric_key
WHERE d.user_id IS NULL
ON CONFLICT (metric_definition_id, formula_version) DO UPDATE SET
  expression = EXCLUDED.expression;

-- ---------------------------------------------------------------------------
-- journal_calculate_trade_v1
-- Mirrors src/journal/calc/engine.ts calculatePosition() + resolveInitialRisk().
-- SECURITY INVOKER. Authenticated callers may only calculate their own trades.
-- Service-role (auth.uid() IS NULL AND auth.role() = service_role) may calculate
-- any trade id. Cross-user access returns the same 'trade not found' error.
-- Writes begin only after a successful compute. over_exit_blocked raises first.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.journal_calculate_trade_v1(p_trade_id uuid)
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
$calc$;

-- ---------------------------------------------------------------------------
-- journal_refresh_derived
-- Daily metrics from authoritative calculation-run evidence, not planned_risk.
-- Authenticated callers always refresh auth.uid(). p_user_id is never an
-- ownership override. Service-role may pass p_user_id when auth.uid() is null.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.journal_refresh_derived(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $refresh$
DECLARE
  v_uid uuid;
  v_role text;
  v_target uuid;
BEGIN
  v_uid := auth.uid();
  v_role := coalesce(auth.role(), '');

  IF v_uid IS NULL THEN
    IF v_role IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_user_id IS NULL THEN
      RAISE EXCEPTION 'p_user_id required';
    END IF;
    v_target := p_user_id;
  ELSE
    IF p_user_id IS NOT NULL AND p_user_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'not found' USING ERRCODE = '42501';
    END IF;
    v_target := v_uid;
  END IF;

  DELETE FROM public.journal_daily_metrics
  WHERE user_id = v_target;

  INSERT INTO public.journal_daily_metrics (
    user_id, metric_date, net_pnl, gross_pnl, fees,
    trade_count, wins, losses, breakevens, average_r, updated_at
  )
  SELECT
    v_target,
    coalesce(
      t.session_date,
      (coalesce(t.exit_date, t.entry_date) AT TIME ZONE coalesce(t.timezone, 'America/New_York'))::date
    ) AS metric_date,
    COALESCE(SUM(cr.net_pnl), 0),
    COALESCE(SUM(cr.gross_pnl), 0),
    COALESCE(SUM(cr.fees), 0),
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE cr.outcome = 'win')::integer,
    COUNT(*) FILTER (WHERE cr.outcome = 'loss')::integer,
    COUNT(*) FILTER (WHERE cr.outcome = 'breakeven')::integer,
    AVG(cr.r_multiple) FILTER (WHERE cr.r_multiple IS NOT NULL),
    now()
  FROM public.journal_trades t
  INNER JOIN public.journal_calculation_runs cr
    ON cr.trade_id = t.id
   AND cr.calculation_version = 'journal-calc.v1'
  WHERE t.user_id = v_target
    AND t.archived_at IS NULL
    AND coalesce(t.lifecycle_status, '') IS DISTINCT FROM 'archived'
    AND cr.state IS DISTINCT FROM 'unavailable'
    AND coalesce(cr.remaining_qty, 0) = 0
    AND coalesce((cr.result->>'closed_qty')::numeric, 0) > 0
    AND NOT coalesce(cr.result->'exclusions', '[]'::jsonb) ? 'excluded_from_analytics'
    AND NOT coalesce(cr.result->'exclusions', '[]'::jsonb) ? 'missing_executions'
  GROUP BY coalesce(
      t.session_date,
      (coalesce(t.exit_date, t.entry_date) AT TIME ZONE coalesce(t.timezone, 'America/New_York'))::date
    );

  PERFORM public.refresh_journal_stats(v_target);
END;
$refresh$;

-- ---------------------------------------------------------------------------
-- journal_backfill_accounts_and_executions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.journal_backfill_accounts_and_executions(p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_scope uuid;
  v_trade public.journal_trades%ROWTYPE;
  v_account_id uuid;
  v_open_action text;
  v_close_action text;
  v_open_at timestamptz;
  v_close_at timestamptz;
  v_accounts integer := 0;
  v_opens integer := 0;
  v_closes integer := 0;
  v_rows integer := 0;
BEGIN
  v_scope := COALESCE(p_user_id, auth.uid());

  FOR v_trade IN
    SELECT *
    FROM public.journal_trades
    WHERE (v_scope IS NULL OR user_id = v_scope)
  LOOP
    IF v_trade.account_id IS NULL THEN
      SELECT id INTO v_account_id
      FROM public.journal_accounts
      WHERE user_id = v_trade.user_id
        AND name = 'Primary Account'
      LIMIT 1;

      IF v_account_id IS NULL THEN
        INSERT INTO public.journal_accounts (user_id, name, base_currency, is_primary)
        VALUES (v_trade.user_id, 'Primary Account', 'USD', true)
        RETURNING id INTO v_account_id;
        v_accounts := v_accounts + 1;
      END IF;

      UPDATE public.journal_trades
      SET account_id = v_account_id,
          direction = COALESCE(
            direction,
            CASE WHEN lower(coalesce(side, '')) IN ('short', 'sell') THEN 'short' ELSE 'long' END
          ),
          asset_class = COALESCE(asset_class, 'stock'),
          instrument = COALESCE(instrument, symbol),
          timezone = COALESCE(timezone, 'America/New_York')
      WHERE id = v_trade.id;
    ELSE
      v_account_id := v_trade.account_id;
    END IF;

    v_open_action := CASE
      WHEN lower(coalesce(v_trade.direction, v_trade.side, '')) IN ('short', 'sell') THEN 'short'
      ELSE 'buy'
    END;
    v_close_action := CASE WHEN v_open_action = 'short' THEN 'cover' ELSE 'sell' END;
    v_open_at := v_trade.entry_date;
    v_close_at := v_trade.exit_date;

    INSERT INTO public.journal_executions (
      trade_id, occurred_at, occurred_at_utc, timezone, action,
      quantity, price, multiplier, source, idempotency_key
    ) VALUES (
      v_trade.id,
      v_open_at,
      v_open_at,
      coalesce(v_trade.timezone, 'America/New_York'),
      v_open_action,
      v_trade.qty,
      v_trade.entry_price,
      1,
      'synthetic_backfill',
      'synthetic-open:' || v_trade.id::text
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_opens := v_opens + v_rows;

    IF v_trade.exit_price IS NOT NULL AND v_close_at IS NOT NULL THEN
      INSERT INTO public.journal_executions (
        trade_id, occurred_at, occurred_at_utc, timezone, action,
        quantity, price, multiplier, source, idempotency_key
      ) VALUES (
        v_trade.id,
        v_close_at,
        v_close_at,
        coalesce(v_trade.timezone, 'America/New_York'),
        v_close_action,
        v_trade.qty,
        v_trade.exit_price,
        1,
        'synthetic_backfill',
        'synthetic-close:' || v_trade.id::text
      )
      ON CONFLICT (idempotency_key) DO NOTHING;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_closes := v_closes + v_rows;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'accounts_created', v_accounts,
    'opening_executions', v_opens,
    'closing_executions', v_closes
  );
END;
$fn$;

-- ---------------------------------------------------------------------------
-- journal_migrate_legacy_trades
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.journal_migrate_legacy_trades()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_inserted integer := 0;
BEGIN
  WITH src AS (
    SELECT t.*
    FROM public.trades t
    WHERE (auth.uid() IS NULL OR t.user_id = auth.uid())
      AND NOT EXISTS (
        SELECT 1
        FROM public.journal_trades j
        WHERE j.user_id = t.user_id
          AND j.symbol = t.symbol
          AND coalesce(j.session_date, (j.entry_date AT TIME ZONE 'America/New_York')::date) = t.entry_date
          AND j.qty = t.quantity
      )
  ),
  ins AS (
    INSERT INTO public.journal_trades (
      user_id, symbol, side, status, qty,
      entry_price, exit_price, entry_date, exit_date, session_date,
      setup_tag, return_dollars, source, demo_forbidden,
      direction, asset_class, instrument, timezone
    )
    SELECT
      s.user_id,
      s.symbol,
      s.side,
      COALESCE(s.status, 'open'),
      s.quantity,
      s.entry_price,
      s.exit_price,
      (s.entry_date::timestamp AT TIME ZONE 'America/New_York'),
      CASE
        WHEN s.exit_date IS NULL THEN NULL
        ELSE (s.exit_date::timestamp AT TIME ZONE 'America/New_York')
      END,
      s.entry_date,
      s.setup_type,
      s.pnl,
      'legacy_migrate',
      false,
      CASE WHEN lower(s.side) IN ('short', 'sell') THEN 'short' ELSE 'long' END,
      'stock',
      s.symbol,
      'America/New_York'
    FROM src s
    RETURNING id
  )
  SELECT COUNT(*) INTO v_inserted FROM ins;

  RETURN jsonb_build_object('inserted', v_inserted);
END;
$fn$;

-- ---------------------------------------------------------------------------
-- journal_import_rollback
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.journal_import_rollback(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_job public.journal_import_jobs%ROWTYPE;
  v_trades integer := 0;
  v_already boolean := false;
BEGIN
  IF p_job_id IS NULL THEN
    RAISE EXCEPTION 'p_job_id required';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Same not-found for missing jobs and jobs owned by another user.
  SELECT * INTO v_job
  FROM public.journal_import_jobs
  WHERE id = p_job_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'import job not found' USING ERRCODE = '42501';
  END IF;

  v_already := v_job.status = 'rolled_back';

  UPDATE public.journal_import_rows
  SET prior_trade_id = coalesce(prior_trade_id, created_trade_id),
      status = CASE WHEN status = 'imported' THEN 'rolled_back' ELSE status END,
      error_code = CASE WHEN status = 'imported' THEN 'rolled_back' ELSE error_code END
  WHERE import_job_id = p_job_id
    AND (
      status = 'imported'
      OR created_trade_id IS NOT NULL
    );

  -- Delete only this user's trades that belong to this import job.
  -- Children (plans, legs, executions, fees, calculation runs) cascade.
  -- Manual trades and other jobs are preserved. Job/row audit history is preserved.
  DELETE FROM public.journal_trades t
  WHERE t.user_id = auth.uid()
    AND t.import_job_id = p_job_id;
  GET DIAGNOSTICS v_trades = ROW_COUNT;

  UPDATE public.journal_import_jobs
  SET status = 'rolled_back',
      finished_at = coalesce(finished_at, now()),
      error_message = 'rolled back'
  WHERE id = p_job_id
    AND user_id = auth.uid();

  RETURN jsonb_build_object(
    'ok', true,
    'job_id', p_job_id,
    'trades_deleted', v_trades,
    'already_rolled_back', v_already AND v_trades = 0
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.journal_calculate_trade_v1(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.journal_calculate_trade_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.journal_refresh_derived(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.journal_refresh_derived(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.journal_backfill_accounts_and_executions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.journal_migrate_legacy_trades() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.journal_import_rollback(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- journal_save_trade_v1
-- One authenticated transaction for a complete Journal trade graph.
-- SECURITY INVOKER: RLS still applies. Owner is always auth.uid().
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.journal_save_trade_v1(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $save$
DECLARE
  v_uid uuid;
  v_trade jsonb;
  v_account jsonb;
  v_plan jsonb;
  v_calc jsonb;
  v_audit jsonb;
  v_lifecycle text;
  v_status text;
  v_setup text;
  v_source text;
  v_import_job_id uuid;
  v_trade_id uuid;
  v_account_id uuid;
  v_playbook_id uuid;
  v_owner uuid;
  v_is_update boolean := false;
  v_tz text;
  v_session date;
  v_entry_at timestamptz;
  v_exit_at timestamptz;
  v_playbook_name text;
  v_row record;
  v_exec jsonb;
  v_leg_id uuid;
  v_exec_id uuid;
  v_fee_id uuid;
  v_run_id uuid;
  v_sql_calc jsonb;
  v_exec_ids jsonb := '[]'::jsonb;
  v_leg_ids jsonb := '[]'::jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'p_payload required';
  END IF;

  -- Never trust a client-supplied user_id.
  v_trade := coalesce(p_payload->'trade', '{}'::jsonb);
  v_account := coalesce(p_payload->'account', '{}'::jsonb);
  v_plan := coalesce(p_payload->'plan', '{}'::jsonb);
  v_calc := coalesce(p_payload->'calculation', '{}'::jsonb);
  v_audit := coalesce(p_payload->'audit', '{}'::jsonb);

  v_source := coalesce(nullif(btrim(v_trade->>'source'), ''), 'manual');
  IF lower(v_source) IN ('demo', 'demo_workspace') THEN
    RAISE EXCEPTION 'demo workspace cannot persist trades';
  END IF;
  IF v_source NOT IN ('manual', 'import', 'legacy_migrate') THEN
    v_source := 'manual';
  END IF;
  IF coalesce(v_trade->>'id', '') ILIKE 'demo%' OR coalesce(v_trade->>'account_id', '') ILIKE 'demo%' THEN
    RAISE EXCEPTION 'demo workspace cannot persist trades';
  END IF;

  -- Import ownership is established from auth.uid(), never from a client user_id.
  v_import_job_id := NULL;
  IF v_source = 'import' THEN
    IF (v_trade->>'import_job_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT j.id INTO v_import_job_id
      FROM public.journal_import_jobs j
      WHERE j.id = (v_trade->>'import_job_id')::uuid
        AND j.user_id = v_uid;
    END IF;
    IF v_import_job_id IS NULL THEN
      RAISE EXCEPTION 'import job not found' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_trade->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_trade_id := (v_trade->>'id')::uuid;
  ELSE
    v_trade_id := gen_random_uuid();
  END IF;

  SELECT user_id INTO v_owner
  FROM public.journal_trades
  WHERE id = v_trade_id;
  IF FOUND THEN
    IF v_owner IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'trade not found' USING ERRCODE = '42501';
    END IF;
    v_is_update := true;
  END IF;

  v_account_id := NULL;
  IF (v_account->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT id INTO v_account_id
    FROM public.journal_accounts
    WHERE id = (v_account->>'id')::uuid
      AND user_id = v_uid;
  END IF;
  IF v_account_id IS NULL AND (v_trade->>'account_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT id INTO v_account_id
    FROM public.journal_accounts
    WHERE id = (v_trade->>'account_id')::uuid
      AND user_id = v_uid;
  END IF;
  IF v_account_id IS NULL THEN
    SELECT id INTO v_account_id
    FROM public.journal_accounts
    WHERE user_id = v_uid
      AND is_primary = true
    ORDER BY created_at
    LIMIT 1;
  END IF;
  IF v_account_id IS NULL THEN
    SELECT id INTO v_account_id
    FROM public.journal_accounts
    WHERE user_id = v_uid
      AND name = coalesce(nullif(btrim(v_account->>'name'), ''), 'Primary Account')
    LIMIT 1;
  END IF;
  IF v_account_id IS NULL THEN
    INSERT INTO public.journal_accounts (user_id, name, base_currency, is_primary)
    VALUES (v_uid, coalesce(nullif(btrim(v_account->>'name'), ''), 'Primary Account'), 'USD', true)
    RETURNING id INTO v_account_id;
  END IF;

  v_playbook_id := NULL;
  IF (v_trade->>'playbook_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT id INTO v_playbook_id
    FROM public.journal_playbooks
    WHERE id = (v_trade->>'playbook_id')::uuid
      AND user_id = v_uid;
  END IF;
  v_playbook_name := nullif(btrim(coalesce(v_trade->>'playbook_name', '')), '');
  IF v_playbook_id IS NULL AND v_playbook_name IS NOT NULL THEN
    INSERT INTO public.journal_playbooks (user_id, name)
    VALUES (v_uid, v_playbook_name)
    ON CONFLICT (user_id, name) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_playbook_id;
  END IF;

  v_lifecycle := coalesce(
    nullif(btrim(p_payload->'lifecycle'->>'status'), ''),
    nullif(btrim(v_trade->>'lifecycle_status'), ''),
    nullif(btrim(v_trade->>'status'), ''),
    'open'
  );
  v_status := lower(coalesce(nullif(btrim(v_trade->>'status'), ''), 'open'));
  IF v_status NOT IN ('open', 'closed') THEN
    v_status := CASE
      WHEN v_lifecycle IN (
        'closed', 'closed_before_expiration', 'expired', 'assigned', 'exercised',
        'rolled', 'expired_itm', 'expired_worthless', 'archived', 'cancelled'
      ) AND coalesce(v_trade->>'exit_date', '') <> '' THEN 'closed'
      ELSE 'open'
    END;
  END IF;

  v_setup := nullif(btrim(coalesce(v_trade->>'setup_tag', '')), '');
  IF v_setup IS NOT NULL AND v_setup NOT IN (
    'flat_top_breakout', 'bottom_bouncer', 'flat_base_breakout', 'breakout_pullback', 'other'
  ) THEN
    v_setup := NULL;
  END IF;

  v_tz := coalesce(nullif(btrim(v_trade->>'timezone'), ''), 'America/New_York');
  v_entry_at := coalesce((v_trade->>'entry_date')::timestamptz, now());
  v_exit_at := (v_trade->>'exit_date')::timestamptz;
  IF v_trade->>'session_date' ~ '^\d{4}-\d{2}-\d{2}$' THEN
    v_session := (v_trade->>'session_date')::date;
  ELSE
    v_session := (v_entry_at AT TIME ZONE v_tz)::date;
  END IF;

  IF v_is_update THEN
    UPDATE public.journal_trades SET
      symbol = coalesce(nullif(btrim(v_trade->>'symbol'), ''), symbol),
      side = coalesce(nullif(btrim(v_trade->>'side'), ''), side),
      status = v_status,
      qty = coalesce((v_trade->>'qty')::numeric, qty),
      entry_price = coalesce((v_trade->>'entry_price')::numeric, entry_price),
      exit_price = (v_trade->>'exit_price')::numeric,
      entry_date = v_entry_at,
      exit_date = v_exit_at,
      session_date = v_session,
      target_price = (v_trade->>'target_price')::numeric,
      stop_price = (v_trade->>'stop_price')::numeric,
      setup_tag = v_setup,
      return_dollars = (v_trade->>'return_dollars')::numeric,
      return_pct = (v_trade->>'return_pct')::numeric,
      hold_duration_minutes = (v_trade->>'hold_duration_minutes')::integer,
      account_id = v_account_id,
      asset_class = nullif(btrim(v_trade->>'asset_class'), ''),
      instrument = nullif(btrim(v_trade->>'instrument'), ''),
      direction = coalesce(nullif(btrim(v_trade->>'direction'), ''), nullif(btrim(v_trade->>'side'), '')),
      lifecycle_status = v_lifecycle,
      playbook_id = v_playbook_id,
      timezone = v_tz,
      planned_risk = (v_trade->>'planned_risk')::numeric,
      planned_entry = (v_trade->>'planned_entry')::numeric,
      planned_stop = (v_trade->>'planned_stop')::numeric,
      planned_target = (v_trade->>'planned_target')::numeric,
      planned_size = (v_trade->>'planned_size')::numeric,
      thesis = v_trade->>'thesis',
      reviewed_at = (v_trade->>'reviewed_at')::timestamptz,
      calculation_version = coalesce(nullif(btrim(v_trade->>'calculation_version'), ''), 'journal-calc.v1'),
      source = v_source,
      import_job_id = v_import_job_id,
      updated_at = now()
    WHERE id = v_trade_id
      AND user_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'trade not found' USING ERRCODE = '42501';
    END IF;
    DELETE FROM public.journal_executions WHERE trade_id = v_trade_id;
    DELETE FROM public.journal_trade_legs WHERE trade_id = v_trade_id;
  ELSE
    INSERT INTO public.journal_trades (
      id, user_id, symbol, side, status, qty, entry_price, exit_price,
      entry_date, exit_date, session_date, target_price, stop_price, setup_tag,
      return_dollars, return_pct, hold_duration_minutes, account_id, asset_class,
      instrument, direction, lifecycle_status, playbook_id, timezone,
      planned_risk, planned_entry, planned_stop, planned_target, planned_size,
      thesis, reviewed_at, calculation_version, source, import_job_id, demo_forbidden
    ) VALUES (
      v_trade_id,
      v_uid,
      coalesce(nullif(btrim(v_trade->>'symbol'), ''), 'UNKNOWN'),
      coalesce(nullif(btrim(v_trade->>'side'), ''), 'long'),
      v_status,
      coalesce((v_trade->>'qty')::numeric, 0),
      coalesce((v_trade->>'entry_price')::numeric, 0),
      (v_trade->>'exit_price')::numeric,
      v_entry_at,
      v_exit_at,
      v_session,
      (v_trade->>'target_price')::numeric,
      (v_trade->>'stop_price')::numeric,
      v_setup,
      (v_trade->>'return_dollars')::numeric,
      (v_trade->>'return_pct')::numeric,
      (v_trade->>'hold_duration_minutes')::integer,
      v_account_id,
      nullif(btrim(v_trade->>'asset_class'), ''),
      nullif(btrim(v_trade->>'instrument'), ''),
      coalesce(nullif(btrim(v_trade->>'direction'), ''), nullif(btrim(v_trade->>'side'), ''), 'long'),
      v_lifecycle,
      v_playbook_id,
      v_tz,
      (v_trade->>'planned_risk')::numeric,
      (v_trade->>'planned_entry')::numeric,
      (v_trade->>'planned_stop')::numeric,
      (v_trade->>'planned_target')::numeric,
      (v_trade->>'planned_size')::numeric,
      v_trade->>'thesis',
      (v_trade->>'reviewed_at')::timestamptz,
      coalesce(nullif(btrim(v_trade->>'calculation_version'), ''), 'journal-calc.v1'),
      v_source,
      v_import_job_id,
      false
    );
  END IF;

  INSERT INTO public.journal_trade_plans (
    user_id, trade_id, planned_entry, planned_stop, planned_target,
    planned_size, planned_risk, thesis, updated_at
  ) VALUES (
    v_uid,
    v_trade_id,
    coalesce((v_plan->>'planned_entry')::numeric, (v_trade->>'planned_entry')::numeric),
    coalesce((v_plan->>'planned_stop')::numeric, (v_trade->>'planned_stop')::numeric),
    coalesce((v_plan->>'planned_target')::numeric, (v_trade->>'planned_target')::numeric),
    coalesce((v_plan->>'planned_size')::numeric, (v_trade->>'planned_size')::numeric),
    coalesce((v_plan->>'planned_risk')::numeric, (v_trade->>'planned_risk')::numeric),
    coalesce(v_plan->>'thesis', v_trade->>'thesis'),
    now()
  )
  ON CONFLICT (trade_id) DO UPDATE SET
    planned_entry = EXCLUDED.planned_entry,
    planned_stop = EXCLUDED.planned_stop,
    planned_target = EXCLUDED.planned_target,
    planned_size = EXCLUDED.planned_size,
    planned_risk = EXCLUDED.planned_risk,
    thesis = EXCLUDED.thesis,
    updated_at = now();

  FOR v_row IN
    SELECT value AS elem, ordinality
    FROM jsonb_array_elements(coalesce(p_payload->'legs', '[]'::jsonb)) WITH ORDINALITY AS t(value, ordinality)
  LOOP
    IF (v_row.elem->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_leg_id := (v_row.elem->>'id')::uuid;
    ELSE
      v_leg_id := gen_random_uuid();
    END IF;
    INSERT INTO public.journal_trade_legs (
      id, trade_id, action, "right", strike, expiration, contracts, multiplier, occ_symbol, status, sequence_index
    ) VALUES (
      v_leg_id,
      v_trade_id,
      coalesce(nullif(btrim(v_row.elem->>'action'), ''), 'buy'),
      v_row.elem->>'right',
      (v_row.elem->>'strike')::numeric,
      nullif(v_row.elem->>'expiration', '')::date,
      (v_row.elem->>'contracts')::numeric,
      coalesce((v_row.elem->>'multiplier')::numeric, 100),
      v_row.elem->>'occ_symbol',
      coalesce(nullif(btrim(v_row.elem->>'status'), ''), 'open'),
      coalesce((v_row.elem->>'sequence_index')::integer, (v_row.ordinality - 1)::integer)
    );
    v_leg_ids := v_leg_ids || jsonb_build_array(v_leg_id);
  END LOOP;

  FOR v_row IN
    SELECT value AS elem, ordinality
    FROM jsonb_array_elements(coalesce(p_payload->'executions', '[]'::jsonb)) WITH ORDINALITY AS t(value, ordinality)
  LOOP
    v_exec := v_row.elem;
    IF (v_exec->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_exec_id := (v_exec->>'id')::uuid;
    ELSE
      v_exec_id := gen_random_uuid();
    END IF;
    v_leg_id := NULL;
    IF (v_exec->>'leg_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT id INTO v_leg_id
      FROM public.journal_trade_legs
      WHERE id = (v_exec->>'leg_id')::uuid
        AND trade_id = v_trade_id;
    END IF;
    INSERT INTO public.journal_executions (
      id, trade_id, occurred_at, occurred_at_utc, timezone, action,
      quantity, price, multiplier, commission, regulatory_fee, other_fee,
      fee_currency, venue, order_type, source, external_execution_id,
      idempotency_key, import_job_id, note, leg_id, sequence_index
    ) VALUES (
      v_exec_id,
      v_trade_id,
      coalesce((v_exec->>'occurred_at')::timestamptz, (v_exec->>'occurred_at_utc')::timestamptz, v_entry_at),
      coalesce((v_exec->>'occurred_at_utc')::timestamptz, (v_exec->>'occurred_at')::timestamptz, v_entry_at),
      coalesce(nullif(btrim(v_exec->>'timezone'), ''), v_tz),
      coalesce(nullif(btrim(v_exec->>'action'), ''), 'buy'),
      coalesce((v_exec->>'quantity')::numeric, 0),
      coalesce((v_exec->>'price')::numeric, 0),
      coalesce((v_exec->>'multiplier')::numeric, 1),
      coalesce((v_exec->>'commission')::numeric, 0),
      coalesce((v_exec->>'regulatory_fee')::numeric, 0),
      coalesce((v_exec->>'other_fee')::numeric, 0),
      coalesce(nullif(btrim(v_exec->>'fee_currency'), ''), 'USD'),
      v_exec->>'venue',
      v_exec->>'order_type',
      CASE WHEN v_import_job_id IS NOT NULL THEN 'import' ELSE v_exec->>'source' END,
      v_exec->>'external_execution_id',
      nullif(btrim(coalesce(v_exec->>'idempotency_key', '')), ''),
      CASE
        WHEN v_import_job_id IS NOT NULL THEN v_import_job_id
        WHEN (v_exec->>'import_job_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (v_exec->>'import_job_id')::uuid
        ELSE NULL
      END,
      v_exec->>'note',
      v_leg_id,
      coalesce((v_exec->>'sequence_index')::integer, (v_row.ordinality - 1)::integer)
    );
    v_exec_ids := v_exec_ids || jsonb_build_array(v_exec_id);

    FOR v_row IN
      SELECT value AS elem
      FROM jsonb_array_elements(coalesce(v_exec->'fees', '[]'::jsonb)) AS t(value)
    LOOP
      v_fee_id := gen_random_uuid();
      INSERT INTO public.journal_execution_fees (
        id, execution_id, kind, amount, currency, native_amount, native_currency,
        conversion_rate, conversion_timestamp, conversion_source, account_currency_amount
      ) VALUES (
        v_fee_id,
        v_exec_id,
        coalesce(nullif(btrim(v_row.elem->>'kind'), ''), 'other'),
        coalesce((v_row.elem->>'amount')::numeric, 0),
        coalesce(nullif(btrim(v_row.elem->>'currency'), ''), 'USD'),
        (v_row.elem->>'native_amount')::numeric,
        v_row.elem->>'native_currency',
        (v_row.elem->>'conversion_rate')::numeric,
        (v_row.elem->>'conversion_timestamp')::timestamptz,
        v_row.elem->>'conversion_source',
        coalesce((v_row.elem->>'account_currency_amount')::numeric, (v_row.elem->>'amount')::numeric)
      );
    END LOOP;
  END LOOP;

  -- Authoritative SQL calculation. Over-exit raises and rolls back this transaction.
  -- Client-supplied calculation numbers are audit evidence only, never the write path.
  v_sql_calc := public.journal_calculate_trade_v1(v_trade_id);
  v_run_id := (v_sql_calc->>'calculation_run_id')::uuid;

  DELETE FROM public.journal_calculation_lineage WHERE calculation_run_id = v_run_id;
  INSERT INTO public.journal_calculation_lineage (
    calculation_run_id, input_hash, observations, exclusions
  ) VALUES (
    v_run_id,
    v_audit->>'timestamp',
    coalesce(v_audit->'observations', '[]'::jsonb),
    coalesce(
      ARRAY(SELECT jsonb_array_elements_text(coalesce(v_audit->'exclusions', '[]'::jsonb))),
      '{}'::text[]
    )
  );

  INSERT INTO public.journal_audit_log (
    user_id, actor_id, action, entity_type, entity_id, before_data, after_data
  ) VALUES (
    v_uid,
    v_uid,
    CASE WHEN v_is_update THEN 'journal_trade_update' ELSE 'journal_trade_save' END,
    'journal_trades',
    v_trade_id,
    NULL,
    jsonb_build_object(
      'trade_id', v_trade_id,
      'lifecycle', v_lifecycle,
      'audit', v_audit,
      'calculation', v_calc
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'trade_id', v_trade_id,
    'account_id', v_account_id,
    'playbook_id', v_playbook_id,
    'execution_ids', v_exec_ids,
    'leg_ids', v_leg_ids,
    'calculation_run_id', v_run_id
  );
END;
$save$;

REVOKE ALL ON FUNCTION public.journal_save_trade_v1(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.journal_save_trade_v1(jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- journal_import_start_v1
-- Creates a user-owned import job and one audit row per parsed CSV row.
-- Owner is always auth.uid(). Client-supplied user_id is ignored.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.journal_import_start_v1(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $start$
DECLARE
  v_uid uuid;
  v_job_id uuid;
  v_source text;
  v_filename text;
  v_row jsonb;
  v_status text;
  v_identity text;
  v_row_id uuid;
  v_rows jsonb := '[]'::jsonb;
  v_idx integer := 0;
  v_seen text[] := ARRAY[]::text[];
  v_exists boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'p_payload required';
  END IF;

  -- Never trust a client-supplied user_id.
  v_source := lower(coalesce(nullif(btrim(p_payload->>'source'), ''), 'csv'));
  IF v_source IN ('demo', 'demo_workspace') THEN
    RAISE EXCEPTION 'demo workspace cannot persist trades';
  END IF;
  v_filename := left(coalesce(nullif(btrim(p_payload->>'filename'), ''), 'import.csv'), 512);

  INSERT INTO public.journal_import_jobs (
    user_id, source, filename, status, started_at, total_count
  ) VALUES (
    v_uid,
    v_source,
    v_filename,
    'processing',
    now(),
    coalesce(jsonb_array_length(p_payload->'rows'), 0)
  )
  RETURNING id INTO v_job_id;

  FOR v_row IN
    SELECT value FROM jsonb_array_elements(coalesce(p_payload->'rows', '[]'::jsonb))
  LOOP
    v_idx := v_idx + 1;
    v_identity := nullif(btrim(coalesce(v_row->>'identity_key', '')), '');
    v_status := lower(coalesce(nullif(btrim(v_row->>'status'), ''), 'pending'));
    IF v_status NOT IN ('pending', 'invalid', 'duplicate') THEN
      v_status := 'pending';
    END IF;

    IF v_identity IS NOT NULL THEN
      IF v_identity = ANY (v_seen) THEN
        v_status := 'duplicate';
      ELSE
        v_seen := array_append(v_seen, v_identity);
      END IF;
      SELECT EXISTS (
        SELECT 1
        FROM public.journal_import_rows r
        JOIN public.journal_import_jobs j ON j.id = r.import_job_id
        WHERE r.identity_key = v_identity
          AND r.status = 'imported'
          AND j.user_id = v_uid
      ) INTO v_exists;
      IF v_exists THEN
        v_status := 'duplicate';
      END IF;
    END IF;

    INSERT INTO public.journal_import_rows (
      import_job_id, row_index, raw, parsed, status, error_message, error_code,
      external_id, identity_key
    ) VALUES (
      v_job_id,
      coalesce((v_row->>'row_index')::integer, v_idx),
      coalesce(v_row->'raw', '{}'::jsonb),
      v_row->'parsed',
      v_status,
      CASE
        WHEN v_status = 'invalid' THEN left(coalesce(nullif(btrim(v_row->>'error_message'), ''), 'invalid row'), 200)
        WHEN v_status = 'duplicate' THEN 'duplicate'
        ELSE NULL
      END,
      CASE
        WHEN v_status = 'invalid' THEN left(coalesce(nullif(btrim(v_row->>'error_code'), ''), 'invalid'), 64)
        WHEN v_status = 'duplicate' THEN 'duplicate'
        ELSE NULL
      END,
      nullif(btrim(coalesce(v_row->>'external_id', '')), ''),
      v_identity
    )
    RETURNING id INTO v_row_id;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'id', v_row_id,
      'row_index', coalesce((v_row->>'row_index')::integer, v_idx),
      'status', v_status,
      'identity_key', v_identity
    ));
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'job_id', v_job_id, 'rows', v_rows);
END;
$start$;

REVOKE ALL ON FUNCTION public.journal_import_start_v1(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.journal_import_start_v1(jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- journal_import_row_v1
-- Atomic per-row import. A failed graph save rolls back that trade only.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.journal_import_row_v1(
  p_job_id uuid,
  p_row_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $row$
DECLARE
  v_uid uuid;
  v_job public.journal_import_jobs%ROWTYPE;
  v_imp public.journal_import_rows%ROWTYPE;
  v_payload jsonb;
  v_execs jsonb;
  v_save jsonb;
  v_trade_id uuid;
  v_exists boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_job_id IS NULL OR p_row_id IS NULL THEN
    RAISE EXCEPTION 'import job not found' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_job
  FROM public.journal_import_jobs
  WHERE id = p_job_id
    AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'import job not found' USING ERRCODE = '42501';
  END IF;
  IF v_job.status IN ('rolled_back') THEN
    RAISE EXCEPTION 'import job not found' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_imp
  FROM public.journal_import_rows
  WHERE id = p_row_id
    AND import_job_id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'import job not found' USING ERRCODE = '42501';
  END IF;

  IF v_imp.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', v_imp.status,
      'trade_id', v_imp.created_trade_id,
      'skipped', true
    );
  END IF;

  IF p_payload IS NULL
     OR jsonb_typeof(p_payload) <> 'object'
     OR coalesce(p_payload->'trade'->>'id', '') ILIKE 'demo%'
     OR coalesce(p_payload->'trade'->>'account_id', '') ILIKE 'demo%'
     OR lower(coalesce(p_payload->'trade'->>'source', '')) IN ('demo', 'demo_workspace') THEN
    UPDATE public.journal_import_rows
    SET status = 'failed',
        error_code = 'demo_forbidden',
        error_message = 'Trade could not be saved.'
    WHERE id = p_row_id
      AND import_job_id = p_job_id;
    RETURN jsonb_build_object(
      'ok', false,
      'status', 'failed',
      'error_code', 'demo_forbidden',
      'error_message', 'Trade could not be saved.'
    );
  END IF;

  IF v_imp.identity_key IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.journal_import_rows r
      JOIN public.journal_import_jobs j ON j.id = r.import_job_id
      WHERE r.identity_key = v_imp.identity_key
        AND r.status = 'imported'
        AND j.user_id = v_uid
        AND r.id IS DISTINCT FROM p_row_id
    ) INTO v_exists;
    IF v_exists THEN
      UPDATE public.journal_import_rows
      SET status = 'duplicate',
          error_code = 'duplicate',
          error_message = 'duplicate'
      WHERE id = p_row_id
        AND import_job_id = p_job_id;
      RETURN jsonb_build_object('ok', true, 'status', 'duplicate', 'skipped', true);
    END IF;
  END IF;

  v_payload := p_payload;
  v_payload := jsonb_set(v_payload, '{trade,source}', to_jsonb('import'::text), true);
  v_payload := jsonb_set(v_payload, '{trade,import_job_id}', to_jsonb(p_job_id::text), true);
  IF jsonb_typeof(v_payload->'executions') = 'array' THEN
    SELECT jsonb_agg(
      jsonb_set(
        jsonb_set(elem, '{source}', to_jsonb('import'::text), true),
        '{import_job_id}', to_jsonb(p_job_id::text), true
      )
    )
    INTO v_execs
    FROM jsonb_array_elements(v_payload->'executions') AS t(elem);
    v_payload := jsonb_set(v_payload, '{executions}', coalesce(v_execs, '[]'::jsonb));
  END IF;

  BEGIN
    v_save := public.journal_save_trade_v1(v_payload);
    IF coalesce(v_save->>'ok', 'false') <> 'true' OR coalesce(v_save->>'trade_id', '') = '' THEN
      RAISE EXCEPTION 'save unconfirmed';
    END IF;
    v_trade_id := (v_save->>'trade_id')::uuid;
    UPDATE public.journal_import_rows
    SET status = 'imported',
        created_trade_id = v_trade_id,
        error_code = NULL,
        error_message = NULL
    WHERE id = p_row_id
      AND import_job_id = p_job_id;
    RETURN jsonb_build_object('ok', true, 'status', 'imported', 'trade_id', v_trade_id);
  EXCEPTION
    WHEN unique_violation THEN
      UPDATE public.journal_import_rows
      SET status = 'duplicate',
          error_code = 'duplicate',
          error_message = 'duplicate'
      WHERE id = p_row_id
        AND import_job_id = p_job_id;
      RETURN jsonb_build_object('ok', true, 'status', 'duplicate', 'skipped', true);
    WHEN OTHERS THEN
      -- Subtransaction rolls back the trade graph. Sanitized reason only.
      UPDATE public.journal_import_rows
      SET status = 'failed',
          error_code = 'save_failed',
          error_message = 'Trade could not be saved.'
      WHERE id = p_row_id
        AND import_job_id = p_job_id;
      RETURN jsonb_build_object(
        'ok', false,
        'status', 'failed',
        'error_code', 'save_failed',
        'error_message', 'Trade could not be saved.'
      );
  END;
END;
$row$;

REVOKE ALL ON FUNCTION public.journal_import_row_v1(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.journal_import_row_v1(uuid, uuid, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- journal_import_finalize_v1
-- Database-derived counts from row statuses. Client loop counters are ignored.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.journal_import_finalize_v1(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $fin$
DECLARE
  v_uid uuid;
  v_total integer := 0;
  v_imported integer := 0;
  v_failed integer := 0;
  v_invalid integer := 0;
  v_duplicate integer := 0;
  v_pending integer := 0;
  v_valid integer := 0;
  v_status text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_job_id IS NULL THEN
    RAISE EXCEPTION 'import job not found' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.journal_import_jobs
    WHERE id = p_job_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'import job not found' USING ERRCODE = '42501';
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE status = 'imported')::integer,
    count(*) FILTER (WHERE status = 'failed')::integer,
    count(*) FILTER (WHERE status = 'invalid')::integer,
    count(*) FILTER (WHERE status = 'duplicate')::integer,
    count(*) FILTER (WHERE status = 'pending')::integer
  INTO v_total, v_imported, v_failed, v_invalid, v_duplicate, v_pending
  FROM public.journal_import_rows
  WHERE import_job_id = p_job_id;

  v_valid := v_imported + v_failed + v_pending;

  IF v_imported > 0 AND v_failed = 0 AND v_invalid = 0 AND v_pending = 0 THEN
    v_status := 'completed';
  ELSIF v_imported = 0 AND v_failed > 0 THEN
    v_status := 'failed';
  ELSIF v_imported = 0 AND v_pending > 0 THEN
    v_status := 'failed';
  ELSIF v_failed > 0 OR v_invalid > 0 THEN
    v_status := 'completed_with_errors';
  ELSE
    v_status := 'completed';
  END IF;

  UPDATE public.journal_import_jobs
  SET status = v_status,
      total_count = v_total,
      row_count = v_total,
      valid_count = v_valid,
      imported_count = v_imported,
      failed_count = v_failed,
      invalid_count = v_invalid,
      duplicate_count = v_duplicate,
      finished_at = now()
  WHERE id = p_job_id
    AND user_id = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'job_id', p_job_id,
    'status', v_status,
    'total_count', v_total,
    'imported_count', v_imported,
    'failed_count', v_failed,
    'invalid_count', v_invalid,
    'duplicate_count', v_duplicate
  );
END;
$fin$;

REVOKE ALL ON FUNCTION public.journal_import_finalize_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.journal_import_finalize_v1(uuid) TO authenticated, service_role;

-- Idempotent legacy backfill for journal_trades that existed before this
-- migration. auth.uid() is null during migrate, so a null argument scopes
-- every user. Generated executions are marked synthetic_backfill.
DO $$
BEGIN
  PERFORM public.journal_backfill_accounts_and_executions(NULL);
END;
$$;
