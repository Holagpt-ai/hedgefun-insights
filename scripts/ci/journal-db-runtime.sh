#!/usr/bin/env bash
# Disposable GitHub-hosted Supabase Postgres for Journal runtime tests.
# Does not link, login, push, deploy, or use production secrets/--db-url/--linked.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

MODE="${1:-}"
if [[ "$MODE" != "clean" && "$MODE" != "legacy" && "$MODE" != "m1" ]]; then
  echo "usage: $0 clean|legacy|m1" >&2
  exit 2
fi

HELD="$(mktemp -d)"
DB_CONTAINER=""
STUB="$ROOT/supabase/migrations/20260611180000_ci_disposable_prereqs.sql"

cleanup() {
  rm -f "$STUB"
  if [[ -d "$HELD" ]]; then
    shopt -s nullglob
    mv "$HELD"/2026081619*.sql "$ROOT/supabase/migrations/" 2>/dev/null || true
    rmdir "$HELD" 2>/dev/null || true
  fi
  supabase stop --no-backup >/dev/null 2>&1 || true
}
trap cleanup EXIT

write_disposable_prereqs() {
  # Production created these tables outside this repo's migration history.
  # The disposable runner stubs them so the committed chain can apply.
  # This file is generated at job start and deleted in cleanup; it is not
  # a production migration.
  cat > "$STUB" <<'SQL'
CREATE TABLE IF NOT EXISTS public.daily_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.daily_briefs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.screener_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_id text,
  symbol text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.screener_results ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.game_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

CREATE TABLE IF NOT EXISTS public.game_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code text
);

CREATE TABLE IF NOT EXISTS public.game_leaderboard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  season_id uuid,
  display_name text,
  rank integer,
  total_value numeric,
  total_pnl numeric,
  pnl_pct numeric,
  position_count integer,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.game_portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid
);

CREATE TABLE IF NOT EXISTS public.game_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid
);

CREATE TABLE IF NOT EXISTS public.game_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid
);

CREATE TABLE IF NOT EXISTS public.game_season_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid,
  user_id uuid,
  display_name text,
  final_rank integer,
  final_total_value numeric,
  final_pnl numeric,
  final_pnl_pct numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.watchlist_ai_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text
);
ALTER TABLE public.watchlist_ai_alerts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.watchlist_ai_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text
);
ALTER TABLE public.watchlist_ai_analysis ENABLE ROW LEVEL SECURITY;

-- Production Journal tables exist before 20260731213639, which is earlier
-- than the committed Journal migrations. CREATE TABLE IF NOT EXISTS later
-- is a no-op; 20260816190000 still adds remaining columns.
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
ALTER TABLE public.journal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own trades" ON public.journal_trades;
CREATE POLICY "Users can manage own trades"
  ON public.journal_trades
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own notes" ON public.journal_notes;
CREATE POLICY "Users can manage own notes"
  ON public.journal_notes
  FOR ALL
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.journal_trades t
      WHERE t.id = journal_notes.trade_id AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.journal_trades t
      WHERE t.id = journal_notes.trade_id AND t.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_trades TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_notes TO authenticated;
GRANT ALL ON TABLE public.journal_trades TO service_role;
GRANT ALL ON TABLE public.journal_notes TO service_role;

-- Disposable placeholders so later migrations that inspect Vault at apply
-- time can compile. These are not production credentials.
SELECT vault.create_secret('ci-disposable-not-a-production-secret', 'sync_secret');
SELECT vault.create_secret('ci-disposable-not-a-production-secret-next', 'sync_secret_next');

SELECT cron.schedule('sync-screener-every-5min', '0 0 1 1 *', 'select 1');
SELECT cron.schedule('sync-game-prices', '0 0 1 1 *', 'select 1');

-- Simulate a privately created journal-private bucket so storage.objects
-- policy tests can run. Production creates this through supported Lovable
-- storage tooling, not through Journal migrations.
INSERT INTO storage.buckets (id, name, public)
VALUES ('journal-private', 'journal-private', false)
ON CONFLICT (id) DO UPDATE SET public = false;
SQL
}

