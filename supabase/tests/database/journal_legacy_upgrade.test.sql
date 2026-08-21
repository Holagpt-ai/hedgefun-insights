BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT no_plan();

SELECT is(
  (SELECT count(*)::integer FROM public.journal_trades),
  4,
  'all four legacy trades remain after upgrade'
);

SELECT is(
  (SELECT count(*)::integer FROM public.journal_notes WHERE id = 'd1111111-1111-4111-8111-000000000001'),
  1,
  'legacy note remains'
);

SELECT is(
  (SELECT count(*)::integer FROM public.journal_stats_cache WHERE id = 'd2222222-2222-4222-8222-000000000001'),
  1,
  'stats cache remains'
);

SELECT is(
  (SELECT count(*)::integer FROM public.journal_equity_snapshots WHERE id = 'e1111111-1111-4111-8111-0000000000e1'),
  1,
  'equity snapshot remains'
);

SELECT is(
  (SELECT entry_date FROM public.journal_trades WHERE id = 'c1111111-1111-4111-8111-0000000000c1'),
  '2026-07-01 13:32:00+00'::timestamptz,
  'NVDA entry timestamptz is unchanged'
);

SELECT is(
  (SELECT exit_date FROM public.journal_trades WHERE id = 'c1111111-1111-4111-8111-0000000000c1'),
  '2026-07-01 17:40:00+00'::timestamptz,
  'NVDA exit timestamptz is unchanged'
);

SELECT is(
  (SELECT entry_date FROM public.journal_trades WHERE id = 'c2222222-2222-4222-8222-0000000000c4'),
  '2026-07-04 15:00:00+00'::timestamptz,
  'MSFT entry timestamptz is unchanged'
);

SELECT ok(
  (
    SELECT bool_and(convalidated)
    FROM pg_constraint
    WHERE conrelid = 'public.journal_trades'::regclass
  ),
  'journal_trades constraints remain valid'
);

-- ---------------------------------------------------------------------------
-- Applying migrations must not auto-backfill seeded legacy Journal trades.
-- ---------------------------------------------------------------------------

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.journal_trades
    WHERE id IN (
      'c1111111-1111-4111-8111-0000000000c1',
      'c1111111-1111-4111-8111-0000000000c2',
      'c1111111-1111-4111-8111-0000000000c3',
      'c2222222-2222-4222-8222-0000000000c4'
    )
      AND account_id IS NOT NULL
  ),
  0,
  'migrations do not attach accounts to seeded legacy trades'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.journal_accounts
    WHERE user_id IN (
      'a1111111-1111-4111-8111-0000000000aa',
      'b2222222-2222-4222-8222-0000000000bb'
    )
  ),
  0,
  'migrations do not create backfilled accounts for seeded users'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.journal_executions
    WHERE trade_id IN (
      'c1111111-1111-4111-8111-0000000000c1',
      'c1111111-1111-4111-8111-0000000000c2',
      'c1111111-1111-4111-8111-0000000000c3',
      'c2222222-2222-4222-8222-0000000000c4'
    )
  ),
  0,
  'migrations do not create executions for seeded legacy trades'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.journal_executions
    WHERE source = 'synthetic_backfill'
      AND trade_id IN (
        'c1111111-1111-4111-8111-0000000000c1',
        'c1111111-1111-4111-8111-0000000000c2',
        'c1111111-1111-4111-8111-0000000000c3',
        'c2222222-2222-4222-8222-0000000000c4'
      )
  ),
  0,
  'no synthetic_backfill executions exist before the operator backfill'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.journal_trades', 'TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.journal_notes', 'TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.journal_equity_snapshots', 'TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.journal_stats_cache', 'TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.journal_imports', 'TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.journal_trades', 'REFERENCES')
  AND NOT has_table_privilege('authenticated', 'public.journal_notes', 'TRIGGER')
  AND (
    CASE
      WHEN current_setting('server_version_num')::integer < 170000 THEN true
      ELSE NOT has_table_privilege('authenticated', 'public.journal_trades', 'MAINTAIN')
    END
  )
  AND has_table_privilege('authenticated', 'public.journal_trades', 'SELECT')
  AND has_table_privilege('authenticated', 'public.journal_trades', 'INSERT')
  AND has_table_privilege('authenticated', 'public.journal_trades', 'UPDATE')
  AND has_table_privilege('authenticated', 'public.journal_trades', 'DELETE'),
  'legacy ACL hardening removed elevated authenticated grants and kept CRUD'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.journal_trades
    WHERE id IN (
      'c1111111-1111-4111-8111-0000000000c1',
      'c1111111-1111-4111-8111-0000000000c2',
      'c1111111-1111-4111-8111-0000000000c3',
      'c2222222-2222-4222-8222-0000000000c4'
    )
      AND account_id IS NULL
  ),
  4,
  'four legacy account_id values remain NULL after ACL hardening'
);

