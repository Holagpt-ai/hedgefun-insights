-- Stocksist Trading Journal foundation schema.
-- Additive / idempotent-safe-ish. Does not drop existing journal_* or legacy trade tables.

-- ---------------------------------------------------------------------------
-- Existing canonical tables (create only if a fresh environment is missing them)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.journal_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  side text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  qty numeric NOT NULL,
  entry_price numeric NOT NULL,
  exit_price numeric,
  entry_date timestamptz NOT NULL,
  exit_date timestamptz,
  session_date date,
  target_price numeric,
  stop_price numeric,
  setup_tag text,
  return_dollars numeric,
  return_pct numeric,
  hold_duration_minutes integer,
  is_wash boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id uuid NOT NULL REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  body text NOT NULL,
  note_type text NOT NULL DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_stats_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_trades integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  wash_trades integer NOT NULL DEFAULT 0,
  win_rate numeric,
  avg_win_dollars numeric,
  avg_loss_dollars numeric,
  total_pnl numeric,
  largest_win numeric,
  largest_loss numeric,
  period_start date,
  period_end date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS journal_stats_cache_user_id_key
  ON public.journal_stats_cache (user_id);

CREATE TABLE IF NOT EXISTS public.journal_equity_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  cumulative_pnl numeric NOT NULL DEFAULT 0,
  trade_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS journal_equity_snapshots_user_date_key
  ON public.journal_equity_snapshots (user_id, snapshot_date);

CREATE TABLE IF NOT EXISTS public.journal_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broker text,
  filename text,
  status text NOT NULL DEFAULT 'pending',
  row_count integer,
  error_message text,
  imported_at timestamptz NOT NULL DEFAULT now()
);

-- Extend journal_trades without breaking side / status / qty.
ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS account_id uuid;
ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS asset_class text;
ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS instrument text;
ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS direction text;
ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS lifecycle_status text;
ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS playbook_id uuid;
ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS playbook_version_id uuid;
ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS discovery_source text;
ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS context_snapshot_id uuid;
ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS timezone text;
ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS planned_risk numeric;
ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS planned_entry numeric;
ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS planned_stop numeric;
ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS planned_target numeric;
ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS planned_size numeric;
ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS thesis text;
ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS calculation_version text;
ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS import_job_id uuid;
ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS parent_trade_id uuid;
ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS demo_forbidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
-- Live entry_date/exit_date are timestamptz. session_date is the trade-timezone
-- calendar date. Additive only — never ALTER TYPE on existing rows.
ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS session_date date;

ALTER TABLE public.journal_trades DROP CONSTRAINT IF EXISTS journal_trades_source_not_demo;
ALTER TABLE public.journal_trades
  ADD CONSTRAINT journal_trades_source_not_demo
  CHECK (coalesce(source, '') <> 'demo_workspace');

-- ---------------------------------------------------------------------------
-- Identity, accounts, goals, risk
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.journal_trader_profiles (
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
);

CREATE TABLE IF NOT EXISTS public.journal_accounts (
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
);

CREATE TABLE IF NOT EXISTS public.journal_account_balance_snapshots (
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
);

CREATE TABLE IF NOT EXISTS public.journal_goals (
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
);

CREATE TABLE IF NOT EXISTS public.journal_risk_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.journal_accounts(id) ON DELETE SET NULL,
  rule_key text NOT NULL,
  rule_type text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_coaching_commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'active',
  starts_on date,
  ends_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Cash / balances / FX
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.journal_cash_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.journal_accounts(id) ON DELETE CASCADE,
  trade_id uuid REFERENCES public.journal_trades(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL,
  entry_type text NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  memo text,
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_balance_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.journal_accounts(id) ON DELETE CASCADE,
  as_of timestamptz NOT NULL,
  derived_equity numeric,
  reported_balance numeric,
  difference numeric,
  state text NOT NULL DEFAULT 'pending_review',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_currency_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_currency text NOT NULL,
  to_currency text NOT NULL,
  rate numeric NOT NULL,
  as_of timestamptz NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Trade graph (children of journal_trades)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.journal_trade_legs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  action text NOT NULL,
  "right" text,
  strike numeric,
  expiration date,
  contracts numeric,
  multiplier numeric NOT NULL DEFAULT 100,
  occ_symbol text,
  status text NOT NULL DEFAULT 'open',
  sequence_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  occurred_at timestamptz,
  occurred_at_utc timestamptz,
  timezone text,
  action text NOT NULL,
  quantity numeric NOT NULL,
  price numeric NOT NULL,
  multiplier numeric NOT NULL DEFAULT 1,
  commission numeric,
  regulatory_fee numeric,
  other_fee numeric,
  fee_currency text DEFAULT 'USD',
  venue text,
  order_type text,
  source text,
  external_execution_id text,
  idempotency_key text,
  import_job_id uuid,
  note text,
  leg_id uuid REFERENCES public.journal_trade_legs(id) ON DELETE SET NULL,
  sequence_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS journal_executions_idempotency_key_uidx
  ON public.journal_executions (idempotency_key);

ALTER TABLE public.journal_executions ADD COLUMN IF NOT EXISTS leg_id uuid;
ALTER TABLE public.journal_executions ADD COLUMN IF NOT EXISTS sequence_index integer NOT NULL DEFAULT 0;
ALTER TABLE public.journal_trade_legs ADD COLUMN IF NOT EXISTS sequence_index integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.journal_execution_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES public.journal_executions(id) ON DELETE CASCADE,
  kind text NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  native_amount numeric,
  native_currency text,
  conversion_rate numeric,
  conversion_timestamp timestamptz,
  conversion_source text,
  account_currency_amount numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_trade_cash_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL,
  flow_type text NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_trade_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id uuid NOT NULL REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  planned_entry numeric,
  planned_stop numeric,
  planned_target numeric,
  planned_size numeric,
  planned_risk numeric,
  thesis text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade_id)
);

