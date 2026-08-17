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
    ('r_multiple', 'net_pnl / nullif(planned_risk, 0)'),
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
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.journal_calculate_trade_v1(p_trade_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_trade public.journal_trades%ROWTYPE;
  v_exec public.journal_executions%ROWTYPE;
  v_direction text;
  v_is_open boolean;
  v_open_qty numeric := 0;
  v_close_qty numeric := 0;
  v_open_px_qty numeric := 0;
  v_close_px_qty numeric := 0;
  v_mult numeric := 1;
  v_fees numeric := 0;
  v_fee_row numeric := 0;
  v_avg_entry numeric;
  v_avg_exit numeric;
  v_remaining numeric := 0;
  v_gross numeric := 0;
  v_net numeric := 0;
  v_hold integer;
  v_return_pct numeric;
  v_first_open timestamptz;
  v_last_close timestamptz;
  v_run_id uuid;
  v_state text := 'authoritative';
BEGIN
  IF p_trade_id IS NULL THEN
    RAISE EXCEPTION 'p_trade_id required';
  END IF;

  SELECT * INTO v_trade
  FROM public.journal_trades
  WHERE id = p_trade_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade not found';
  END IF;

  v_direction := COALESCE(
    v_trade.direction,
    CASE WHEN lower(coalesce(v_trade.side, '')) IN ('short', 'sell') THEN 'short' ELSE 'long' END
  );

  FOR v_exec IN
    SELECT *
    FROM public.journal_executions
    WHERE trade_id = p_trade_id
    ORDER BY coalesce(occurred_at_utc, occurred_at, created_at)
  LOOP
    v_mult := COALESCE(NULLIF(v_exec.multiplier, 0), 1);

    SELECT COALESCE(SUM(COALESCE(account_currency_amount, amount)), 0)
      INTO v_fee_row
    FROM public.journal_execution_fees
    WHERE execution_id = v_exec.id;

    v_fees := v_fees
      + COALESCE(v_fee_row, 0)
      + COALESCE(v_exec.commission, 0)
      + COALESCE(v_exec.regulatory_fee, 0)
      + COALESCE(v_exec.other_fee, 0);

    v_is_open := CASE
      WHEN v_direction = 'short' THEN lower(v_exec.action) IN ('short', 'sell')
      ELSE lower(v_exec.action) IN ('buy')
    END;

    IF v_is_open THEN
      v_open_qty := v_open_qty + v_exec.quantity;
      v_open_px_qty := v_open_px_qty + (v_exec.price * v_exec.quantity);
      v_first_open := COALESCE(v_first_open, coalesce(v_exec.occurred_at_utc, v_exec.occurred_at));
    ELSE
      v_close_qty := v_close_qty + v_exec.quantity;
      v_close_px_qty := v_close_px_qty + (v_exec.price * v_exec.quantity);
      v_last_close := coalesce(v_exec.occurred_at_utc, v_exec.occurred_at);
    END IF;
  END LOOP;

  IF v_open_qty = 0 AND v_close_qty = 0 THEN
    v_open_qty := COALESCE(v_trade.qty, 0);
    v_open_px_qty := COALESCE(v_trade.entry_price, 0) * v_open_qty;
    IF v_trade.exit_price IS NOT NULL THEN
      v_close_qty := v_open_qty;
      v_close_px_qty := v_trade.exit_price * v_close_qty;
    END IF;
    v_state := CASE WHEN v_open_qty = 0 THEN 'unavailable' ELSE 'estimated' END;
  END IF;

  v_remaining := v_open_qty - v_close_qty;
  IF v_remaining < 0 THEN
    v_remaining := 0;
  END IF;

  IF v_open_qty > 0 THEN
    v_avg_entry := v_open_px_qty / v_open_qty;
  END IF;
  IF v_close_qty > 0 THEN
    v_avg_exit := v_close_px_qty / v_close_qty;
  END IF;

  IF v_avg_entry IS NOT NULL AND v_avg_exit IS NOT NULL AND v_close_qty > 0 THEN
    IF v_direction = 'short' THEN
      v_gross := (v_avg_entry - v_avg_exit) * v_close_qty * v_mult;
    ELSE
      v_gross := (v_avg_exit - v_avg_entry) * v_close_qty * v_mult;
    END IF;
  END IF;

  v_net := v_gross - v_fees;

  IF v_first_open IS NOT NULL AND v_last_close IS NOT NULL THEN
    v_hold := GREATEST(
      0,
      ROUND((EXTRACT(EPOCH FROM (v_last_close - v_first_open))::numeric) / 60)::integer
    );
  ELSIF v_trade.entry_date IS NOT NULL AND v_trade.exit_date IS NOT NULL THEN
    v_hold := GREATEST(0, (v_trade.exit_date - v_trade.entry_date) * 24 * 60);
  ELSE
    v_hold := v_trade.hold_duration_minutes;
  END IF;

  IF v_avg_entry IS NOT NULL AND v_avg_entry <> 0 AND v_close_qty > 0 THEN
    v_return_pct := v_net / (v_avg_entry * v_close_qty * v_mult);
  ELSE
    v_return_pct := v_trade.return_pct;
  END IF;

  UPDATE public.journal_trades
  SET
    return_dollars = v_net,
    return_pct = v_return_pct,
    hold_duration_minutes = v_hold,
    calculation_version = 'journal-calc.v1',
    is_wash = CASE
      WHEN v_close_qty > 0 AND abs(v_net) < 0.01 THEN true
      ELSE is_wash
    END,
    direction = COALESCE(direction, v_direction),
    updated_at = now()
  WHERE id = p_trade_id;

  INSERT INTO public.journal_calculation_runs (
    user_id, trade_id, calculation_version, input_version, state, result,
    gross_pnl, net_pnl, fees, remaining_qty, weighted_avg_entry, weighted_avg_exit
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
      'open_qty', v_open_qty,
      'close_qty', v_close_qty,
      'direction', v_direction
    ),
    v_gross, v_net, v_fees, v_remaining, v_avg_entry, v_avg_exit
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
    weighted_avg_exit = EXCLUDED.weighted_avg_exit
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
    'state', v_state
  );