-- ---------------------------------------------------------------------------
-- Operator-controlled backfill. A null argument scopes every user because
-- auth.uid() is also null in this operator/session context.
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE backfill_first AS
SELECT public.journal_backfill_accounts_and_executions(NULL) AS payload;

SELECT is(
  (SELECT (payload->>'opening_executions')::integer FROM backfill_first),
  4,
  'explicit operator backfill creates one opening execution per seeded trade'
);

SELECT is(
  (SELECT (payload->>'closing_executions')::integer FROM backfill_first),
  3,
  'explicit operator backfill creates closing executions for the three closed trades'
);

SELECT ok(
  (
    SELECT count(*) FILTER (WHERE account_id IS NOT NULL) = 4
    FROM public.journal_trades
  ),
  'accounts were created and attached where required'
);

SELECT ok(
  (
    SELECT count(*) >= 1
    FROM public.journal_accounts
    WHERE user_id = 'a1111111-1111-4111-8111-0000000000aa'
  ),
  'user A has a backfilled account'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.journal_executions e
    JOIN public.journal_trades t ON t.id = e.trade_id
    WHERE t.id = 'c1111111-1111-4111-8111-0000000000c1'
  ),
  2,
  'closed NVDA received synthetic open and close executions'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.journal_executions e
    WHERE e.trade_id = 'c1111111-1111-4111-8111-0000000000c3'
  ),
  1,
  'open TSLA received a synthetic opening execution only'
);

SELECT ok(
  (
    SELECT bool_and(source = 'synthetic_backfill')
    FROM public.journal_executions
    WHERE trade_id IN (
      'c1111111-1111-4111-8111-0000000000c1',
      'c1111111-1111-4111-8111-0000000000c2',
      'c1111111-1111-4111-8111-0000000000c3',
      'c2222222-2222-4222-8222-0000000000c4'
    )
  ),
  'generated records are marked synthetic_backfill'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.journal_trades t
    WHERE NOT EXISTS (
      SELECT 1 FROM public.journal_executions e WHERE e.trade_id = t.id
    )
  ),
  'existing trades do not become missing_executions after operator backfill'
);

SELECT is(
  (public.journal_backfill_accounts_and_executions(NULL)->>'opening_executions')::integer,
  0,
  'second backfill inserts no additional opening executions'
);

SELECT is(
  (SELECT count(*)::integer FROM public.journal_executions),
  (
    SELECT count(*)::integer FROM public.journal_executions e
    WHERE e.trade_id IN (
      SELECT id FROM public.journal_trades
    )
  ),
  'backfill is idempotent and does not duplicate executions'
);

SELECT is(
  (SELECT body FROM public.journal_notes WHERE id = 'd1111111-1111-4111-8111-000000000001'),
  'Legacy NVDA note must survive upgrade.',
  'unrelated note text is not removed or rewritten'
);

SELECT is(
  (SELECT total_pnl FROM public.journal_stats_cache WHERE id = 'd2222222-2222-4222-8222-000000000001'),
  560::numeric,
  'unrelated stats cache is not removed'
);

SELECT * FROM finish();
ROLLBACK;
