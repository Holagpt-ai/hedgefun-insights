-- journal_import_start_v1
-- integrity-md5: 13227ae100a8f864cf6ef258316d6a6d
DO $journal_seg$
DECLARE
  v_statements text[] := ARRAY[
    $journal_stmt$CREATE OR REPLACE FUNCTION public.journal_import_start_v1(p_payload jsonb)
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
$start$
$journal_stmt$,
    $journal_stmt$REVOKE ALL ON FUNCTION public.journal_import_start_v1(jsonb) FROM PUBLIC
$journal_stmt$,
    $journal_stmt$GRANT EXECUTE ON FUNCTION public.journal_import_start_v1(jsonb) TO authenticated, service_role
$journal_stmt$
  ];
  v_expected text := '13227ae100a8f864cf6ef258316d6a6d';
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