CREATE TABLE IF NOT EXISTS public.journal_trade_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id uuid NOT NULL REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  rating integer,
  followed_plan boolean,
  emotions text,
  lessons text,
  body text,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_trade_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id uuid REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_trade_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_trade_id uuid NOT NULL REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  to_trade_id uuid NOT NULL REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  relationship_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_trade_id, to_trade_id, relationship_type)
);

CREATE TABLE IF NOT EXISTS public.journal_trade_markers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id uuid NOT NULL REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  marker_type text NOT NULL,
  occurred_at timestamptz,
  price numeric,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id uuid REFERENCES public.journal_trades(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  filename text,
  content_type text,
  byte_size bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS public.journal_tag_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id uuid NOT NULL REFERENCES public.journal_tags(id) ON DELETE CASCADE,
  trade_id uuid NOT NULL REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tag_id, trade_id)
);

-- ---------------------------------------------------------------------------
-- Notebooks, sessions, playbooks, process
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.journal_notebooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_notebook_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notebook_id uuid NOT NULL REFERENCES public.journal_notebooks(id) ON DELETE CASCADE,
  title text,
  body text,
  entry_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_notebook_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.journal_notebook_entries(id) ON DELETE CASCADE,
  trade_id uuid REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  playbook_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_sessions (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS journal_sessions_user_account_date_uidx
  ON public.journal_sessions (user_id, coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid), session_date);

CREATE TABLE IF NOT EXISTS public.journal_daily_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_date date NOT NULL,
  grade text,
  followed_process boolean,
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, review_date)
);

