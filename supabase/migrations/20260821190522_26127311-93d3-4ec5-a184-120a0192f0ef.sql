-- journal_migrate_legacy_trades
-- Operator-controlled. This migration does not invoke the function.
-- integrity-md5: f05ae4a1c619f1899d6b151a1d951c23
DO $journal_seg$
DECLARE
  v_statements text[] := ARRAY[
    $journal_stmt$CREATE OR REPLACE FUNCTION public.journal_migrate_legacy_trades()
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
$fn$
$journal_stmt$,
    $journal_stmt$GRANT EXECUTE ON FUNCTION public.journal_migrate_legacy_trades() TO authenticated, service_role
$journal_stmt$
  ];
  v_expected text := 'f05ae4a1c619f1899d6b151a1d951c23';
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