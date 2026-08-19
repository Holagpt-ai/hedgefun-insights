BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT no_plan();

CREATE OR REPLACE FUNCTION journal_ci_auth(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION journal_ci_user(p_id uuid, p_email text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    p_id, 'authenticated', 'authenticated', p_email,
    '$2a$10$ci.placeholder.hash.value.zzzzzz', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', ''
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION journal_ci_stock_payload(
  p_id uuid,
  p_symbol text,
  p_side text,
  p_qty numeric,
  p_entry numeric,
  p_exit numeric,
  p_entry_at timestamptz,
  p_exit_at timestamptz,
  p_commission numeric,
  p_stop numeric,
  p_size numeric,
  p_asset text DEFAULT 'stock',
  p_instrument text DEFAULT 'share',
  p_open_action text DEFAULT 'buy',
  p_close_action text DEFAULT 'sell',
  p_open_qty numeric DEFAULT NULL,
  p_close_qty numeric DEFAULT NULL,
  p_multiplier numeric DEFAULT 1
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_open numeric := coalesce(p_open_qty, p_qty);
  v_close numeric := coalesce(p_close_qty, p_qty);
  v_half numeric := p_commission / 2.0;
  v_in uuid := gen_random_uuid();
  v_out uuid := gen_random_uuid();
  v_execs jsonb;
BEGIN
  v_execs := jsonb_build_array(
    jsonb_build_object(
      'id', v_in,
      'occurred_at', p_entry_at,
      'occurred_at_utc', p_entry_at,
      'timezone', 'America/New_York',
      'action', p_open_action,
      'quantity', v_open,
      'price', p_entry,
      'multiplier', p_multiplier,
      'commission', v_half,
      'fee_currency', 'USD',
      'idempotency_key', 'save:' || p_id::text || ':' || v_in::text,
      'sequence_index', 0,
      'fees', jsonb_build_array(jsonb_build_object(
        'kind', 'commission', 'amount', v_half, 'currency', 'USD',
        'account_currency_amount', v_half
      ))
    )
  );
  IF p_exit IS NOT NULL AND p_exit_at IS NOT NULL THEN
    v_execs := v_execs || jsonb_build_array(
      jsonb_build_object(
        'id', v_out,
        'occurred_at', p_exit_at,
        'occurred_at_utc', p_exit_at,
        'timezone', 'America/New_York',
        'action', p_close_action,
        'quantity', v_close,
        'price', p_exit,
        'multiplier', p_multiplier,
        'commission', v_half,
        'fee_currency', 'USD',
        'idempotency_key', 'save:' || p_id::text || ':' || v_out::text,
        'sequence_index', 1,
        'fees', jsonb_build_array(jsonb_build_object(
          'kind', 'commission', 'amount', v_half, 'currency', 'USD',
          'account_currency_amount', v_half
        ))
      )
    );
  END IF;
  RETURN jsonb_build_object(
    'trade', jsonb_build_object(
      'id', p_id,
      'symbol', p_symbol,
      'side', p_side,
      'status', CASE WHEN p_exit IS NULL THEN 'open' ELSE 'closed' END,
      'lifecycle_status', CASE WHEN p_exit IS NULL THEN 'open' ELSE 'closed' END,
      'qty', p_size,
      'entry_price', p_entry,
      'exit_price', p_exit,
      'entry_date', p_entry_at,
      'exit_date', p_exit_at,
      'session_date', (p_entry_at AT TIME ZONE 'America/New_York')::date,
      'timezone', 'America/New_York',
      'asset_class', p_asset,
      'instrument', p_instrument,
      'direction', p_side,
      'planned_entry', p_entry,
      'planned_stop', p_stop,
      'planned_size', p_size,
      'calculation_version', 'journal-calc.v1',
      'source', 'manual',
      'import_job_id', NULL
    ),
    'account', jsonb_build_object('id', NULL, 'name', 'Primary Account'),
    'plan', jsonb_build_object(
      'planned_entry', p_entry,
      'planned_stop', p_stop,
      'planned_size', p_size
    ),
    'legs', '[]'::jsonb,
    'executions', v_execs,
    'lifecycle', jsonb_build_object('status', CASE WHEN p_exit IS NULL THEN 'open' ELSE 'closed' END),
    'calculation', jsonb_build_object(
      'calculation_version', 'journal-calc.v1',
      'input_version', 'journal-input.v1',
      'state', 'complete',
      'result', '{}'::jsonb
    ),
    'audit', jsonb_build_object('event_type', 'journal_ci', 'timestamp', now(), 'exclusions', '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION journal_ci_auth(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION journal_ci_stock_payload(uuid, text, text, numeric, numeric, numeric, timestamptz, timestamptz, numeric, numeric, numeric, text, text, text, text, numeric, numeric, numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- Schema / functions / storage
-- ---------------------------------------------------------------------------

SELECT ok(
  (
    SELECT count(*) = 0
    FROM unnest(ARRAY[
      'journal_trades', 'journal_notes', 'journal_stats_cache', 'journal_equity_snapshots',
      'journal_accounts', 'journal_executions', 'journal_execution_fees', 'journal_trade_plans',
      'journal_trade_legs', 'journal_calculation_runs', 'journal_import_jobs', 'journal_import_rows',
      'journal_event_outbox'
    ]) AS t(name)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t.name AND c.relkind = 'r'
    )
  ),
  'required journal tables exist'
);

SELECT ok(
  (
    SELECT bool_and(c.relrowsecurity)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'journal_%'
  ),
  'every journal_* table has RLS enabled'
);

SELECT has_function('public', 'journal_save_trade_v1', ARRAY['jsonb']);
SELECT has_function('public', 'journal_calculate_trade_v1', ARRAY['uuid']);
SELECT has_function('public', 'journal_import_start_v1', ARRAY['jsonb']);
SELECT has_function('public', 'journal_import_row_v1', ARRAY['uuid', 'uuid', 'jsonb']);
SELECT has_function('public', 'journal_import_finalize_v1', ARRAY['uuid']);
SELECT has_function('public', 'journal_import_rollback', ARRAY['uuid']);
SELECT has_function('public', 'journal_backfill_accounts_and_executions', ARRAY['uuid']);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'journal_executions_idempotency_key_uidx'
  ),
  'execution idempotency unique index exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'journal_import_rows_imported_identity_uidx'
  ),
  'imported identity unique index exists'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.journal_save_trade_v1(jsonb)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.journal_import_start_v1(jsonb)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.journal_import_rollback(uuid)', 'EXECUTE'),
  'authenticated can execute save/import/rollback'
);

SELECT ok(
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'journal-private' AND public = false),
  'journal-private bucket exists and is not public'
);

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

