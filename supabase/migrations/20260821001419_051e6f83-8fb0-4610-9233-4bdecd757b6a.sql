-- Extend journal_trades without breaking side / status / qty.
-- DROP and recreate of journal_trades_source_not_demo stay in this atomic segment.
-- integrity-md5: 475f6a50374c70d329b42870b907be07
DO $journal_seg$
DECLARE
  v_statements text[] := ARRAY[
    $journal_stmt$ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS account_id uuid
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS asset_class text
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS instrument text
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS direction text
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS lifecycle_status text
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS playbook_id uuid
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS playbook_version_id uuid
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS discovery_source text
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS context_snapshot_id uuid
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS timezone text
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS planned_risk numeric
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS planned_entry numeric
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS planned_stop numeric
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS planned_target numeric
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS planned_size numeric
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS thesis text
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS reviewed_at timestamptz
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS archived_at timestamptz
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS calculation_version text
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS import_job_id uuid
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS parent_trade_id uuid
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS demo_forbidden boolean NOT NULL DEFAULT false
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trades ADD COLUMN IF NOT EXISTS session_date date
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trades DROP CONSTRAINT IF EXISTS journal_trades_source_not_demo
$journal_stmt$,
    $journal_stmt$ALTER TABLE public.journal_trades
  ADD CONSTRAINT journal_trades_source_not_demo
  CHECK (coalesce(source, '') <> 'demo_workspace')
$journal_stmt$
  ];
  v_expected text := '475f6a50374c70d329b42870b907be07';
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