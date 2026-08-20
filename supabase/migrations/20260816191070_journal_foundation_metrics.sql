-- Metrics, reports (runner-sized atomic segment).
-- Default TABLE privileges remain quarantined.
-- integrity-md5: 50e8a521a5a850c4e8a58f3912542f06
DO $journal_seg$
DECLARE
  v_statements text[] := ARRAY[
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_metric_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  name_en text NOT NULL,
  name_es text NOT NULL,
  definition_en text NOT NULL,
  definition_es text NOT NULL,
  unit text,
  category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE UNIQUE INDEX IF NOT EXISTS journal_metric_definitions_system_key_uidx
  ON public.journal_metric_definitions (metric_key)
  WHERE user_id IS NULL
$journal_stmt$,
    $journal_stmt$CREATE UNIQUE INDEX IF NOT EXISTS journal_metric_definitions_user_key_uidx
  ON public.journal_metric_definitions (user_id, metric_key)
  WHERE user_id IS NOT NULL
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_metric_formula_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_definition_id uuid NOT NULL REFERENCES public.journal_metric_definitions(id) ON DELETE CASCADE,
  formula_version text NOT NULL,
  expression text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (metric_definition_id, formula_version)
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_report_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  template jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_saved_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.journal_report_templates(id) ON DELETE SET NULL,
  name text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_report_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  saved_report_id uuid REFERENCES public.journal_saved_reports(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_report_run_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_run_id uuid NOT NULL REFERENCES public.journal_report_runs(id) ON DELETE CASCADE,
  row_index integer NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_report_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_run_id uuid REFERENCES public.journal_report_runs(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  format text NOT NULL DEFAULT 'csv',
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  saved_report_id uuid REFERENCES public.journal_saved_reports(id) ON DELETE CASCADE,
  cron text,
  is_active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$
  ];
  v_expected text := '50e8a521a5a850c4e8a58f3912542f06';
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
