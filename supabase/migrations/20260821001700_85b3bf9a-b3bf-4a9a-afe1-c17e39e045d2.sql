-- Notebooks, sessions, playbooks, process (runner-sized atomic segment).
-- Default TABLE privileges remain quarantined.
-- integrity-md5: bf513961af8b243abf9a4c0ad81ab6a8
DO $journal_seg$
DECLARE
  v_statements text[] := ARRAY[
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_notebooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_notebook_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notebook_id uuid NOT NULL REFERENCES public.journal_notebooks(id) ON DELETE CASCADE,
  title text,
  body text,
  entry_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_notebook_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.journal_notebook_entries(id) ON DELETE CASCADE,
  trade_id uuid REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  playbook_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.journal_accounts(id) ON DELETE SET NULL,
  session_date date NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  timezone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE UNIQUE INDEX IF NOT EXISTS journal_sessions_user_account_date_uidx
  ON public.journal_sessions (user_id, coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid), session_date)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_daily_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_date date NOT NULL,
  grade text,
  followed_process boolean,
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, review_date)
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_playbook_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  playbook_id uuid NOT NULL REFERENCES public.journal_playbooks(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  rules_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (playbook_id, version_number)
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_playbook_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  playbook_id uuid NOT NULL REFERENCES public.journal_playbooks(id) ON DELETE CASCADE,
  version_id uuid REFERENCES public.journal_playbook_versions(id) ON DELETE SET NULL,
  rule_key text NOT NULL,
  description text,
  is_required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_playbook_check_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES public.journal_playbook_rules(id) ON DELETE CASCADE,
  passed boolean,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_risk_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id uuid REFERENCES public.journal_trades(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.journal_accounts(id) ON DELETE SET NULL,
  rule_id uuid REFERENCES public.journal_risk_rules(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  severity text NOT NULL DEFAULT 'warning',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_process_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id uuid REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.journal_sessions(id) ON DELETE SET NULL,
  review_date date,
  total numeric,
  state text,
  confidence text,
  version text,
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_process_score_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_score_id uuid NOT NULL REFERENCES public.journal_process_scores(id) ON DELETE CASCADE,
  component_key text NOT NULL,
  weight numeric,
  score numeric,
  applicable boolean NOT NULL DEFAULT true,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$
  ];
  v_expected text := 'bf513961af8b243abf9a4c0ad81ab6a8';
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