SELECT journal_ci_user('11111111-1111-4111-8111-0000000000aa', 'journal-a@example.test');
SELECT journal_ci_user('22222222-2222-4222-8222-0000000000bb', 'journal-b@example.test');

CREATE TEMP TABLE ci_ids (
  nvda uuid,
  fail uuid,
  over uuid,
  aapl uuid,
  spy uuid,
  btc uuid,
  partial uuid,
  mult uuid,
  manual uuid,
  job uuid,
  row_id uuid
);
INSERT INTO ci_ids VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
  'aaaaaaaa-aaaa-4aaa-8aaa-000000000003',
  'aaaaaaaa-aaaa-4aaa-8aaa-000000000004',
  'aaaaaaaa-aaaa-4aaa-8aaa-000000000005',
  'aaaaaaaa-aaaa-4aaa-8aaa-000000000006',
  'aaaaaaaa-aaaa-4aaa-8aaa-000000000007',
  'aaaaaaaa-aaaa-4aaa-8aaa-000000000008',
  'aaaaaaaa-aaaa-4aaa-8aaa-000000000009',
  NULL, NULL
);

GRANT SELECT, UPDATE ON ci_ids TO authenticated;

-- ---------------------------------------------------------------------------
-- Atomic NVDA save + calculation
-- ---------------------------------------------------------------------------

SELECT journal_ci_auth('11111111-1111-4111-8111-0000000000aa');
SET LOCAL ROLE authenticated;