END;
$fn$;

-- ---------------------------------------------------------------------------
-- journal_refresh_derived
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.journal_refresh_derived(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id required';
  END IF;

  DELETE FROM public.journal_daily_metrics
  WHERE user_id = p_user_id;

  INSERT INTO public.journal_daily_metrics (
    user_id, metric_date, net_pnl, gross_pnl, fees,
    trade_count, wins, losses, breakevens, average_r, updated_at
  )
  SELECT
    p_user_id,
    coalesce(t.exit_date, t.entry_date) AS metric_date,
    COALESCE(SUM(t.return_dollars), 0),
    COALESCE(SUM(COALESCE(cr.gross_pnl, t.return_dollars)), 0),
    COALESCE(SUM(COALESCE(cr.fees, 0)), 0),
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE t.return_dollars > 0 AND coalesce(t.is_wash, false) = false)::integer,
    COUNT(*) FILTER (WHERE t.return_dollars < 0 AND coalesce(t.is_wash, false) = false)::integer,
    COUNT(*) FILTER (
      WHERE coalesce(t.is_wash, false) = true
         OR t.return_dollars = 0
    )::integer,
    AVG(
      CASE
        WHEN t.planned_risk IS NOT NULL AND t.planned_risk <> 0
          THEN t.return_dollars / t.planned_risk
        ELSE NULL
      END
    ),
    now()
  FROM public.journal_trades t
  LEFT JOIN public.journal_calculation_runs cr
    ON cr.trade_id = t.id AND cr.calculation_version = 'journal-calc.v1'
  WHERE t.user_id = p_user_id
    AND t.status = 'closed'
    AND t.archived_at IS NULL
  GROUP BY coalesce(t.exit_date, t.entry_date);

  PERFORM public.refresh_journal_stats(p_user_id);
END;
$fn$;

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
    v_open_at := (v_trade.entry_date::timestamp AT TIME ZONE coalesce(v_trade.timezone, 'America/New_York'));
    v_close_at := CASE
      WHEN v_trade.exit_date IS NULL THEN NULL
      ELSE (v_trade.exit_date::timestamp AT TIME ZONE coalesce(v_trade.timezone, 'America/New_York'))
    END;

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
          AND j.entry_date = t.entry_date
          AND j.qty = t.quantity
      )
  ),
  ins AS (
    INSERT INTO public.journal_trades (
      user_id, symbol, side, status, qty,
      entry_price, exit_price, entry_date, exit_date,
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
      s.entry_date,
      s.exit_date,
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
  v_execs integer := 0;
  v_trades integer := 0;
BEGIN
  IF p_job_id IS NULL THEN
    RAISE EXCEPTION 'p_job_id required';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_job
  FROM public.journal_import_jobs
  WHERE id = p_job_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'import job not found';
  END IF;

  DELETE FROM public.journal_executions e
  WHERE (
      e.import_job_id = p_job_id
      OR e.id IN (
        SELECT r.created_execution_id
        FROM public.journal_import_rows r
        WHERE r.import_job_id = p_job_id
          AND r.created_execution_id IS NOT NULL
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.journal_trades t
      WHERE t.id = e.trade_id AND t.user_id = auth.uid()
    );
  GET DIAGNOSTICS v_execs = ROW_COUNT;

  DELETE FROM public.journal_trades t
  WHERE t.user_id = auth.uid()
    AND (
      t.import_job_id = p_job_id
      OR t.id IN (
        SELECT r.created_trade_id
        FROM public.journal_import_rows r
        WHERE r.import_job_id = p_job_id
          AND r.created_trade_id IS NOT NULL
      )
    );
  GET DIAGNOSTICS v_trades = ROW_COUNT;

  UPDATE public.journal_import_jobs
  SET status = 'rolled_back',
      finished_at = now(),
      error_message = coalesce(error_message, 'rolled back')
  WHERE id = p_job_id
    AND user_id = auth.uid();

  RETURN jsonb_build_object(
    'job_id', p_job_id,
    'executions_deleted', v_execs,
    'trades_deleted', v_trades
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.journal_calculate_trade_v1(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.journal_refresh_derived(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.journal_backfill_accounts_and_executions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.journal_migrate_legacy_trades() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.journal_import_rollback(uuid) TO authenticated, service_role;
