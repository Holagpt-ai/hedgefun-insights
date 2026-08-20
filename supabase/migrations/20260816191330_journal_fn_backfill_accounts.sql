-- journal_backfill_accounts_and_executions
-- Operator-controlled. This migration does not invoke the function.
--
-- Do not create public.journal_rollback_* or any equivalent permanent
-- checkpoint table in an API-exposed schema.
--
-- Deployment runbook (required). If the deployment tool cannot guarantee
-- one operator session and one transaction, the backfill remains NO-GO
-- until a private administrative ledger is separately approved.
--   1. One operator-controlled database session.
--   2. An explicit transaction.
--   3. pg_temp checkpoint tables scoped to the exact affected user and
--      exact enumerated trade IDs.
--   4. Capture original trade account_id values, pre-existing account IDs,
--      pre-existing execution IDs, exact account IDs created by the call,
--      and exact execution IDs created by the call.
--   5. Complete dry run ending in ROLLBACK.
--   6. Repeat the transaction and COMMIT only after every assertion passes.
--   7. Return exact created IDs to the operator and preserve them outside
--      the Data API.
--   8. Any later rollback must use those literal captured IDs and the
--      exact original account_id mappings.
--   9. Assertions inspect only captured deployment-created rows — not
--      every row where source = 'synthetic_backfill'.
-- integrity-md5: 437c50fe6a1da57d2707f9a37c67ffea
DO $journal_seg$
DECLARE
  v_statements text[] := ARRAY[
    $journal_stmt$CREATE OR REPLACE FUNCTION public.journal_backfill_accounts_and_executions(p_user_id uuid DEFAULT NULL)
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
$fn$
$journal_stmt$,
    $journal_stmt$GRANT EXECUTE ON FUNCTION public.journal_backfill_accounts_and_executions(uuid) TO authenticated, service_role
$journal_stmt$
  ];
  v_expected text := '437c50fe6a1da57d2707f9a37c67ffea';
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