SELECT ok(
  (public.journal_save_trade_v1(
    jsonb_build_object(
      'trade', jsonb_build_object(
        'id', (SELECT nvda FROM ci_ids),
        'symbol', 'NVDA',
        'side', 'long',
        'status', 'closed',
        'lifecycle_status', 'closed',
        'qty', 100,
        'entry_price', 118.4,
        'exit_price', 122.88,
        'entry_date', '2026-08-14T13:32:00Z',
        'exit_date', '2026-08-14T17:40:00Z',
        'session_date', '2026-08-14',
        'timezone', 'America/New_York',
        'asset_class', 'stock',
        'instrument', 'share',
        'direction', 'long',
        'planned_entry', 118.4,
        'planned_stop', 116.3,
        'planned_target', 124.5,
        'planned_size', 100,
        'calculation_version', 'journal-calc.v1',
        'source', 'manual'
      ),
      'account', jsonb_build_object('id', NULL, 'name', 'Primary Account'),
      'plan', jsonb_build_object(
        'planned_entry', 118.4, 'planned_stop', 116.3, 'planned_target', 124.5, 'planned_size', 100
      ),
      'legs', '[]'::jsonb,
      'executions', jsonb_build_array(
        jsonb_build_object(
          'id', gen_random_uuid(),
          'occurred_at', '2026-08-14T13:32:00Z',
          'occurred_at_utc', '2026-08-14T13:32:00Z',
          'timezone', 'America/New_York',
          'action', 'buy', 'quantity', 100, 'price', 118.4, 'multiplier', 1,
          'commission', 4, 'fee_currency', 'USD', 'sequence_index', 0,
          'idempotency_key', 'nvda-in',
          'fees', jsonb_build_array(jsonb_build_object('kind','commission','amount',4,'currency','USD','account_currency_amount',4))
        ),
        jsonb_build_object(
          'id', gen_random_uuid(),
          'occurred_at', '2026-08-14T15:10:00Z',
          'occurred_at_utc', '2026-08-14T15:10:00Z',
          'timezone', 'America/New_York',
          'action', 'sell', 'quantity', 50, 'price', 121.2, 'multiplier', 1,
          'commission', 2, 'fee_currency', 'USD', 'sequence_index', 1,
          'idempotency_key', 'nvda-out-1',
          'fees', jsonb_build_array(jsonb_build_object('kind','commission','amount',2,'currency','USD','account_currency_amount',2))
        ),
        jsonb_build_object(
          'id', gen_random_uuid(),
          'occurred_at', '2026-08-14T17:40:00Z',
          'occurred_at_utc', '2026-08-14T17:40:00Z',
          'timezone', 'America/New_York',
          'action', 'sell', 'quantity', 50, 'price', 124.56, 'multiplier', 1,
          'commission', 2, 'fee_currency', 'USD', 'sequence_index', 2,
          'idempotency_key', 'nvda-out-2',
          'fees', jsonb_build_array(jsonb_build_object('kind','commission','amount',2,'currency','USD','account_currency_amount',2))
        )
      ),
      'lifecycle', jsonb_build_object('status', 'closed'),
      'calculation', jsonb_build_object('calculation_version','journal-calc.v1','input_version','journal-input.v1','state','complete','result','{}'::jsonb),
      'audit', jsonb_build_object('event_type','save','timestamp', now())
    )
  )->>'ok')::boolean,
  'atomic NVDA full-graph save succeeds'
);

SELECT is(
  (public.journal_calculate_trade_v1((SELECT nvda FROM ci_ids))->>'gross_pnl')::numeric,
  448::numeric,
  'NVDA gross is 448'
);
SELECT is(
  (public.journal_calculate_trade_v1((SELECT nvda FROM ci_ids))->>'fees')::numeric,
  8::numeric,
  'NVDA fees are 8 and not double-counted'
);
SELECT is(
  (public.journal_calculate_trade_v1((SELECT nvda FROM ci_ids))->>'net_pnl')::numeric,
  440::numeric,
  'NVDA net is 440'
);
SELECT is(
  (public.journal_calculate_trade_v1((SELECT nvda FROM ci_ids))->>'initial_risk')::numeric,
  210::numeric,
  'NVDA planned risk is 210'
);
SELECT ok(
  abs(
    (public.journal_calculate_trade_v1((SELECT nvda FROM ci_ids))->>'r_multiple')::numeric
    - (440.0 / 210.0)
  ) < 0.0000001,
  'NVDA raw R is 440/210'
);

