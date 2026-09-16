#!/usr/bin/env bash
# Isolated GitHub-hosted Supabase Postgres benchmark for
# finalize_screener_52w_baseline_publish_v1.
# Does not link, login, push, deploy, or use production secrets/--db-url/--linked.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

HELD="$(mktemp -d)"
DB_CONTAINER=""
RESULT_JSON="${BENCHMARK_RESULT_JSON:-/tmp/screener-finalizer-benchmark.json}"

cleanup() {
  if [[ -d "$HELD" ]]; then
    shopt -s nullglob
    mv "$HELD"/*.sql "$ROOT/supabase/migrations/" 2>/dev/null || true
    shopt -u nullglob
    rmdir "$HELD" 2>/dev/null || true
  fi
  supabase stop --no-backup >/dev/null 2>&1 || true
}
trap cleanup EXIT

db_container() {
  docker ps --format '{{.Names}}' | grep -E '^supabase_db_' | head -n 1
}

apply_sql_file() {
  local file="$1"
  echo "==> applying $(basename "$file")"
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$file"
}

echo "==> holding all repository migrations so only the 52w finalize lineage is applied"
shopt -s nullglob
mv "$ROOT/supabase/migrations/"*.sql "$HELD/"
shopt -u nullglob

echo "==> starting disposable local database"
supabase db start
DB_CONTAINER="$(db_container)"
if [[ -z "$DB_CONTAINER" ]]; then
  echo "disposable database container was not found" >&2
  exit 1
fi

echo "==> applying disposable production-table stubs (not a production migration)"
docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
-- Production created these tables outside the held 52w finalize lineage.
-- Stub only so the real committed migrations can ALTER them.
CREATE TABLE IF NOT EXISTS public.screener_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_id text,
  symbol text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.screener_results ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.screener_feed_state (
  state_key text PRIMARY KEY,
  sync_run_id uuid,
  status text,
  synced_at timestamptz,
  provider_as_of_min timestamptz,
  provider_as_of_max timestamptz,
  rows_inserted integer,
  tab_counts jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.screener_feed_state ENABLE ROW LEVEL SECURITY;
SQL

LINEAGE=(
  "20260813190000_screener_52w_baselines.sql"
  "20260814180000_screener_52w_baseline_job.sql"
  "20260828200000_screener_52w_baseline_replace_generation_set_based_v1.sql"
  "20260915180000_screener_prerequisite_eligibility_v1.sql"
  "20260915200000_screener_52w_baseline_chunked_publish_v1.sql"
  "20260916010000_screener_52w_set_based_finalizer_v1.sql"
)

for name in "${LINEAGE[@]}"; do
  if [[ ! -f "$HELD/$name" ]]; then
    echo "missing required migration $name" >&2
    exit 1
  fi
  apply_sql_file "$HELD/$name"
done

echo "==> verifying effective finalize objects"
docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
DO $verify$
BEGIN
  IF to_regclass('public.screener_52w_baselines') IS NULL
     OR to_regclass('public.screener_52w_baseline_state') IS NULL
     OR to_regclass('public.screener_52w_baseline_exclusions') IS NULL
     OR to_regclass('public.screener_52w_baseline_publish_job') IS NULL
     OR to_regclass('public.screener_52w_baseline_publish_rows') IS NULL
     OR to_regclass('public.screener_52w_baseline_publish_exclusions') IS NULL THEN
    RAISE EXCEPTION 'missing 52w finalize table';
  END IF;
  IF to_regprocedure('public.replace_screener_52w_baseline_generation_v1(uuid, jsonb, date, date, timestamptz, text)') IS NULL
     OR to_regprocedure('public.replace_screener_52w_baseline_generation_with_exclusions_v1(uuid, jsonb, date, date, timestamptz, text, jsonb, integer)') IS NULL
     OR to_regprocedure('public.start_screener_52w_baseline_publish_v1(uuid, date, date, timestamptz, integer, integer, integer)') IS NULL
     OR to_regprocedure('public.append_screener_52w_baseline_rows_v1(uuid, jsonb)') IS NULL
     OR to_regprocedure('public.append_screener_52w_baseline_exclusions_v1(uuid, jsonb)') IS NULL
     OR to_regprocedure('public.finalize_screener_52w_baseline_publish_v1(uuid)') IS NULL THEN
    RAISE EXCEPTION 'missing 52w finalize RPC';
  END IF;
END;
$verify$;
SQL

echo "==> running finalize benchmark"
set +e
docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -A -t < "$ROOT/supabase/tests/database/screener-finalizer-benchmark.sql" \
  | tee /tmp/screener-finalizer-benchmark.raw
PSQL_STATUS=${PIPESTATUS[0]}
set -e
if [[ "$PSQL_STATUS" -ne 0 ]]; then
  echo "benchmark SQL failed" >&2
  exit 1
fi

python3 - <<'PY'
import json, os, pathlib, subprocess, sys
raw = pathlib.Path("/tmp/screener-finalizer-benchmark.raw").read_text(encoding="utf-8")
start = raw.find("{")
end = raw.rfind("}")
if start < 0 or end <= start:
    raise SystemExit("benchmark JSON was not found in psql output")
payload = json.loads(raw[start:end + 1])
cli = subprocess.check_output(["supabase", "--version"], text=True).strip()
payload["supabase_cli"] = cli
payload["runner_os"] = os.environ.get("RUNNER_OS", "local")
payload["github_run_id"] = os.environ.get("GITHUB_RUN_ID")
path = pathlib.Path(os.environ.get("BENCHMARK_RESULT_JSON", "/tmp/screener-finalizer-benchmark.json"))
path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
print("BENCH_RESULT_JSON=" + str(path))
print(json.dumps(payload, indent=2))
print("VERDICT=" + payload.get("verdict", "UNKNOWN"))
if payload.get("verdict") == "FAIL":
    sys.exit(2)
PY

echo "==> benchmark complete"
