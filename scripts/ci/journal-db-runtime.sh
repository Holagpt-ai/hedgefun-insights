#!/usr/bin/env bash
# Disposable GitHub-hosted Supabase Postgres for Journal runtime tests.
# Does not link, login, push, deploy, or use production secrets/--db-url/--linked.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

MODE="${1:-}"
if [[ "$MODE" != "clean" && "$MODE" != "legacy" && "$MODE" != "m1" && "$MODE" != "parity" ]]; then
  echo "usage: $0 clean|legacy|m1|parity" >&2
  exit 2
fi

JOURNAL_PATTERN="$ROOT/supabase/migrations/20260816191*.sql"
POLICY_PATTERN="$ROOT/supabase/migrations/202608161912*.sql"
FUNCTION_PATTERN="$ROOT/supabase/migrations/202608161913*.sql"
BASELINE_DIR="$ROOT/scripts/journal/approved-baseline"

HELD="$(mktemp -d)"
DB_CONTAINER=""
STUB="$ROOT/supabase/migrations/20260611180000_ci_disposable_prereqs.sql"

cleanup() {
  rm -f "$STUB"
  if [[ -d "$HELD" ]]; then
    shopt -s nullglob
    mv "$HELD"/2026081619*.sql "$ROOT/supabase/migrations/" 2>/dev/null || true
    rm -f "$ROOT/supabase/migrations/20260816190000_journal_foundation_schema.sql"
    rm -f "$ROOT/supabase/migrations/20260816190100_journal_rls_storage.sql"
    rm -f "$ROOT/supabase/migrations/20260816190200_journal_functions_backfill.sql"
    rmdir "$HELD" 2>/dev/null || true
  fi
  git -C "$ROOT" checkout -- \
    supabase/migrations/20260720201554_w2r1_convert_crons_to_vault.sql \
    supabase/migrations/20260724190808_71a26e1f-4b2f-4f11-a8b9-8ab5145bf9df.sql \
    >/dev/null 2>&1 || true
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

dump_journal_catalog() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -A -t <<'SQL'
SELECT 'col|' || n.nspname || '.' || c.relname || '|' || a.attname || '|' || pg_catalog.format_type(a.atttypid, a.atttypmod)
  || '|notnull=' || (NOT a.attnotnull)::text
  || '|identity=' || a.attidentity::text
  || '|generated=' || a.attgenerated::text
  || '|def=' || coalesce(pg_get_expr(ad.adbin, ad.adrelid), '')
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'journal_%'
  AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY 1;

SELECT 'con|' || n.nspname || '.' || c.relname || '|' || x.conname || '|' || x.contype::text || '|' || pg_get_constraintdef(x.oid)
FROM pg_constraint x
JOIN pg_class c ON c.oid = x.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname LIKE 'journal_%'
ORDER BY 1;

SELECT 'idx|' || schemaname || '.' || tablename || '|' || indexname || '|' || indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename LIKE 'journal_%'
ORDER BY 1;

SELECT 'trg|' || n.nspname || '.' || c.relname || '|' || t.tgname || '|' || pg_get_triggerdef(t.oid)
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname LIKE 'journal_%' AND NOT t.tgisinternal
ORDER BY 1;

SELECT 'rls|' || n.nspname || '.' || c.relname || '|enabled=' || c.relrowsecurity::text || '|forced=' || c.relforcerowsecurity::text
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'journal_%'
ORDER BY 1;

SELECT 'pol|' || schemaname || '.' || tablename || '|' || policyname || '|' || cmd || '|' || roles::text
  || '|using=' || coalesce(qual, '') || '|check=' || coalesce(with_check, '')
FROM pg_policies
WHERE (schemaname = 'public' AND tablename LIKE 'journal_%')
   OR (schemaname = 'storage' AND policyname LIKE 'journal_private_%')
ORDER BY 1;

SELECT 'acl|' || n.nspname || '.' || c.relname || '|' || coalesce(c.relacl::text, '')
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'journal_%'
ORDER BY 1;

SELECT 'fn|' || p.proname || '|' || pg_get_function_identity_arguments(p.oid)
  || '|vol=' || p.provolatile::text || '|sec=' || p.prosecdef::text || '|path=' || coalesce(p.proconfig::text, '')
  || '|acl=' || coalesce(p.proacl::text, '')
  || '|def=' || pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'journal_%'
ORDER BY 1;

SELECT 'defacl|' || pg_get_userbyid(d.defaclrole) || '|' || d.defaclobjtype || '|' || d.defaclacl::text
FROM pg_default_acl d
JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE n.nspname = 'public'
ORDER BY 1;

SELECT 'counts|accounts=' || (SELECT count(*) FROM public.journal_accounts)
  || '|executions=' || (SELECT count(*) FROM public.journal_executions)
  || '|trades=' || (SELECT count(*) FROM public.journal_trades);
SQL
}