-- ---------------------------------------------------------------------------
-- FIFO AAPL, option, crypto, partial, multipliers
-- ---------------------------------------------------------------------------

SELECT ok(
  (public.journal_save_trade_v1(
    journal_ci_stock_payload(
      (SELECT aapl FROM ci_ids), 'AAPL', 'long', 100, 215.8, 217.08,
      '2026-08-14T14:12:00Z'::timestamptz, '2026-08-14T18:01:00Z'::timestamptz,
      8, 214.88, 100
    )
  )->>'ok')::boolean,
  'FIFO AAPL save succeeds'
);
SELECT is(
  (public.journal_calculate_trade_v1((SELECT aapl FROM ci_ids))->>'net_pnl')::numeric,
  120::numeric,
  'FIFO AAPL net is 120'
);

SELECT ok(
  (public.journal_save_trade_v1(
    journal_ci_stock_payload(
      (SELECT spy FROM ci_ids), 'SPY', 'long', 5, 3.2, 4.52,
      '2026-08-14T13:45:00Z'::timestamptz, '2026-08-14T16:05:00Z'::timestamptz,
      10, 2.78, 5, 'equity_option', 'option', 'buy', 'sell', 5, 5, 100
    )
  )->>'ok')::boolean,
  'option save succeeds'
);
SELECT is(
  (public.journal_calculate_trade_v1((SELECT spy FROM ci_ids))->>'gross_pnl')::numeric,
  660::numeric,
  'option multiplier 100 produces gross 660'
);

SELECT ok(
  (public.journal_save_trade_v1(
    journal_ci_stock_payload(
      (SELECT btc FROM ci_ids), 'BTC-USD', 'long', 0.25, 64000, 64640,
      '2026-08-14T12:00:00Z'::timestamptz, '2026-08-14T19:00:00Z'::timestamptz,
      16, 63500, 0.25, 'crypto_spot', 'spot'
    )
  )->>'ok')::boolean,
  'crypto spot save succeeds'
);
SELECT is(
  (public.journal_calculate_trade_v1((SELECT btc FROM ci_ids))->>'gross_pnl')::numeric,
  160::numeric,
  'crypto fractional gross is 160'
);

SELECT ok(
  (public.journal_save_trade_v1(
    journal_ci_stock_payload(
      (SELECT partial FROM ci_ids), 'AAPL', 'long', 100, 215.8, 217.08,
      '2026-08-14T14:12:00Z'::timestamptz, '2026-08-14T18:01:00Z'::timestamptz,
      8, 214.88, 100, 'stock', 'share', 'buy', 'sell', 100, 40, 1
    )
  )->>'ok')::boolean,
  'partial close save succeeds'
);
SELECT is(
  (public.journal_calculate_trade_v1((SELECT partial FROM ci_ids))->>'remaining_qty')::numeric,
  60::numeric,
  'partial close keeps remaining quantity 60'
);

