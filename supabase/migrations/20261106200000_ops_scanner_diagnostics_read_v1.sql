-- Batch 213: admin-only, read-only scanner diagnostics for the Operations
-- Control Center (/admin/operations, Batch 212).
--
-- NOT APPLIED in Cursor. Lovable Cloud applies only after separate owner
-- approval. Depends on Batch 212 (PR #224) for the consuming UI; the SQL
-- itself depends only on existing objects:
--   public.has_role(uuid, public.app_role)        (20260522174654)
--   public.screener_sync_generation_jobs          (20261028200000 + 220000 + 20261030210000)
--   public.market_session_calendar                (20260813180000)
--
-- Read-only: no INSERT/UPDATE/DELETE, no lock-taking statements, no change
-- to jobs, leases, cron, publication RPCs, or existing grants on tables.
-- Never returns all_tickers, gainers, losers, merged_artifacts,
-- nhl_baseline_snapshot, observation, lease tokens, or raw abort_evidence.

-- ---------------------------------------------------------------------------
-- Private helper: redact credential-shaped substrings and bound length.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ops_diagnostics_redact_v1(p_text text, p_max integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_text IS NULL THEN NULL
    ELSE pg_catalog.left(
      pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        p_text,
        'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}', '[redacted]', 'g'),
        '(bearer|basic|token)\s+[A-Za-z0-9._~+/=-]{8,}', '\1 [redacted]', 'gi'),
        '(api[_-]?key|apikey|access[_-]?token|secret|password|service[_-]?role[_-]?key|sync[_-]?secret|radar[_-]?worker[_-]?secret)(["'']?\s*[=:]\s*["'']?)[^\s&"'',;]+', '\1\2[redacted]', 'gi'),
        '(gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,})', '[redacted]', 'g'),
        '((sk|rk|pk)_(live|test)_[A-Za-z0-9]{8,}|sb_secret_[A-Za-z0-9_-]{8,})', '[redacted]', 'g'),
        'postgres(ql)?://[^\s]+', 'postgres://[redacted]', 'gi'),
      GREATEST(LEAST(COALESCE(p_max, 300), 1000), 1)
    )
  END
$$;

REVOKE ALL ON FUNCTION public.ops_diagnostics_redact_v1(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ops_diagnostics_redact_v1(text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.ops_diagnostics_redact_v1(text, integer) FROM authenticated;
REVOKE ALL ON FUNCTION public.ops_diagnostics_redact_v1(text, integer) FROM service_role;

-- ---------------------------------------------------------------------------
-- Admin-only diagnostics read.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_ops_scanner_diagnostics_v1(p_job_limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limit integer := GREATEST(LEAST(COALESCE(p_job_limit, 10), 20), 1);
  v_now timestamptz := pg_catalog.now();
  v_today date := (pg_catalog.now() AT TIME ZONE 'America/New_York')::date;
  v_jobs jsonb;
  v_stranded integer;
  v_cal_rows jsonb;
  v_cal_loaded boolean;
  v_cal_updated timestamptz;
  v_cal_max date;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'get_ops_scanner_diagnostics_v1: admin role required'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(r.job ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_jobs
  FROM (
    SELECT
      j.created_at,
      pg_catalog.jsonb_build_object(
        'id', j.id,
        'sync_run_id', j.sync_run_id,
        'status', j.status,
        'next_chunk_index', j.next_chunk_index,
        'total_chunks', j.total_chunks,
        'lease_expires_at', j.lease_expires_at,
        'finalize_lease_expires_at', j.finalize_lease_expires_at,
        'continue_last_at', j.continue_last_at,
        'continue_last_error', public.ops_diagnostics_redact_v1(j.continue_last_error, 300),
        'abort_reason', j.abort_reason,
        'abort_prior_synced_at',
          CASE
            WHEN pg_catalog.jsonb_typeof(j.abort_evidence) = 'object'
              THEN pg_catalog.left(j.abort_evidence ->> 'prior_synced_at', 40)
          END,
        'abort_tabs',
          CASE
            WHEN pg_catalog.jsonb_typeof(j.abort_evidence -> 'tabs') = 'array' THEN (
              SELECT pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'tab', pg_catalog.left(t.value ->> 'tab', 40),
                  'prior_status', pg_catalog.left(t.value ->> 'prior_status', 40),
                  'candidate_status', pg_catalog.left(t.value ->> 'candidate_status', 40),
                  'triggered_preservation', (t.value -> 'triggered_preservation') = 'true'::jsonb
                )
                ORDER BY t.ordinality
              )
              FROM pg_catalog.jsonb_array_elements(j.abort_evidence -> 'tabs')
                WITH ORDINALITY AS t(value, ordinality)
              WHERE t.ordinality <= 6
                AND pg_catalog.jsonb_typeof(t.value) = 'object'
            )
          END,
        'publish_rows_inserted', j.publish_rows_inserted,
        'publish_rpc_recorded_at', j.publish_rpc_recorded_at,
        'created_at', j.created_at,
        'updated_at', j.updated_at
      ) AS job
    FROM public.screener_sync_generation_jobs j
    ORDER BY j.created_at DESC
    LIMIT v_limit
  ) r;

  -- Count only: stranded jobs older than the returned window stay visible.
  SELECT pg_catalog.count(*)::integer
  INTO v_stranded
  FROM public.screener_sync_generation_jobs j
  WHERE j.status = 'finalizing'
    AND j.finalize_lease_expires_at IS NOT NULL
    AND j.finalize_lease_expires_at < v_now;

  -- Exception calendar near today only (closed / early-close rows).
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'session_date', c.session_date,
        'market_status', c.market_status,
        'regular_open_et', c.regular_open_et::text,
        'regular_close_et', c.regular_close_et::text,
        'after_hours_end_et', c.after_hours_end_et::text,
        'holiday_name', pg_catalog.left(c.holiday_name, 80)
      )
      ORDER BY c.session_date
    ),
    '[]'::jsonb
  )
  INTO v_cal_rows
  FROM public.market_session_calendar c
  WHERE c.session_date BETWEEN v_today - 7 AND v_today + 14;

  SELECT
    pg_catalog.count(*) > 0,
    pg_catalog.max(c.updated_at),
    pg_catalog.max(c.session_date)
  INTO v_cal_loaded, v_cal_updated, v_cal_max
  FROM public.market_session_calendar c;

  RETURN pg_catalog.jsonb_build_object(
    'schema_version', 1,
    'observed_at', v_now,
    'job_limit', v_limit,
    'jobs', v_jobs,
    'stranded_finalizing_count', v_stranded,
    'calendar', pg_catalog.jsonb_build_object(
      'today_et', v_today,
      'loaded', v_cal_loaded,
      'latest_updated_at', v_cal_updated,
      'max_session_date', v_cal_max,
      'exceptions', v_cal_rows
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_ops_scanner_diagnostics_v1(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_ops_scanner_diagnostics_v1(integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_ops_scanner_diagnostics_v1(integer) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_ops_scanner_diagnostics_v1(integer) TO authenticated;

COMMENT ON FUNCTION public.get_ops_scanner_diagnostics_v1(integer) IS
  'Batch 213: admin-only (has_role admin) read-only redacted screener generation job and exception-calendar diagnostics for /admin/operations. Bounded to 20 jobs.';