CREATE TABLE IF NOT EXISTS public.journal_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS public.journal_playbook_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  playbook_id uuid NOT NULL REFERENCES public.journal_playbooks(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  rules_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (playbook_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.journal_playbook_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  playbook_id uuid NOT NULL REFERENCES public.journal_playbooks(id) ON DELETE CASCADE,
  version_id uuid REFERENCES public.journal_playbook_versions(id) ON DELETE SET NULL,
  rule_key text NOT NULL,
  description text,
  is_required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_playbook_check_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES public.journal_playbook_rules(id) ON DELETE CASCADE,
  passed boolean,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_risk_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id uuid REFERENCES public.journal_trades(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.journal_accounts(id) ON DELETE SET NULL,
  rule_id uuid REFERENCES public.journal_risk_rules(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  severity text NOT NULL DEFAULT 'warning',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_process_scores (
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
);

CREATE TABLE IF NOT EXISTS public.journal_process_score_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_score_id uuid NOT NULL REFERENCES public.journal_process_scores(id) ON DELETE CASCADE,
  component_key text NOT NULL,
  weight numeric,
  score numeric,
  applicable boolean NOT NULL DEFAULT true,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Metrics, reports
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.journal_metric_definitions (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS journal_metric_definitions_system_key_uidx
  ON public.journal_metric_definitions (metric_key)
  WHERE user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS journal_metric_definitions_user_key_uidx
  ON public.journal_metric_definitions (user_id, metric_key)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.journal_metric_formula_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_definition_id uuid NOT NULL REFERENCES public.journal_metric_definitions(id) ON DELETE CASCADE,
  formula_version text NOT NULL,
  expression text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (metric_definition_id, formula_version)
);

CREATE TABLE IF NOT EXISTS public.journal_report_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  template jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_saved_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.journal_report_templates(id) ON DELETE SET NULL,
  name text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_report_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  saved_report_id uuid REFERENCES public.journal_saved_reports(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_report_run_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_run_id uuid NOT NULL REFERENCES public.journal_report_runs(id) ON DELETE CASCADE,
  row_index integer NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.journal_report_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_run_id uuid REFERENCES public.journal_report_runs(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  format text NOT NULL DEFAULT 'csv',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  saved_report_id uuid REFERENCES public.journal_saved_reports(id) ON DELETE CASCADE,
  cron text,
  is_active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Market context, calculations, analytics
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.journal_market_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  as_of timestamptz NOT NULL,
  symbol text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_market_context_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_context_id uuid NOT NULL REFERENCES public.journal_market_context(id) ON DELETE CASCADE,
  source_name text NOT NULL,
  source_url text,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_price_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  observed_at timestamptz NOT NULL,
  price numeric NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_valuation_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.journal_accounts(id) ON DELETE CASCADE,
  as_of timestamptz NOT NULL,
  equity numeric,
  open_pnl numeric,
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_calculation_runs (
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
);

ALTER TABLE public.journal_calculation_runs ADD COLUMN IF NOT EXISTS initial_risk numeric;
ALTER TABLE public.journal_calculation_runs ADD COLUMN IF NOT EXISTS risk_per_share numeric;
ALTER TABLE public.journal_calculation_runs ADD COLUMN IF NOT EXISTS planned_quantity numeric;
ALTER TABLE public.journal_calculation_runs ADD COLUMN IF NOT EXISTS plan_multiplier numeric;
ALTER TABLE public.journal_calculation_runs ADD COLUMN IF NOT EXISTS planned_risk_source text;
ALTER TABLE public.journal_calculation_runs ADD COLUMN IF NOT EXISTS r_multiple numeric;
ALTER TABLE public.journal_calculation_runs ADD COLUMN IF NOT EXISTS outcome text;
ALTER TABLE public.journal_calculation_runs ADD COLUMN IF NOT EXISTS over_exit_blocked boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.journal_calculation_lineage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_run_id uuid NOT NULL REFERENCES public.journal_calculation_runs(id) ON DELETE CASCADE,
  input_hash text,
  observations jsonb NOT NULL DEFAULT '[]'::jsonb,
  exclusions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_trade_sequence_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id uuid NOT NULL REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade_id)
);

CREATE TABLE IF NOT EXISTS public.journal_data_quality_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id uuid REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  issue_code text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_daily_metrics (
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
);

CREATE TABLE IF NOT EXISTS public.journal_analytics_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cache_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, cache_key)
);

CREATE TABLE IF NOT EXISTS public.journal_performance_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  insight_type text NOT NULL,
  title text,
  body text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- AI
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.journal_ai_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_type text NOT NULL,
  content text NOT NULL,
  embedding_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_ai_memory_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id uuid NOT NULL REFERENCES public.journal_ai_memories(id) ON DELETE CASCADE,
  trade_id uuid REFERENCES public.journal_trades(id) ON DELETE SET NULL,
  source_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  body text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.journal_ai_conversations(id) ON DELETE CASCADE,
  "role" text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_ai_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  insight_id uuid REFERENCES public.journal_ai_insights(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.journal_ai_messages(id) ON DELETE SET NULL,
  rating integer,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.journal_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  tokens_in integer,
  tokens_out integer,
  model text,
  cost_estimate numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Imports / integrations (no secrets)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.journal_import_jobs (
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
);

CREATE TABLE IF NOT EXISTS public.journal_import_rows (
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
);

ALTER TABLE public.journal_import_jobs ADD COLUMN IF NOT EXISTS total_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.journal_import_jobs ADD COLUMN IF NOT EXISTS valid_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.journal_import_jobs ADD COLUMN IF NOT EXISTS imported_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.journal_import_jobs ADD COLUMN IF NOT EXISTS failed_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.journal_import_jobs ADD COLUMN IF NOT EXISTS invalid_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.journal_import_jobs ADD COLUMN IF NOT EXISTS duplicate_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.journal_import_rows ADD COLUMN IF NOT EXISTS error_code text;
ALTER TABLE public.journal_import_rows ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.journal_import_rows ADD COLUMN IF NOT EXISTS identity_key text;
ALTER TABLE public.journal_import_rows ADD COLUMN IF NOT EXISTS prior_trade_id uuid;

CREATE TABLE IF NOT EXISTS public.journal_import_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broker text NOT NULL,
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, broker)
);

CREATE TABLE IF NOT EXISTS public.journal_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'inactive',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_provider_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.journal_integrations(id) ON DELETE CASCADE,
  external_account_id text NOT NULL,
  display_name text,
  account_id uuid REFERENCES public.journal_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_sync_cursors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.journal_integrations(id) ON DELETE CASCADE,
  cursor_key text NOT NULL,
  cursor_value text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, cursor_key)
);

