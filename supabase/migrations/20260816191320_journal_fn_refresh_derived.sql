-- journal_refresh_derived
-- integrity-md5: 85d8c6da7a98de5d87d854a08778c27a
DO $journal_seg$
DECLARE
  v_statements text[] := ARRAY[
    $journal_stmt$CREATE OR REPLACE FUNCTION public.journal_refresh_derived(p_user_id uuid)
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
$refresh$
$journal_stmt$,
    $journal_stmt$GRANT EXECUTE ON FUNCTION public.journal_refresh_derived(uuid) TO authenticated, service_role
$journal_stmt$,
    $journal_stmt$REVOKE ALL ON FUNCTION public.journal_refresh_derived(uuid) FROM PUBLIC
$journal_stmt$
  ];
  v_expected text := '85d8c6da7a98de5d87d854a08778c27a';
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
