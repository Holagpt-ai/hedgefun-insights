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
  (SELECT count(*)::integer FROM public.journal_notes WHERE id = 'n1111111-1111-4111-8111-0000000000n1'),
  1,
  'legacy note remains'
);

SELECT is(
  (SELECT count(*)::integer FROM public.journal_stats_cache WHERE id = 's1111111-1111-4111-8111-0000000000s1'),
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
  'existing trades do not become missing_executions after migration'
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
  (SELECT body FROM public.journal_notes WHERE id = 'n1111111-1111-4111-8111-0000000000n1'),
  'Legacy NVDA note must survive upgrade.',
  'unrelated note text is not removed or rewritten'
);

SELECT is(
  (SELECT total_pnl FROM public.journal_stats_cache WHERE id = 's1111111-1111-4111-8111-0000000000s1'),
  560::numeric,
  'unrelated stats cache is not removed'
);

SELECT * FROM finish();
ROLLBACK;
