-- Identity, accounts, goals, risk (runner-sized atomic segment).
-- Default TABLE privileges remain quarantined.
-- integrity-md5: f0c7443be0788cc718ecfd9279f53f63
DO $journal_seg$
DECLARE
  v_statements text[] := ARRAY[
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_trader_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  default_timezone text NOT NULL DEFAULT 'America/New_York',
  default_currency text NOT NULL DEFAULT 'USD',
  locale text NOT NULL DEFAULT 'en',
  experience_level text,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  broker text,
  account_type text,
  base_currency text NOT NULL DEFAULT 'USD',
  is_primary boolean NOT NULL DEFAULT false,
  is_paper boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  opened_at date,
  closed_at date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_account_balance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.journal_accounts(id) ON DELETE CASCADE,
  snapshot_at timestamptz NOT NULL,
  cash_balance numeric,
  equity numeric,
  buying_power numeric,
  currency text NOT NULL DEFAULT 'USD',
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.journal_accounts(id) ON DELETE SET NULL,
  period_type text NOT NULL DEFAULT 'monthly',
  period_start date,
  period_end date,
  target_r numeric,
  target_pnl numeric,
  max_drawdown numeric,
  max_daily_loss numeric,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_risk_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.journal_accounts(id) ON DELETE SET NULL,
  rule_key text NOT NULL,
  rule_type text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_coaching_commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'active',
  starts_on date,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$
  ];
  v_expected text := 'f0c7443be0788cc718ecfd9279f53f63';
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