SELECT ok(
  (public.journal_save_trade_v1(
    jsonb_build_object(
      'trade', jsonb_build_object(
        'id', (SELECT mult FROM ci_ids), 'symbol', 'MSFT', 'side', 'long', 'status', 'closed',
        'lifecycle_status', 'closed', 'qty', 10, 'entry_price', 400, 'exit_price', 410,
        'entry_date', '2026-08-14T14:00:00Z', 'exit_date', '2026-08-14T18:00:00Z',
        'session_date', '2026-08-14', 'timezone', 'America/New_York',
        'asset_class', 'stock', 'instrument', 'share', 'direction', 'long',
        'planned_entry', 400, 'planned_stop', 395, 'planned_size', 10,
        'calculation_version', 'journal-calc.v1', 'source', 'manual'
      ),
      'account', jsonb_build_object('id', NULL, 'name', 'Primary Account'),
      'plan', jsonb_build_object('planned_entry', 400, 'planned_stop', 395, 'planned_size', 10),
      'legs', '[]'::jsonb,
      'executions', jsonb_build_array(
        jsonb_build_object(
          'id', gen_random_uuid(), 'occurred_at', '2026-08-14T14:00:00Z', 'occurred_at_utc', '2026-08-14T14:00:00Z',
          'timezone', 'America/New_York', 'action', 'buy', 'quantity', 10, 'price', 400, 'multiplier', 1,
          'commission', 1, 'sequence_index', 0, 'idempotency_key', 'mult-in',
          'fees', jsonb_build_array(jsonb_build_object('kind','commission','amount',1,'currency','USD','account_currency_amount',1))
        ),
        jsonb_build_object(
          'id', gen_random_uuid(), 'occurred_at', '2026-08-14T18:00:00Z', 'occurred_at_utc', '2026-08-14T18:00:00Z',
          'timezone', 'America/New_York', 'action', 'sell', 'quantity', 10, 'price', 410, 'multiplier', 2,
          'commission', 1, 'sequence_index', 1, 'idempotency_key', 'mult-out',
          'fees', jsonb_build_array(jsonb_build_object('kind','commission','amount',1,'currency','USD','account_currency_amount',1))
        )
      ),
      'lifecycle', jsonb_build_object('status', 'closed'),
      'calculation', jsonb_build_object('calculation_version','journal-calc.v1','input_version','journal-input.v1','state','complete','result','{}'::jsonb),
      'audit', jsonb_build_object('event_type','mult')
    )
  )->>'ok')::boolean,
  'execution-specific multiplier save succeeds'
);
SELECT is(
  (public.journal_calculate_trade_v1((SELECT mult FROM ci_ids))->>'gross_pnl')::numeric,
  200::numeric,
  'execution multipliers are not the last loop value'
);

-- ---------------------------------------------------------------------------
-- Forced child failure and over-exit roll back the graph
-- ---------------------------------------------------------------------------

SELECT throws_ok(
  format(
    $q$SELECT public.journal_save_trade_v1(%L::jsonb)$q$,
    jsonb_build_object(
      'trade', jsonb_build_object(
        'id', (SELECT fail FROM ci_ids),
        'symbol', 'FAIL', 'side', 'long', 'status', 'closed', 'lifecycle_status', 'closed',
        'qty', 1, 'entry_price', 1, 'exit_price', 2,
        'entry_date', '2026-08-14T13:00:00Z', 'exit_date', '2026-08-14T14:00:00Z',
        'session_date', '2026-08-14', 'timezone', 'America/New_York',
        'asset_class', 'stock', 'instrument', 'share', 'direction', 'long',
        'calculation_version', 'journal-calc.v1', 'source', 'manual'
      ),
      'account', jsonb_build_object('id', NULL, 'name', 'Primary Account'),
      'plan', '{}'::jsonb,
      'legs', '[]'::jsonb,
      'executions', jsonb_build_array(
        jsonb_build_object(
          'id', gen_random_uuid(), 'occurred_at', '2026-08-14T13:00:00Z',
          'occurred_at_utc', '2026-08-14T13:00:00Z', 'action', 'buy',
          'quantity', 1, 'price', 1, 'multiplier', 1, 'commission', 0,
          'idempotency_key', 'forced-dup', 'sequence_index', 0, 'fees', '[]'::jsonb
        ),
        jsonb_build_object(
          'id', gen_random_uuid(), 'occurred_at', '2026-08-14T14:00:00Z',
          'occurred_at_utc', '2026-08-14T14:00:00Z', 'action', 'sell',
          'quantity', 1, 'price', 2, 'multiplier', 1, 'commission', 0,
          'idempotency_key', 'forced-dup', 'sequence_index', 1, 'fees', '[]'::jsonb
        )
      ),
      'lifecycle', jsonb_build_object('status', 'closed'),
      'calculation', jsonb_build_object('calculation_version','journal-calc.v1','input_version','journal-input.v1','state','complete','result','{}'::jsonb),
      'audit', jsonb_build_object('event_type','fail')
    )
  ),
  '23505',
  NULL,
  'forced child unique violation raises'
);

SELECT is(
  (SELECT count(*)::integer FROM public.journal_trades WHERE id = (SELECT fail FROM ci_ids)),
  0,
  'forced child failure leaves no partial trade'
);

