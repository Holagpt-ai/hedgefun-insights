-- Imports / integrations (no secrets) (runner-sized atomic segment).
-- Default TABLE privileges remain quarantined.
-- integrity-md5: 8b9db56e53e25dfd5c883f8be6a5d6c8
DO $journal_seg$
DECLARE
  v_statements text[] := ARRAY[
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'csv',
  filename text,
  status text NOT NULL DEFAULT 'pending',
  row_count integer,
  total_count integer NOT NULL DEFAULT 0,
  valid_count integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  invalid_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id uuid NOT NULL REFERENCES public.journal_import_jobs(id) ON DELETE CASCADE,
  row_index integer NOT NULL,
  raw jsonb,
  parsed jsonb,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  error_code text,
  external_id text,
  identity_key text,
  created_trade_id uuid REFERENCES public.journal_trades(id) ON DELETE SET NULL,
  created_execution_id uuid REFERENCES public.journal_executions(id) ON DELETE SET NULL,
  prior_trade_id uuid
)
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_import_jobs ADD COLUMN IF NOT EXISTS total_count integer NOT NULL DEFAULT 0
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_import_jobs ADD COLUMN IF NOT EXISTS valid_count integer NOT NULL DEFAULT 0
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_import_jobs ADD COLUMN IF NOT EXISTS imported_count integer NOT NULL DEFAULT 0
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_import_jobs ADD COLUMN IF NOT EXISTS failed_count integer NOT NULL DEFAULT 0
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_import_jobs ADD COLUMN IF NOT EXISTS invalid_count integer NOT NULL DEFAULT 0
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_import_jobs ADD COLUMN IF NOT EXISTS duplicate_count integer NOT NULL DEFAULT 0
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_import_rows ADD COLUMN IF NOT EXISTS error_code text
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_import_rows ADD COLUMN IF NOT EXISTS external_id text
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_import_rows ADD COLUMN IF NOT EXISTS identity_key text
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_import_rows ADD COLUMN IF NOT EXISTS prior_trade_id uuid
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_import_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broker text NOT NULL,
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, broker)
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'inactive',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_provider_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.journal_integrations(id) ON DELETE CASCADE,
  external_account_id text NOT NULL,
  display_name text,
  account_id uuid REFERENCES public.journal_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_sync_cursors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.journal_integrations(id) ON DELETE CASCADE,
  cursor_key text NOT NULL,
  cursor_value text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, cursor_key)
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES public.journal_webhook_endpoints(id) ON DELETE CASCADE,
  status text NOT NULL,
  payload_hash text,
  delivered_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$
  ];
  v_expected text := '8b9db56e53e25dfd5c883f8be6a5d6c8';
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
