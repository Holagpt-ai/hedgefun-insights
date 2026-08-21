-- journal_import_row_v1
-- integrity-md5: d5a0336ec8831622f0259b024f8952b9
DO $journal_seg$
DECLARE
  v_statements text[] := ARRAY[
    $journal_stmt$CREATE OR REPLACE FUNCTION public.journal_import_row_v1(
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
$row$
$journal_stmt$,
    $journal_stmt$REVOKE ALL ON FUNCTION public.journal_import_row_v1(uuid, uuid, jsonb) FROM PUBLIC
$journal_stmt$,
    $journal_stmt$GRANT EXECUTE ON FUNCTION public.journal_import_row_v1(uuid, uuid, jsonb) TO authenticated, service_role
$journal_stmt$
  ];
  v_expected text := 'd5a0336ec8831622f0259b024f8952b9';
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