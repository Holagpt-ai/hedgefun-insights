-- journal_import_finalize_v1
-- integrity-md5: 86569d4bee60796943deb294d56d5c99
DO $journal_seg$
DECLARE
  v_statements text[] := ARRAY[
    $journal_stmt$CREATE OR REPLACE FUNCTION public.journal_import_finalize_v1(p_job_id uuid)
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
$fin$
$journal_stmt$,
    $journal_stmt$REVOKE ALL ON FUNCTION public.journal_import_finalize_v1(uuid) FROM PUBLIC
$journal_stmt$,
    $journal_stmt$GRANT EXECUTE ON FUNCTION public.journal_import_finalize_v1(uuid) TO authenticated, service_role
$journal_stmt$
  ];
  v_expected text := '86569d4bee60796943deb294d56d5c99';
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