CREATE TABLE IF NOT EXISTS public.journal_webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES public.journal_webhook_endpoints(id) ON DELETE CASCADE,
  status text NOT NULL,
  payload_hash text,
  delivered_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Domain events / outbox / audit
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.journal_domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_event_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.journal_domain_events(id) ON DELETE SET NULL,
  destination text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_dead_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- Late FKs for journal_trades and notebook links (tables now exist).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_trades_account_id_fkey') THEN
    ALTER TABLE public.journal_trades
      ADD CONSTRAINT journal_trades_account_id_fkey
      FOREIGN KEY (account_id) REFERENCES public.journal_accounts(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_trades_playbook_id_fkey') THEN
    ALTER TABLE public.journal_trades
      ADD CONSTRAINT journal_trades_playbook_id_fkey
      FOREIGN KEY (playbook_id) REFERENCES public.journal_playbooks(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_trades_playbook_version_id_fkey') THEN
    ALTER TABLE public.journal_trades
      ADD CONSTRAINT journal_trades_playbook_version_id_fkey
      FOREIGN KEY (playbook_version_id) REFERENCES public.journal_playbook_versions(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_trades_context_snapshot_id_fkey') THEN
    ALTER TABLE public.journal_trades
      ADD CONSTRAINT journal_trades_context_snapshot_id_fkey
      FOREIGN KEY (context_snapshot_id) REFERENCES public.journal_trade_context(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_trades_import_job_id_fkey') THEN
    ALTER TABLE public.journal_trades
      ADD CONSTRAINT journal_trades_import_job_id_fkey
      FOREIGN KEY (import_job_id) REFERENCES public.journal_import_jobs(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_trades_parent_trade_id_fkey') THEN
    ALTER TABLE public.journal_trades
      ADD CONSTRAINT journal_trades_parent_trade_id_fkey
      FOREIGN KEY (parent_trade_id) REFERENCES public.journal_trades(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_executions_import_job_id_fkey') THEN
    ALTER TABLE public.journal_executions
      ADD CONSTRAINT journal_executions_import_job_id_fkey
      FOREIGN KEY (import_job_id) REFERENCES public.journal_import_jobs(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_executions_leg_id_fkey') THEN
    ALTER TABLE public.journal_executions
      ADD CONSTRAINT journal_executions_leg_id_fkey
      FOREIGN KEY (leg_id) REFERENCES public.journal_trade_legs(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_notebook_links_playbook_id_fkey') THEN
    ALTER TABLE public.journal_notebook_links
      ADD CONSTRAINT journal_notebook_links_playbook_id_fkey
      FOREIGN KEY (playbook_id) REFERENCES public.journal_playbooks(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS journal_trades_user_entry_idx
  ON public.journal_trades (user_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS journal_trades_account_idx
  ON public.journal_trades (account_id);
CREATE INDEX IF NOT EXISTS journal_trades_import_job_idx
  ON public.journal_trades (import_job_id);
CREATE INDEX IF NOT EXISTS journal_executions_trade_idx
  ON public.journal_executions (trade_id, occurred_at_utc);
CREATE INDEX IF NOT EXISTS journal_execution_fees_execution_idx
  ON public.journal_execution_fees (execution_id);
CREATE INDEX IF NOT EXISTS journal_cash_ledger_account_idx
  ON public.journal_cash_ledger_entries (account_id, occurred_at);
CREATE INDEX IF NOT EXISTS journal_daily_metrics_user_date_idx
  ON public.journal_daily_metrics (user_id, metric_date);
CREATE INDEX IF NOT EXISTS journal_event_outbox_status_idx
  ON public.journal_event_outbox (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS journal_import_rows_job_idx
  ON public.journal_import_rows (import_job_id, row_index);
CREATE UNIQUE INDEX IF NOT EXISTS journal_import_rows_imported_identity_uidx
  ON public.journal_import_rows (identity_key)
  WHERE status = 'imported' AND identity_key IS NOT NULL;

-- updated_at triggers (reuse existing helper when present)
DO $$
DECLARE
  t text;
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY[
    'journal_trades',
    'journal_trader_profiles',
    'journal_accounts',
    'journal_goals',
    'journal_risk_rules',
    'journal_coaching_commitments',
    'journal_trade_plans',
    'journal_notebooks',
    'journal_notebook_entries',
    'journal_sessions',
    'journal_daily_reviews',
    'journal_playbooks',
    'journal_metric_definitions',
    'journal_saved_reports',
    'journal_trade_sequence_metrics',
    'journal_daily_metrics',
    'journal_ai_conversations',
    'journal_import_mappings',
    'journal_integrations'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t, t
    );
  END LOOP;
END $$;
