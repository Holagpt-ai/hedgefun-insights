#!/usr/bin/env bash
# Disposable GitHub-hosted Supabase Postgres for Journal runtime tests.
# Does not link, login, push, deploy, or use production secrets/--db-url/--linked.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

MODE="${1:-}"
if [[ "$MODE" != "clean" && "$MODE" != "legacy" ]]; then
  echo "usage: $0 clean|legacy" >&2
  exit 2
fi

HELD="$(mktemp -d)"
DB_CONTAINER=""

cleanup() {
  if [[ -d "$HELD" ]]; then
    shopt -s nullglob
    mv "$HELD"/2026081619*.sql "$ROOT/supabase/migrations/" 2>/dev/null || true
    rmdir "$HELD" 2>/dev/null || true
  fi
  supabase stop >/dev/null 2>&1 || true
}
trap cleanup EXIT

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
fi

echo "==> starting disposable local database"
supabase db start
DB_CONTAINER="$(db_container)"
if [[ -z "$DB_CONTAINER" ]]; then
  echo "disposable database container was not found" >&2
  exit 1
fi

if [[ "$MODE" == "clean" ]]; then
  echo "==> linting local schema"
  supabase db lint
  echo "==> running clean-database pgTAP tests"
  supabase test db --local supabase/tests/database/journal_runtime.test.sql
  echo "==> clean-database job passed"
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
