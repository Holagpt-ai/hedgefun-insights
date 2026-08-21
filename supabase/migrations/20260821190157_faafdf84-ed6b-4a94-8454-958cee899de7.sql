-- System metric catalog (English + Spanish) + journal-calc.v1 formulas.
-- integrity-md5: c0bb6cfea2967fb1be532cfb09be01b7
DO $journal_seg$
DECLARE
  v_statements text[] := ARRAY[
    $journal_stmt$INSERT INTO public.journal_metric_definitions (
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
  updated_at = now()
$journal_stmt$,
    $journal_stmt$INSERT INTO public.journal_metric_formula_versions (metric_definition_id, formula_version, expression)
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
  expression = EXCLUDED.expression
$journal_stmt$
  ];
  v_expected text := 'c0bb6cfea2967fb1be532cfb09be01b7';
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