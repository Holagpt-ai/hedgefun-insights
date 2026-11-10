-- Disposable Postgres bootstrap for Radar V22 integration tests (not production).
-- Supabase migrations expect the realtime publication when adding tables.

DO $pub$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END;
$pub$;
