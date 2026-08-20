-- Market context, calculations, analytics (runner-sized atomic segment).
-- Default TABLE privileges remain quarantined.
-- integrity-md5: 17112fdcb8f91038f70380e0b831e368
DO $journal_seg$
DECLARE
  v_statements text[] := ARRAY[
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_market_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  as_of timestamptz NOT NULL,
  symbol text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_market_context_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_context_id uuid NOT NULL REFERENCES public.journal_market_context(id) ON DELETE CASCADE,
  source_name text NOT NULL,
  source_url text,
  captured_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_price_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  observed_at timestamptz NOT NULL,
  price numeric NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_valuation_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.journal_accounts(id) ON DELETE CASCADE,
  as_of timestamptz NOT NULL,
  equity numeric,
  open_pnl numeric,
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_calculation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id uuid NOT NULL REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  calculation_version text NOT NULL DEFAULT 'journal-calc.v1',
  input_version text NOT NULL DEFAULT 'journal-input.v1',
  state text NOT NULL DEFAULT 'authoritative',
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  gross_pnl numeric,
  net_pnl numeric,
  fees numeric,
  remaining_qty numeric,
  weighted_avg_entry numeric,
  weighted_avg_exit numeric,
  initial_risk numeric,
  risk_per_share numeric,
  planned_quantity numeric,
  plan_multiplier numeric,
  planned_risk_source text,
  r_multiple numeric,
  outcome text,
  over_exit_blocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade_id, calculation_version)
)
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_calculation_runs ADD COLUMN IF NOT EXISTS initial_risk numeric
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_calculation_runs ADD COLUMN IF NOT EXISTS risk_per_share numeric
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_calculation_runs ADD COLUMN IF NOT EXISTS planned_quantity numeric
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_calculation_runs ADD COLUMN IF NOT EXISTS plan_multiplier numeric
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_calculation_runs ADD COLUMN IF NOT EXISTS planned_risk_source text
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_calculation_runs ADD COLUMN IF NOT EXISTS r_multiple numeric
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_calculation_runs ADD COLUMN IF NOT EXISTS outcome text
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_calculation_runs ADD COLUMN IF NOT EXISTS over_exit_blocked boolean NOT NULL DEFAULT false
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_calculation_lineage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_run_id uuid NOT NULL REFERENCES public.journal_calculation_runs(id) ON DELETE CASCADE,
  input_hash text,
  observations jsonb NOT NULL DEFAULT '[]'::jsonb,
  exclusions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_trade_sequence_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id uuid NOT NULL REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade_id)
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_data_quality_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id uuid REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  issue_code text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric_date date NOT NULL,
  net_pnl numeric NOT NULL DEFAULT 0,
  gross_pnl numeric NOT NULL DEFAULT 0,
  fees numeric NOT NULL DEFAULT 0,
  trade_count integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  breakevens integer NOT NULL DEFAULT 0,
  average_r numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, metric_date)
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_analytics_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cache_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, cache_key)
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_performance_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  insight_type text NOT NULL,
  title text,
  body text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$
  ];
  v_expected text := '17112fdcb8f91038f70380e0b831e368';
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
