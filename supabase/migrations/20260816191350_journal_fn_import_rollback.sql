-- journal_import_rollback
-- integrity-md5: 469bb81b664d7cb96cf9e152bff725db
DO $journal_seg$
DECLARE
  v_statements text[] := ARRAY[
    $journal_stmt$CREATE OR REPLACE FUNCTION public.journal_import_rollback(p_job_id uuid)
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
$fn$
$journal_stmt$,
    $journal_stmt$GRANT EXECUTE ON FUNCTION public.journal_import_rollback(uuid) TO authenticated, service_role
$journal_stmt$
  ];
  v_expected text := '469bb81b664d7cb96cf9e152bff725db';
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