if [[ "$MODE" == "parity" ]]; then
  echo "==> old-vs-new schema parity on disposable databases"
  write_disposable_prereqs
  rewrite_hardcoded_cron_jobids
  echo "==> applying approved baseline three-file sequence"
  shopt -s nullglob
  mv $JOURNAL_PATTERN "$HELD/"
  shopt -u nullglob
  cp "$BASELINE_DIR/"*.sql "$ROOT/supabase/migrations/"
  supabase db start
  DB_CONTAINER="$(db_container)"
  dump_journal_catalog > /tmp/journal-catalog-old.txt
  supabase stop --no-backup >/dev/null 2>&1 || true
  rm -f "$ROOT/supabase/migrations/20260816190000_journal_foundation_schema.sql"
  rm -f "$ROOT/supabase/migrations/20260816190100_journal_rls_storage.sql"
  rm -f "$ROOT/supabase/migrations/20260816190200_journal_functions_backfill.sql"
  shopt -s nullglob
  mv "$HELD"/20260816191*.sql "$ROOT/supabase/migrations/"
  shopt -u nullglob
  echo "==> applying runner-native Journal sequence"
  write_disposable_prereqs
  rewrite_hardcoded_cron_jobids
  supabase db start
  DB_CONTAINER="$(db_container)"
  dump_journal_catalog > /tmp/journal-catalog-new.txt
  if ! diff -u /tmp/journal-catalog-old.txt /tmp/journal-catalog-new.txt; then
    echo "old-vs-new journal catalog mismatch" >&2
    exit 1
  fi
  echo "==> old-vs-new catalog match"
  exit 0
fi

if [[ "$MODE" == "legacy" ]]; then
  echo "==> holding Journal migrations to reset through 20260814180000"
  shopt -s nullglob
  mv $JOURNAL_PATTERN "$HELD/"
  shopt -u nullglob
elif [[ "$MODE" == "m1" ]]; then
  echo "==> holding policy and function migrations so the database stops after foundation"
  shopt -s nullglob
  mv $POLICY_PATTERN "$HELD/" 2>/dev/null || true
  mv $FUNCTION_PATTERN "$HELD/" 2>/dev/null || true
  shopt -u nullglob
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
  echo "==> running runner integrity pgTAP tests"
  supabase test db --local supabase/tests/database/journal_runner_integrity.test.sql
  echo "==> clean-database job passed"
  exit 0
fi

if [[ "$MODE" == "m1" ]]; then
  echo "==> running Migration 1 fail-closed pgTAP tests"
  supabase test db --local supabase/tests/database/journal_m1_failclosed.test.sql
  echo "==> running foundation batch-failure pgTAP tests"
  supabase test db --local supabase/tests/database/journal_foundation_batch_failure.test.sql
  echo "==> m1-only job passed"
  exit 0
fi

echo "==> loading legacy Journal seed"
apply_sql_file "$ROOT/supabase/tests/fixtures/journal_legacy_seed.sql"

echo "==> applying pending Journal migrations in version order"
shopt -s nullglob
mapfile -t JOURNAL_HELD < <(ls "$HELD"/20260816191*.sql | sort)
shopt -u nullglob
for f in "${JOURNAL_HELD[@]}"; do
  echo "==> applying $(basename "$f")"
  apply_sql_file "$f"
done

echo "==> running legacy-upgrade pgTAP tests"
supabase test db --local supabase/tests/database/journal_legacy_upgrade.test.sql
echo "==> legacy-upgrade job passed"