SELECT throws_ok(
  format(
    $q$SELECT public.journal_save_trade_v1(%L::jsonb)$q$,
    journal_ci_stock_payload(
      (SELECT over FROM ci_ids), 'AAPL', 'long', 100, 215.8, 217.08,
      '2026-08-14T14:12:00Z'::timestamptz, '2026-08-14T18:01:00Z'::timestamptz,
      8, 214.88, 100, 'stock', 'share', 'buy', 'sell', 100, 200, 1
    )
  ),
  'P0001',
  'over_exit_blocked',
  'over-exit raises over_exit_blocked'
);

SELECT is(
  (SELECT count(*)::integer FROM public.journal_trades WHERE id = (SELECT over FROM ci_ids)),
  0,
  'over-exit rolls back the entire graph'
);

-- ---------------------------------------------------------------------------
-- Two-user RLS + storage isolation
-- ---------------------------------------------------------------------------

SELECT is(
  (SELECT count(*)::integer FROM public.journal_trades WHERE user_id = '22222222-2222-4222-8222-0000000000bb'),
  0,
  'user A session cannot see user B trades'
);

RESET ROLE;
SELECT journal_ci_auth('22222222-2222-4222-8222-0000000000bb');
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::integer FROM public.journal_trades),
  0,
  'user B cannot read user A journal trades'
);

SELECT lives_ok(
  format(
    $q$INSERT INTO storage.objects (id, bucket_id, name, owner, metadata)
       VALUES (gen_random_uuid(), 'journal-private', %L, %L::uuid, '{}'::jsonb)$q$,
    '22222222-2222-4222-8222-0000000000bb/imports/b.csv',
    '22222222-2222-4222-8222-0000000000bb'
  ),
  'user B can insert an object under their imports path'
);

SELECT throws_ok(
  format(
    $q$INSERT INTO storage.objects (id, bucket_id, name, owner, metadata)
       VALUES (gen_random_uuid(), 'journal-private', %L, %L::uuid, '{}'::jsonb)$q$,
    '11111111-1111-4111-8111-0000000000aa/imports/stolen.csv',
    '22222222-2222-4222-8222-0000000000bb'
  ),
  NULL,
  NULL,
  'user B cannot insert into user A storage path'
);

RESET ROLE;
SELECT journal_ci_auth('11111111-1111-4111-8111-0000000000aa');
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::integer FROM storage.objects WHERE bucket_id = 'journal-private'),
  0,
  'user A cannot read user B private objects'
);

-- ---------------------------------------------------------------------------
-- Import start / row / finalize / rollback
-- ---------------------------------------------------------------------------

SELECT ok(
  (public.journal_save_trade_v1(
    journal_ci_stock_payload(
      (SELECT manual FROM ci_ids), 'META', 'long', 10, 500, 510,
      '2026-08-14T14:00:00Z'::timestamptz, '2026-08-14T18:00:00Z'::timestamptz,
      2, 495, 10
    )
  )->>'ok')::boolean,
  'manual trade is persisted before import rollback'
);

UPDATE ci_ids
SET job = (s.payload->>'job_id')::uuid,
    row_id = (s.payload->'rows'->0->>'id')::uuid
FROM (
  SELECT public.journal_import_start_v1(
    jsonb_build_object(
      'source', 'csv',
      'filename', 'ci.csv',
      'user_id', 'ignored-client-user-id',
      'rows', jsonb_build_array(jsonb_build_object(
        'row_index', 2,
        'raw', jsonb_build_object('symbol', 'AMD'),
        'parsed', jsonb_build_object('symbol', 'AMD'),
        'identity_key', '11111111-1111-4111-8111-0000000000aa|csv|ext:amd-ci',
        'external_id', 'amd-ci',
        'status', 'pending'
      ))
    )
  ) AS payload
) s;

SELECT ok((SELECT job IS NOT NULL FROM ci_ids), 'import start created a job');

SELECT ok(
  (public.journal_import_row_v1(
    (SELECT job FROM ci_ids),
    (SELECT row_id FROM ci_ids),
    journal_ci_stock_payload(
      gen_random_uuid(), 'AMD', 'long', 20, 140, 150,
      '2026-08-14T14:00:00Z'::timestamptz, '2026-08-14T18:00:00Z'::timestamptz,
      4, 138, 20
    )
  )->>'status') = 'imported',
  'import row persists through journal_save_trade_v1'
);

