-- Existing canonical tables (create only if a fresh environment is missing them).
-- Live grants/policies on these five are not revoked or replaced here.
-- Default TABLE privileges remain quarantined until foundation finalization.
-- integrity-md5: 775a8f4a69b4f682c8b55610e745dbd2
DO $journal_seg$
DECLARE
  v_statements text[] := ARRAY[
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_trades (
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
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_id uuid NOT NULL REFERENCES public.journal_trades(id) ON DELETE CASCADE,
  body text NOT NULL,
  note_type text NOT NULL DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_stats_cache (
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
)
$journal_stmt$,
    $journal_stmt$CREATE UNIQUE INDEX IF NOT EXISTS journal_stats_cache_user_id_key
  ON public.journal_stats_cache (user_id)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_equity_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  cumulative_pnl numeric NOT NULL DEFAULT 0,
  trade_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$,
    $journal_stmt$CREATE UNIQUE INDEX IF NOT EXISTS journal_equity_snapshots_user_date_key
  ON public.journal_equity_snapshots (user_id, snapshot_date)
$journal_stmt$,
    $journal_stmt$CREATE TABLE IF NOT EXISTS public.journal_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broker text,
  filename text,
  status text NOT NULL DEFAULT 'pending',
  row_count integer,
  error_message text,
  imported_at timestamptz NOT NULL DEFAULT now()
)
$journal_stmt$
  ];
  v_expected text := '775a8f4a69b4f682c8b55610e745dbd2';
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