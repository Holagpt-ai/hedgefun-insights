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

MAP_JSON="$ROOT/scripts/journal/production-migration-map.json"

journal_map_files() {
  local group="${1:-all}"
  node -e '
    const fs = require("fs");
    const map = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const group = process.argv[2];
    for (const s of map.segments) {
      if (group === "all" || s.group === group) process.stdout.write(s.productionFile + "\n");
    }
  ' "$MAP_JSON" "$group"
}

journal_map_kind() {
  node -e '
    const fs = require("fs");
    const map = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const kind = process.argv[2];
    const s = map.segments.find((entry) => entry.kind === kind);
    if (!s) {
      console.error("missing Journal map kind " + kind);
      process.exit(1);
    }
    process.stdout.write(s.productionFile);
  ' "$MAP_JSON" "$1"
}

hold_journal_files() {
  local group="$1"
  mkdir -p "$HELD"
  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    mv "$ROOT/supabase/migrations/$name" "$HELD/"
  done < <(journal_map_files "$group")
}

restore_held_sql() {
  shopt -s nullglob
  mv "$HELD"/*.sql "$ROOT/supabase/migrations/" 2>/dev/null || true
  shopt -u nullglob
}

ACL_HELD_NAME="$(journal_map_kind legacy-acl)"
ACL_FILE="$ROOT/supabase/migrations/$ACL_HELD_NAME"
FN_ACL_HELD_NAME="$(journal_map_kind function-acl)"
FN_ACL_FILE="$ROOT/supabase/migrations/$FN_ACL_HELD_NAME"
FN_ACL_FIXTURE="$ROOT/supabase/tests/fixtures/journal_function_acl_production.sql"
FN_ACL_SANDBOX="sandbox_exec_zcjptaolpumhtlwhlemq"
FN_ACL_SANDBOX_PLAIN="sandbox_exec"
# Function ACL: CREATE OR REPLACE preserves ACLs. DROP+CREATE reapplies
# production default privileges and may restore anon/sandbox EXECUTE.
# Follow any future drop/recreate with 20260821232909 or equivalent revokes.
# Do not change ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public.
FN_CANON_SIGS=(
  "journal_calculate_trade_v1(uuid)"
  "journal_refresh_derived(uuid)"
  "journal_backfill_accounts_and_executions(uuid)"
  "journal_migrate_legacy_trades()"
  "journal_import_rollback(uuid)"
  "journal_save_trade_v1(jsonb)"
  "journal_import_start_v1(jsonb)"
  "journal_import_row_v1(uuid, uuid, jsonb)"
  "journal_import_finalize_v1(uuid)"
)
BASELINE_DIR="$ROOT/scripts/journal/approved-baseline"

echo "==> verifying canonical Journal migration collision guard"
node "$ROOT/scripts/journal/verify-canonical-migrations.mjs"

HELD="$(mktemp -d)"
DB_CONTAINER=""
STUB="$ROOT/supabase/migrations/20260611180000_ci_disposable_prereqs.sql"

cleanup() {
  rm -f "$STUB"
  if [[ -d "$HELD" ]]; then
    restore_held_sql
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

grant_legacy_elevated() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
DO $grant$
BEGIN
  GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE
    public.journal_trades,
    public.journal_notes,
    public.journal_equity_snapshots,
    public.journal_stats_cache,
    public.journal_imports
  TO authenticated;
  IF current_setting('server_version_num')::integer >= 170000 THEN
    EXECUTE $m$
      GRANT MAINTAIN ON TABLE
        public.journal_trades,
        public.journal_notes,
        public.journal_equity_snapshots,
        public.journal_stats_cache,
        public.journal_imports
      TO authenticated
    $m$;
  END IF;
END;
$grant$;
SQL
}

grant_unexpected_accounts_truncate() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
GRANT TRUNCATE ON TABLE public.journal_accounts TO authenticated;
SQL
}

revoke_unexpected_accounts_truncate() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
REVOKE TRUNCATE ON TABLE public.journal_accounts FROM authenticated;
SQL
}

assert_privilege() {
  local role="$1"
  local table="$2"
  local priv="$3"
  local expect="$4"
  local actual
  actual="$(docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -A -t -c \
    "SELECT has_table_privilege('${role}', 'public.${table}', '${priv}')" | tr -d '[:space:]')"
  if [[ "$actual" != "$expect" ]]; then
    echo "expected ${role} ${priv} on ${table} to be ${expect}, got ${actual}" >&2
    exit 1
  fi
}

assert_legacy_elevated() {
  local expect="$1"
  local table
  for table in journal_trades journal_notes journal_equity_snapshots journal_stats_cache journal_imports; do
    assert_privilege authenticated "$table" TRUNCATE "$expect"
    assert_privilege authenticated "$table" REFERENCES "$expect"
    assert_privilege authenticated "$table" TRIGGER "$expect"
  done
}

apply_acl_expect_failure() {
  if apply_sql_file "$ACL_FILE"; then
    echo "ACL hardening was expected to fail closed" >&2
    exit 1
  fi
}

run_acl_failure_injection() {
  echo "==> unexpected elevated privilege must fail before any target revoke"
  grant_legacy_elevated
  grant_unexpected_accounts_truncate
  assert_legacy_elevated t
  assert_privilege authenticated journal_accounts TRUNCATE t
  apply_acl_expect_failure
  assert_legacy_elevated t
  assert_privilege authenticated journal_accounts TRUNCATE t
  revoke_unexpected_accounts_truncate
  echo "==> applying ACL hardening after restoring the approved privilege set"
  apply_sql_file "$ACL_FILE"
  assert_legacy_elevated f
  assert_privilege authenticated journal_trades SELECT t
  echo "==> second ACL hardening execution is idempotent"
  apply_sql_file "$ACL_FILE"
  assert_legacy_elevated f
}

assert_fn_execute() {
  local role="$1"
  local sig="$2"
  local expect="$3"
  local actual
  actual="$(docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -A -t -c \
    "SELECT has_function_privilege('${role}', 'public.${sig}', 'EXECUTE')" | tr -d '[:space:]')"
  if [[ "$actual" != "$expect" ]]; then
    echo "expected ${role} EXECUTE on ${sig} to be ${expect}, got ${actual}" >&2
    exit 1
  fi
}

assert_fn_public_execute() {
  local sig="$1"
  local expect="$2"
  local actual
  actual="$(docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -A -t -c \
    "SELECT EXISTS (
       SELECT 1 FROM pg_proc p
       CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       WHERE p.oid = 'public.${sig}'::regprocedure
         AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
     )" | tr -d '[:space:]')"
  if [[ "$actual" != "$expect" ]]; then
    echo "expected PUBLIC EXECUTE on ${sig} to be ${expect}, got ${actual}" >&2
    exit 1
  fi
}

assert_fn_hardened_all() {
  local sig
  for sig in "${FN_CANON_SIGS[@]}"; do
    assert_fn_public_execute "$sig" f
    assert_fn_execute anon "$sig" f
    assert_fn_execute authenticated "$sig" t
    assert_fn_execute service_role "$sig" t
  done
}

assert_sandbox_fn_execute_all() {
  local expect="$1"
  local sig
  for sig in "${FN_CANON_SIGS[@]}"; do
    assert_fn_execute "$FN_ACL_SANDBOX" "$sig" "$expect"
  done
}

assert_plain_sandbox_no_direct_fn_execute() {
  local actual
  actual="$(docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -A -t -c \
    "SELECT EXISTS (
       SELECT 1
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       JOIN pg_roles g ON g.oid = a.grantee
       WHERE n.nspname = 'public'
         AND p.proname IN (
           'journal_calculate_trade_v1',
           'journal_refresh_derived',
           'journal_backfill_accounts_and_executions',
           'journal_migrate_legacy_trades',
           'journal_import_rollback',
           'journal_save_trade_v1',
           'journal_import_start_v1',
           'journal_import_row_v1',
           'journal_import_finalize_v1'
         )
         AND g.rolname = '${FN_ACL_SANDBOX_PLAIN}'
         AND a.privilege_type = 'EXECUTE'
     )" | tr -d '[:space:]')"
  if [[ "$actual" != "f" ]]; then
    echo "plain sandbox_exec has direct EXECUTE on a canonical Journal function" >&2
    exit 1
  fi
}

assert_plain_sandbox_no_fn_execute() {
  local sig
  assert_plain_sandbox_no_direct_fn_execute
  for sig in "${FN_CANON_SIGS[@]}"; do
    assert_fn_execute "$FN_ACL_SANDBOX_PLAIN" "$sig" f
  done
}

dump_sandbox_table_acl() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -A -t <<'SQL'
SELECT 'tblacl|' || c.relname || '|' || g.rolname || '|' || a.privilege_type
  || '|grantable=' || a.is_grantable::text
  || '|grantor=' || pg_get_userbyid(a.grantor)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, ARRAY[]::aclitem[])) a
JOIN pg_roles g ON g.oid = a.grantee
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname LIKE 'journal_%'
  AND g.rolname IN ('sandbox_exec', 'sandbox_exec_zcjptaolpumhtlwhlemq')
ORDER BY 1;
SQL
}

assert_sandbox_table_acl_footprint() {
  local role="$1"
  local actual
  actual="$(docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -A -t -c \
    "SELECT count(*)::text
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, ARRAY[]::aclitem[])) a
     JOIN pg_roles g ON g.oid = a.grantee
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relname LIKE 'journal_%'
       AND g.rolname = '${role}'
       AND a.privilege_type IN ('SELECT', 'INSERT')
       AND NOT a.is_grantable
       AND pg_get_userbyid(a.grantor) = 'postgres'" | tr -d '[:space:]')"
  if [[ "$actual" != "154" ]]; then
    echo "expected 154 SELECT/INSERT ${role} table ACL entries, got ${actual}" >&2
    exit 1
  fi
  actual="$(docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -A -t -c \
    "SELECT EXISTS (
       SELECT 1
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, ARRAY[]::aclitem[])) a
       JOIN pg_roles g ON g.oid = a.grantee
       WHERE n.nspname = 'public'
         AND c.relkind = 'r'
         AND c.relname LIKE 'journal_%'
         AND g.rolname = '${role}'
         AND (
           a.privilege_type NOT IN ('SELECT', 'INSERT')
           OR a.is_grantable
           OR pg_get_userbyid(a.grantor) IS DISTINCT FROM 'postgres'
         )
     )" | tr -d '[:space:]')"
  if [[ "$actual" != "f" ]]; then
    echo "${role} has an unexpected Journal table ACL entry" >&2
    exit 1
  fi
}

restore_long_sandbox_trades_acl() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
REVOKE ALL ON TABLE public.journal_trades FROM sandbox_exec_zcjptaolpumhtlwhlemq;
GRANT SELECT, INSERT ON TABLE public.journal_trades TO sandbox_exec_zcjptaolpumhtlwhlemq;
SQL
}

assert_production_starting_acl() {
  local sig
  assert_fn_public_execute "journal_backfill_accounts_and_executions(uuid)" t
  assert_fn_public_execute "journal_migrate_legacy_trades()" t
  assert_fn_public_execute "journal_import_rollback(uuid)" t
  assert_fn_public_execute "journal_calculate_trade_v1(uuid)" f
  assert_fn_public_execute "journal_refresh_derived(uuid)" f
  assert_fn_public_execute "journal_save_trade_v1(jsonb)" f
  assert_fn_public_execute "journal_import_start_v1(jsonb)" f
  assert_fn_public_execute "journal_import_row_v1(uuid, uuid, jsonb)" f
  assert_fn_public_execute "journal_import_finalize_v1(uuid)" f
  for sig in "${FN_CANON_SIGS[@]}"; do
    assert_fn_execute anon "$sig" t
    assert_fn_execute authenticated "$sig" t
    assert_fn_execute service_role "$sig" t
    assert_fn_execute "$FN_ACL_SANDBOX" "$sig" t
  done
  assert_sandbox_table_acl_footprint "$FN_ACL_SANDBOX"
  assert_sandbox_table_acl_footprint "$FN_ACL_SANDBOX_PLAIN"
  assert_plain_sandbox_no_direct_fn_execute
}

apply_fn_acl_expect_failure() {
  if apply_sql_file "$FN_ACL_FILE"; then
    echo "function ACL hardening was expected to fail closed" >&2
    exit 1
  fi
}

run_fn_acl_production_faithful() {
  echo "==> production-faithful starting ACL reaches the required final ACL"
  apply_sql_file "$FN_ACL_FIXTURE"
  assert_production_starting_acl
  dump_journal_catalog > /tmp/journal-fn-acl-prod-before.txt
  dump_sandbox_table_acl > /tmp/journal-sandbox-table-acl-before.txt
  apply_sql_file "$FN_ACL_FILE"
  dump_journal_catalog > /tmp/journal-fn-acl-prod-after.txt
  dump_sandbox_table_acl > /tmp/journal-sandbox-table-acl-after.txt
  python3 "$ROOT/scripts/ci/journal-fn-acl-delta.py" \
    /tmp/journal-fn-acl-prod-before.txt \
    /tmp/journal-fn-acl-prod-after.txt
  if ! diff -u /tmp/journal-sandbox-table-acl-before.txt /tmp/journal-sandbox-table-acl-after.txt; then
    echo "sandbox table ACLs changed after function ACL hardening" >&2
    exit 1
  fi
  assert_fn_hardened_all
  assert_sandbox_fn_execute_all t
  assert_sandbox_table_acl_footprint "$FN_ACL_SANDBOX"
  assert_sandbox_table_acl_footprint "$FN_ACL_SANDBOX_PLAIN"
  assert_plain_sandbox_no_fn_execute
  echo "==> second function ACL hardening execution is idempotent"
  apply_sql_file "$FN_ACL_FILE"
  dump_journal_catalog > /tmp/journal-fn-acl-prod-after2.txt
  dump_sandbox_table_acl > /tmp/journal-sandbox-table-acl-after2.txt
  if ! diff -u /tmp/journal-fn-acl-prod-after.txt /tmp/journal-fn-acl-prod-after2.txt; then
    echo "idempotent function ACL re-apply changed the journal catalog" >&2
    exit 1
  fi
  if ! diff -u /tmp/journal-sandbox-table-acl-after.txt /tmp/journal-sandbox-table-acl-after2.txt; then
    echo "idempotent function ACL re-apply changed sandbox table ACLs" >&2
    exit 1
  fi
  assert_fn_hardened_all
  assert_sandbox_fn_execute_all t
  assert_plain_sandbox_no_fn_execute
}

run_fn_acl_failure_injection() {
  echo "==> unexpected PUBLIC EXECUTE on a non-target function fails before mutation"
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
GRANT EXECUTE ON FUNCTION public.journal_calculate_trade_v1(uuid) TO PUBLIC;
SQL
  assert_fn_public_execute "journal_calculate_trade_v1(uuid)" t
  apply_fn_acl_expect_failure
  assert_fn_public_execute "journal_calculate_trade_v1(uuid)" t
  assert_fn_execute authenticated "journal_calculate_trade_v1(uuid)" t
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
REVOKE ALL ON FUNCTION public.journal_calculate_trade_v1(uuid) FROM PUBLIC;
SQL

  echo "==> unexpected grantee fails before mutation"
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE journal_fn_acl_probe NOLOGIN;
GRANT EXECUTE ON FUNCTION public.journal_calculate_trade_v1(uuid) TO journal_fn_acl_probe;
SQL
  apply_fn_acl_expect_failure
  assert_fn_execute journal_fn_acl_probe "journal_calculate_trade_v1(uuid)" t
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
REVOKE ALL ON FUNCTION public.journal_calculate_trade_v1(uuid) FROM journal_fn_acl_probe;
DROP ROLE journal_fn_acl_probe;
SQL

  echo "==> unexpected sandbox_exec grantee fails before mutation"
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE sandbox_exec_unexpected NOLOGIN;
GRANT EXECUTE ON FUNCTION public.journal_calculate_trade_v1(uuid) TO sandbox_exec_unexpected;
SQL
  apply_fn_acl_expect_failure
  assert_fn_execute sandbox_exec_unexpected "journal_calculate_trade_v1(uuid)" t
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
REVOKE ALL ON FUNCTION public.journal_calculate_trade_v1(uuid) FROM sandbox_exec_unexpected;
DROP ROLE sandbox_exec_unexpected;
SQL

  echo "==> plain sandbox_exec function EXECUTE fails before mutation"
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
GRANT EXECUTE ON FUNCTION public.journal_calculate_trade_v1(uuid) TO sandbox_exec;
SQL
  apply_fn_acl_expect_failure
  assert_fn_execute sandbox_exec "journal_calculate_trade_v1(uuid)" t
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
REVOKE ALL ON FUNCTION public.journal_calculate_trade_v1(uuid) FROM sandbox_exec;
SQL

  echo "==> missing sandbox SELECT fails before mutation"
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
REVOKE SELECT ON TABLE public.journal_trades FROM sandbox_exec_zcjptaolpumhtlwhlemq;
SQL
  apply_fn_acl_expect_failure
  restore_long_sandbox_trades_acl

  echo "==> missing sandbox INSERT fails before mutation"
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
REVOKE INSERT ON TABLE public.journal_trades FROM sandbox_exec_zcjptaolpumhtlwhlemq;
SQL
  apply_fn_acl_expect_failure
  restore_long_sandbox_trades_acl

  echo "==> extra sandbox table privileges fail before mutation"
  for priv in UPDATE DELETE TRUNCATE REFERENCES TRIGGER; do
    echo "==> extra sandbox ${priv} fails before mutation"
    docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
      "GRANT ${priv} ON TABLE public.journal_trades TO sandbox_exec_zcjptaolpumhtlwhlemq"
    apply_fn_acl_expect_failure
    restore_long_sandbox_trades_acl
  done
  if docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -A -t -c \
    "SELECT (current_setting('server_version_num')::integer >= 170000)" \
    | tr -d '[:space:]' | grep -qx t; then
    echo "==> extra sandbox MAINTAIN fails before mutation"
    docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
      "GRANT MAINTAIN ON TABLE public.journal_trades TO sandbox_exec_zcjptaolpumhtlwhlemq"
    apply_fn_acl_expect_failure
    restore_long_sandbox_trades_acl
  fi

  echo "==> sandbox table grant option fails before mutation"
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
GRANT SELECT ON TABLE public.journal_trades TO sandbox_exec_zcjptaolpumhtlwhlemq WITH GRANT OPTION;
SQL
  apply_fn_acl_expect_failure
  restore_long_sandbox_trades_acl

  echo "==> unexpected sandbox role membership fails before mutation"
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
GRANT authenticated TO sandbox_exec_zcjptaolpumhtlwhlemq;
SQL
  apply_fn_acl_expect_failure
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
REVOKE authenticated FROM sandbox_exec_zcjptaolpumhtlwhlemq;
SQL

  echo "==> missing authenticated EXECUTE fails before mutation"
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
REVOKE ALL ON FUNCTION public.journal_import_rollback(uuid) FROM authenticated;
SQL
  apply_fn_acl_expect_failure
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
GRANT EXECUTE ON FUNCTION public.journal_import_rollback(uuid) TO authenticated;
SQL

  echo "==> missing service_role EXECUTE fails before mutation"
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
REVOKE ALL ON FUNCTION public.journal_import_rollback(uuid) FROM service_role;
SQL
  apply_fn_acl_expect_failure
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
GRANT EXECUTE ON FUNCTION public.journal_import_rollback(uuid) TO service_role;
SQL

  echo "==> applying function ACL hardening after restoring the approved privilege set"
  apply_sql_file "$FN_ACL_FILE"
  assert_fn_hardened_all
  assert_sandbox_fn_execute_all t
  assert_sandbox_table_acl_footprint "$FN_ACL_SANDBOX"
  assert_sandbox_table_acl_footprint "$FN_ACL_SANDBOX_PLAIN"
  assert_plain_sandbox_no_fn_execute
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

SELECT 'defacl|' || pg_get_userbyid(d.defaclrole)::text || '|' || d.defaclobjtype::text || '|' || d.defaclacl::text
FROM pg_default_acl d
JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE n.nspname = 'public'
ORDER BY 1;

SELECT 'counts|accounts=' || (SELECT count(*) FROM public.journal_accounts)::text
  || '|executions=' || (SELECT count(*) FROM public.journal_executions)::text
  || '|trades=' || (SELECT count(*) FROM public.journal_trades)::text;
SQL
}

if [[ "$MODE" == "parity" ]]; then
  echo "==> old-vs-new schema parity on disposable databases"
  write_disposable_prereqs
  rewrite_hardcoded_cron_jobids
  echo "==> applying approved baseline three-file sequence"
  hold_journal_files all
  cp "$BASELINE_DIR/"*.sql "$ROOT/supabase/migrations/"
  supabase db start
  DB_CONTAINER="$(db_container)"
  dump_journal_catalog > /tmp/journal-catalog-old.txt
  supabase stop --no-backup >/dev/null 2>&1 || true
  rm -f "$ROOT/supabase/migrations/20260816190000_journal_foundation_schema.sql"
  rm -f "$ROOT/supabase/migrations/20260816190100_journal_rls_storage.sql"
  rm -f "$ROOT/supabase/migrations/20260816190200_journal_functions_backfill.sql"
  restore_held_sql
  mv "$ACL_FILE" "$HELD/"
  mv "$FN_ACL_FILE" "$HELD/"
  echo "==> applying canonical production Journal sequence through Stage C without remediations"
  write_disposable_prereqs
  rewrite_hardcoded_cron_jobids
  supabase db start
  DB_CONTAINER="$(db_container)"
  dump_journal_catalog > /tmp/journal-catalog-new.txt
  if ! diff -u /tmp/journal-catalog-old.txt /tmp/journal-catalog-new.txt; then
    echo "old-vs-new journal catalog mismatch" >&2
    exit 1
  fi
  echo "==> old-vs-new catalog match through Stage C"
  echo "==> applying $ACL_HELD_NAME expected table ACL delta"
  apply_sql_file "$HELD/$ACL_HELD_NAME"
  dump_journal_catalog > /tmp/journal-catalog-after-acl.txt
  python3 "$ROOT/scripts/ci/journal-acl-delta.py" \
    /tmp/journal-catalog-old.txt \
    /tmp/journal-catalog-after-acl.txt
  echo "==> applying $FN_ACL_HELD_NAME expected function ACL delta"
  apply_sql_file "$HELD/$FN_ACL_HELD_NAME"
  dump_journal_catalog > /tmp/journal-catalog-after-fn-acl.txt
  python3 "$ROOT/scripts/ci/journal-fn-acl-delta.py" \
    /tmp/journal-catalog-after-acl.txt \
    /tmp/journal-catalog-after-fn-acl.txt
  echo "==> post-remediation expected-delta passed"
  exit 0
fi

if [[ "$MODE" == "legacy" ]]; then
  echo "==> holding Journal migrations to reset through 20260814180000"
  hold_journal_files all
elif [[ "$MODE" == "m1" ]]; then
  echo "==> holding policy and function migrations so the database stops after foundation"
  hold_journal_files policy
  hold_journal_files functions
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
  echo "==> running legacy ACL hardening failure-injection and idempotency"
  run_acl_failure_injection
  echo "==> running legacy ACL hardening pgTAP tests"
  supabase test db --local supabase/tests/database/journal_legacy_acl_hardening.test.sql
  echo "==> sandbox-absent function ACL already applied by db start"
  assert_fn_hardened_all
  echo "==> running production-faithful function ACL runtime"
  run_fn_acl_production_faithful
  echo "==> running function ACL hardening failure-injection"
  run_fn_acl_failure_injection
  echo "==> running function ACL hardening pgTAP tests"
  supabase test db --local supabase/tests/database/journal_function_acl_hardening.test.sql
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
mapfile -t JOURNAL_HELD < <(journal_map_files all | while IFS= read -r name; do
  printf '%s/%s\n' "$HELD" "$name"
done)
for f in "${JOURNAL_HELD[@]}"; do
  echo "==> applying $(basename "$f")"
  apply_sql_file "$f"
done

echo "==> running legacy-upgrade pgTAP tests"
supabase test db --local supabase/tests/database/journal_legacy_upgrade.test.sql
echo "==> legacy-upgrade job passed"