SELECT is(
  (public.journal_import_finalize_v1((SELECT job FROM ci_ids))->>'imported_count')::integer,
  1,
  'finalize counts imported rows from the database'
);

SELECT is(
  (SELECT count(*)::integer FROM public.journal_trades WHERE import_job_id = (SELECT job FROM ci_ids)),
  1,
  'imported trade carries import_job_id'
);

SELECT is(
  (public.journal_import_rollback((SELECT job FROM ci_ids))->>'trades_deleted')::integer,
  1,
  'rollback deletes imported trades'
);

SELECT is(
  (SELECT count(*)::integer FROM public.journal_trades WHERE import_job_id = (SELECT job FROM ci_ids)),
  0,
  'imported trades are gone after rollback'
);

SELECT is(
  (SELECT count(*)::integer FROM public.journal_trades WHERE id = (SELECT manual FROM ci_ids)),
  1,
  'manual trades survive import rollback'
);

SELECT ok(
  (public.journal_import_rollback((SELECT job FROM ci_ids))->>'already_rolled_back')::boolean,
  'second rollback is idempotent'
);

SELECT is(
  (SELECT status FROM public.journal_import_jobs WHERE id = (SELECT job FROM ci_ids)),
  'rolled_back',
  'import job audit status is rolled_back'
);

RESET ROLE;
SELECT journal_ci_auth('22222222-2222-4222-8222-0000000000bb');
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  format($q$SELECT public.journal_import_rollback(%L::uuid)$q$, (SELECT job FROM ci_ids)),
  '42501',
  'import job not found',
  'user B cannot roll back user A job'
);

RESET ROLE;

-- ---------------------------------------------------------------------------
-- Cross-user journal_notes parent-trade ownership
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE note_ci (
  a_note uuid,
  b_trade uuid,
  mismatch uuid
);
GRANT SELECT, UPDATE ON note_ci TO authenticated;
GRANT SELECT ON note_ci TO service_role;

INSERT INTO note_ci (a_note, mismatch) VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
  'bbbbbbbb-bbbb-4bbb-8bbb-000000000003'
);

WITH ins AS (
  INSERT INTO public.journal_trades (
    user_id, symbol, side, status, qty, entry_price, entry_date
  ) VALUES (
    '22222222-2222-4222-8222-0000000000bb',
    'B', 'long', 'open', 1, 1, now()
  )
  RETURNING id
)
UPDATE note_ci SET b_trade = (SELECT id FROM ins);

SELECT journal_ci_auth('11111111-1111-4111-8111-0000000000aa');
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    $q$INSERT INTO public.journal_notes (id, user_id, trade_id, body)
       VALUES (%L::uuid, '11111111-1111-4111-8111-0000000000aa', %L::uuid, 'owned note')$q$,
    (SELECT a_note FROM note_ci),
    (SELECT nvda FROM ci_ids)
  ),
  'user A can insert a note attached to user A trade'
);

SELECT is(
  (SELECT count(*)::integer FROM public.journal_notes WHERE id = (SELECT a_note FROM note_ci)),
  1,
  'user A can read their valid note'
);

SELECT lives_ok(
  format(
    $q$UPDATE public.journal_notes SET body = 'updated owned note' WHERE id = %L::uuid$q$,
    (SELECT a_note FROM note_ci)
  ),
  'user A can update their valid note'
);

SELECT throws_ok(
  format(
    $q$INSERT INTO public.journal_notes (user_id, trade_id, body)
       VALUES ('11111111-1111-4111-8111-0000000000aa', %L::uuid, 'stolen parent')$q$,
    (SELECT b_trade FROM note_ci)
  ),
  '42501',
  NULL,
  'user A cannot insert a note against user B trade'
);

SELECT throws_ok(
  format(
    $q$UPDATE public.journal_notes SET trade_id = %L::uuid WHERE id = %L::uuid$q$,
    (SELECT b_trade FROM note_ci),
    (SELECT a_note FROM note_ci)
  ),
  '42501',
  NULL,
  'user A cannot retarget a note to user B trade'
);