rewrite_hardcoded_cron_jobids() {
  # Production cron job ids 25/26 are not reproducible on a fresh runner.
  # Rewrite that one local migration to resolve jobs by name. The committed
  # file is unchanged on the repository.
  python3 - <<'PY'
from pathlib import Path
import re
p = Path("supabase/migrations/20260720201554_w2r1_convert_crons_to_vault.sql")
text = p.read_text()
text = re.sub(
    r"WHERE jobid = 25\s+AND jobname = 'sync-screener-every-5min'",
    "WHERE jobname = 'sync-screener-every-5min'",
    text,
)
text = re.sub(
    r"WHERE jobid = 26\s+AND jobname = 'sync-game-prices'",
    "WHERE jobname = 'sync-game-prices'",
    text,
)
text = text.replace(
    "job_id := 25,",
    "job_id := (SELECT jobid FROM cron.job WHERE jobname = 'sync-screener-every-5min' LIMIT 1),",
)
text = text.replace(
    "job_id := 26,",
    "job_id := (SELECT jobid FROM cron.job WHERE jobname = 'sync-game-prices' LIMIT 1),",
)
if "jobid = 25" in text or "job_id := 25" in text:
    raise SystemExit("failed to rewrite hardcoded cron job ids")
p.write_text(text)
print("rewrote 20260720201554 cron job id guards for disposable CI")

p2 = Path("supabase/migrations/20260724190808_71a26e1f-4b2f-4f11-a8b9-8ab5145bf9df.sql")
p2.write_text(
    """DO $$
DECLARE
  v_id bigint;
BEGIN
  SELECT jobid INTO v_id
  FROM cron.job
  WHERE jobname = 'wl-v2-batch-analysis-10min'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    PERFORM cron.alter_job(job_id := v_id, schedule := '*/5 * * * 1-6');
  END IF;
END $$;
"""
)
print("rewrote 20260724190808 cron job 34 alter for disposable CI")
PY
}

db_container() {
  docker ps --format '{{.Names}}' | grep -E '^supabase_db_' | head -n 1
}

apply_sql_file() {
  local file="$1"
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$file"
}

if [[ "$MODE" == "legacy" ]]; then
  echo "==> holding Journal migrations to reset through 20260814180000"
  mv "$ROOT/supabase/migrations/20260816190000_journal_foundation_schema.sql" "$HELD/"
  mv "$ROOT/supabase/migrations/20260816190100_journal_rls_storage.sql" "$HELD/"
  mv "$ROOT/supabase/migrations/20260816190200_journal_functions_backfill.sql" "$HELD/"
elif [[ "$MODE" == "m1" ]]; then
  echo "==> holding Migrations 2 and 3 so the database stops after fail-closed Migration 1"
  mv "$ROOT/supabase/migrations/20260816190100_journal_rls_storage.sql" "$HELD/"
  mv "$ROOT/supabase/migrations/20260816190200_journal_functions_backfill.sql" "$HELD/"
fi

echo "==> writing disposable prereq stubs for production-only tables"
write_disposable_prereqs
rewrite_hardcoded_cron_jobids

echo "==> starting disposable local database"
supabase db start
DB_CONTAINER="$(db_container)"
if [[ -z "$DB_CONTAINER" ]]; then
  echo "disposable database container was not found" >&2
  exit 1
fi

if [[ "$MODE" == "clean" ]]; then
  echo "==> linting local schema"
  supabase db lint --local
  echo "==> running clean-database pgTAP tests"
  supabase test db --local supabase/tests/database/journal_runtime.test.sql
  echo "==> running Migration 2 failure-injection pgTAP tests"
  supabase test db --local supabase/tests/database/journal_m2_failure_injection.test.sql
  echo "==> clean-database job passed"
  exit 0
fi

if [[ "$MODE" == "m1" ]]; then
  echo "==> running Migration 1 fail-closed pgTAP tests"
  supabase test db --local supabase/tests/database/journal_m1_failclosed.test.sql
  echo "==> m1-only job passed"
  exit 0
fi

echo "==> loading legacy Journal seed"
apply_sql_file "$ROOT/supabase/tests/fixtures/journal_legacy_seed.sql"

echo "==> applying three pending Journal migrations"
apply_sql_file "$HELD/20260816190000_journal_foundation_schema.sql"
apply_sql_file "$HELD/20260816190100_journal_rls_storage.sql"
apply_sql_file "$HELD/20260816190200_journal_functions_backfill.sql"

echo "==> running legacy-upgrade pgTAP tests"
supabase test db --local supabase/tests/database/journal_legacy_upgrade.test.sql
echo "==> legacy-upgrade job passed"
