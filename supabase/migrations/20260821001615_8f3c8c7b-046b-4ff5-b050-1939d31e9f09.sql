-- Trade graph (children of journal_trades) (runner-sized atomic segment).
-- Default TABLE privileges remain quarantined.
-- integrity-md5: 5f2379de330346a2d3812158e4874441
DO $journal_seg$
DECLARE
  v_statements text[] := ARRAY[
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_trade_legs (
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
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_executions (
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
)
$journal_stmt$,
    $journal_stmt$CREATE UNIQUE INDEX IF NOT EXISTS journal_executions_idempotency_key_uidx
  ON public.journal_executions (idempotency_key)
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_executions ADD COLUMN IF NOT EXISTS leg_id uuid
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_executions ADD COLUMN IF NOT EXISTS sequence_index integer NOT NULL DEFAULT 0
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trade_legs ADD COLUMN IF NOT EXISTS sequence_index integer NOT NULL DEFAULT 0
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_execution_fees (
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
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_trade_cash_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL,
  flow_type text NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_trade_plans (
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
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_trade_reviews (
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
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_trade_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id uuid REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_trade_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_trade_id uuid NOT NULL REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  to_trade_id uuid NOT NULL REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  relationship_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_trade_id, to_trade_id, relationship_type)
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_trade_markers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id uuid NOT NULL REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  marker_type text NOT NULL,
  occurred_at timestamptz,
  price numeric,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id uuid REFERENCES public.journal_trades(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  filename text,
  content_type text,
  byte_size bigint,
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_tag_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id uuid NOT NULL REFERENCES public.journal_tags(id) ON DELETE CASCADE,
  trade_id uuid NOT NULL REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tag_id, trade_id)
)
$journal_stmt$
  ];
  v_expected text := '5f2379de330346a2d3812158e4874441';
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