RESET ROLE;
SET ROLE service_role;
INSERT INTO public.journal_notes (id, user_id, trade_id, body)
VALUES (
  (SELECT mismatch FROM note_ci),
  '11111111-1111-4111-8111-0000000000aa',
  (SELECT b_trade FROM note_ci),
  'mismatched owner and parent'
);
RESET ROLE;
SELECT journal_ci_auth('11111111-1111-4111-8111-0000000000aa');
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::integer FROM public.journal_notes WHERE id = (SELECT mismatch FROM note_ci)),
  0,
  'user A cannot read a mismatched note/parent-trade row'
);

SELECT lives_ok(
  format(
    $q$DELETE FROM public.journal_notes WHERE id = %L::uuid$q$,
    (SELECT mismatch FROM note_ci)
  ),
  'user A delete against a mismatched note is a no-op under RLS'
);

RESET ROLE;
SELECT is(
  (SELECT count(*)::integer FROM public.journal_notes WHERE id = (SELECT mismatch FROM note_ci)),
  1,
  'mismatched row was not deleted by user A'
);

SELECT journal_ci_auth('22222222-2222-4222-8222-0000000000bb');
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::integer FROM public.journal_notes WHERE id = (SELECT a_note FROM note_ci)),
  0,
  'user B cannot access user A valid note'
);

RESET ROLE;
SELECT journal_ci_auth('11111111-1111-4111-8111-0000000000aa');
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  format(
    $q$DELETE FROM public.journal_notes WHERE id = %L::uuid$q$,
    (SELECT a_note FROM note_ci)
  ),
  'user A can delete their valid note'
);

SELECT is(
  (SELECT count(*)::integer FROM public.journal_notes WHERE id = (SELECT a_note FROM note_ci)),
  0,
  'user A valid note is gone after delete'
);

RESET ROLE;

-- ---------------------------------------------------------------------------
-- Fail-closed policy inventory after the complete Journal chain
-- ---------------------------------------------------------------------------

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE grantee = 'anon'
      AND table_schema = 'public'
      AND table_name LIKE 'journal_%'
  ),
  'anon has no Journal table grants'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename LIKE 'journal_%'
      AND policyname NOT LIKE tablename || '_%'
  ),
  'no unexpected leftover Journal policies remain'
);

SELECT ok(
  (
    SELECT bool_and(EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = c.relname
        AND p.policyname = c.relname || '_select_own'
    ))
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname LIKE 'journal_%'
      AND c.relname NOT LIKE 'journal_ci_%'
      AND c.relname NOT LIKE 'journal_rollback_%'
  ),
  'every managed Journal table has its select_own policy'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname IN (
        'journal_private_select_own',
        'journal_private_insert_own',
        'journal_private_update_own',
        'journal_private_delete_own'
      )
  ),
  4,
  'all four journal-private storage policies exist'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.journal_accounts', 'SELECT')
  AND has_table_privilege('authenticated', 'public.journal_accounts', 'INSERT')
  AND has_table_privilege('authenticated', 'public.journal_executions', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.journal_accounts', 'SELECT'),
  'new tables have authenticated grants and no anon access'
);

SELECT ok(
  (
    SELECT bool_and(
      (
        coalesce(qual, '') LIKE '%journal_notes.user_id = auth.uid()%'
        OR coalesce(with_check, '') LIKE '%journal_notes.user_id = auth.uid()%'
      )
      AND (
        coalesce(qual, '') LIKE '%t.id = journal_notes.trade_id%'
        OR coalesce(with_check, '') LIKE '%t.id = journal_notes.trade_id%'
      )
      AND (
        coalesce(qual, '') LIKE '%t.user_id = auth.uid()%'
        OR coalesce(with_check, '') LIKE '%t.user_id = auth.uid()%'
      )
    )
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'journal_notes'
      AND policyname LIKE 'journal_notes_%_own'
  ),
  'journal_notes target policies require parent-trade ownership'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'journal_notes'
      AND cmd = 'UPDATE'
      AND coalesce(qual, '') LIKE '%t.id = journal_notes.trade_id%'
      AND coalesce(with_check, '') LIKE '%t.id = journal_notes.trade_id%'
  ),
  'journal_notes UPDATE keeps parent-trade ownership in USING and WITH CHECK'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname LIKE 'journal_rollback_%'
  ),
  'no public journal_rollback_* checkpoint tables exist'
);

SELECT * FROM finish();
ROLLBACK;
