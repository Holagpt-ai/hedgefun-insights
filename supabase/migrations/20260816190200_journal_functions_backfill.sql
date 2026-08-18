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
    coalesce(
      t.session_date,
      (coalesce(t.exit_date, t.entry_date) AT TIME ZONE coalesce(t.timezone, 'America/New_York'))::date
    ) AS metric_date,
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
  GROUP BY coalesce(
      t.session_date,
      (coalesce(t.exit_date, t.entry_date) AT TIME ZONE coalesce(t.timezone, 'America/New_York'))::date
    );

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
      thesis, reviewed_at, calculation_version, source, demo_forbidden
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
    SELECT value AS elem
    FROM jsonb_array_elements(coalesce(p_payload->'legs', '[]'::jsonb)) AS t(value)
  LOOP
    IF (v_row.elem->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_leg_id := (v_row.elem->>'id')::uuid;
    ELSE
      v_leg_id := gen_random_uuid();
    END IF;
    INSERT INTO public.journal_trade_legs (
      id, trade_id, action, right, strike, expiration, contracts, multiplier, occ_symbol, status
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
      coalesce(nullif(btrim(v_row.elem->>'status'), ''), 'open')
    );
    v_leg_ids := v_leg_ids || jsonb_build_array(v_leg_id);
  END LOOP;

  FOR v_row IN
    SELECT value AS elem
    FROM jsonb_array_elements(coalesce(p_payload->'executions', '[]'::jsonb)) AS t(value)
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
      idempotency_key, import_job_id, note, leg_id
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
      v_exec->>'source',
      v_exec->>'external_execution_id',
      nullif(btrim(coalesce(v_exec->>'idempotency_key', '')), ''),
      CASE
        WHEN (v_exec->>'import_job_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (v_exec->>'import_job_id')::uuid
        ELSE NULL
      END,
      v_exec->>'note',
      v_leg_id
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

  INSERT INTO public.journal_calculation_runs (
    user_id, trade_id, calculation_version, input_version, state, result,
    gross_pnl, net_pnl, fees, remaining_qty, weighted_avg_entry, weighted_avg_exit
  ) VALUES (
    v_uid,
    v_trade_id,
    coalesce(nullif(btrim(v_calc->>'calculation_version'), ''), 'journal-calc.v1'),
    coalesce(nullif(btrim(v_calc->>'input_version'), ''), 'journal-input.v1'),
    coalesce(nullif(btrim(v_calc->>'state'), ''), 'authoritative'),
    coalesce(v_calc->'result', v_calc, '{}'::jsonb),
    (v_calc->>'gross_pnl')::numeric,
    (v_calc->>'net_pnl')::numeric,
    (v_calc->>'fees')::numeric,
    (v_calc->>'remaining_qty')::numeric,
    (v_calc->>'weighted_avg_entry')::numeric,
    (v_calc->>'weighted_avg_exit')::numeric
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
