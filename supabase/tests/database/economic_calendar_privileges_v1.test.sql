BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT no_plan();

SELECT ok(
  to_regclass('public.economic_events') IS NOT NULL,
  'economic_events table exists'
);

SELECT ok(
  to_regclass('public.economic_sync_status') IS NOT NULL,
  'economic_sync_status table exists'
);

SELECT ok(
  has_table_privilege('service_role', 'public.economic_events', 'SELECT')
  AND has_table_privilege('service_role', 'public.economic_events', 'INSERT')
  AND has_table_privilege('service_role', 'public.economic_events', 'UPDATE'),
  'service_role can SELECT/INSERT/UPDATE economic_events'
);

SELECT ok(
  NOT has_table_privilege('service_role', 'public.economic_events', 'DELETE')
  AND NOT has_table_privilege('service_role', 'public.economic_events', 'TRUNCATE'),
  'service_role lacks DELETE/TRUNCATE on economic_events'
);

SELECT ok(
  has_table_privilege('service_role', 'public.economic_sync_status', 'SELECT')
  AND has_table_privilege('service_role', 'public.economic_sync_status', 'INSERT')
  AND has_table_privilege('service_role', 'public.economic_sync_status', 'UPDATE'),
  'service_role can SELECT/INSERT/UPDATE economic_sync_status'
);

SELECT ok(
  has_table_privilege('anon', 'public.economic_events', 'SELECT')
  AND has_table_privilege('authenticated', 'public.economic_events', 'SELECT'),
  'anon and authenticated can SELECT economic_events'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.economic_events', 'INSERT')
  AND NOT has_table_privilege('anon', 'public.economic_events', 'UPDATE')
  AND NOT has_table_privilege('anon', 'public.economic_events', 'DELETE')
  AND NOT has_table_privilege('anon', 'public.economic_events', 'TRUNCATE'),
  'anon cannot write economic_events'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.economic_events', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.economic_events', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.economic_events', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.economic_events', 'TRUNCATE'),
  'authenticated cannot write economic_events'
);

SELECT ok(
  has_table_privilege('anon', 'public.economic_sync_status', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.economic_sync_status', 'INSERT')
  AND NOT has_table_privilege('anon', 'public.economic_sync_status', 'UPDATE')
  AND NOT has_table_privilege('anon', 'public.economic_sync_status', 'DELETE'),
  'anon read-only on economic_sync_status'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.economic_sync_status', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.economic_sync_status', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.economic_sync_status', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.economic_sync_status', 'DELETE'),
  'authenticated read-only on economic_sync_status'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.catalyst_events', 'SELECT'),
  'anon cannot SELECT catalyst_events directly'
);

SELECT ok(
  has_function_privilege(
    'anon',
    'public.public_catalyst_calendar_range_v1(date, date, integer, integer)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'authenticated',
    'public.public_catalyst_calendar_range_v1(date, date, integer, integer)',
    'EXECUTE'
  ),
  'public catalyst calendar RPC callable by anon and authenticated'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'economic_events'
      AND policyname = 'economic_events_public_read'
  )
  AND EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'economic_sync_status'
      AND policyname = 'economic_sync_status_public_read'
  ),
  'economic RLS read policies present'
);

SELECT * FROM finish();
ROLLBACK;