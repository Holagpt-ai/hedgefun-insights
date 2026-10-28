# Batch 190 — CPU-safe staged screener sync (Architecture A)

**Issue:** ISS-034 (P0 open until production demonstrates fresh six-tab publication)  
**PR:** #196 (amended with release-safety corrections)

## Decision

**Architecture A — bounded, resumable Edge invocations with durable Postgres staging.**

PR #194 reduced local wall-clock ~5× but production still **CPU Time exceeded** at ~13,262 symbols before `replace_screener_results_generation_v1`. Further single-request micro-optimization is explicitly out of scope.

**Not chosen:** Fly worker offload (Batch 190 does not expand Fly credentials, deploys, or schedules).

## Behavior

1. **Cron / start (`action: cron`)** — One Polygon snapshot triple, optional radar previous-close overlay, immutable `observation` context. NHL baseline **frozen** into `nhl_baseline_snapshot` on the job row. If a resumable in-progress job exists (expired lease or failed continue dispatch), cron **resumes** it instead of starting a conflicting generation.
2. **Chunk steps (`action: continue`)** — At most `SCREENER_SYNC_CHUNK_SIZE` (2200) symbols per invocation. Chunk advance uses **CAS** (`state_version`, `next_chunk_index`, lease token) via `advance_screener_sync_chunk_v1`. Continue dispatch uses `EdgeRuntime.waitUntil` + awaited fetch with timeout; failures recorded on the job for cron recovery.
3. **Finalize** — `claim_screener_sync_lease_v1` (finalize mode) ensures a single finalizer. Publication uses frozen NHL snapshot only; live baseline generation drift **fails closed**. **`publish_screener_sync_staged_generation_v1`** atomically runs `replace_screener_results_generation_v1` and records `publish_rows_inserted` (no non-atomic fallback in staged mode). Then **`complete_screener_sync_publish_v1`** marks the job `published`.

**Monolithic path** remains when `SCREENER_SYNC_STAGED` is `0` or `off` (default).

## Migration order (Lovable Cloud — apply in sequence)

1. `20261028200000_screener_sync_generation_staging_v1.sql` — table + columns (`state_version`, `nhl_baseline_snapshot`, continue/finalize lease fields)
2. `20261028210000_screener_sync_staging_rpc_v1.sql` — `claim_screener_sync_lease_v1`, initial chunk advance / complete RPCs
3. `20261028220000_screener_sync_staging_hardening_v1.sql` — **lease handoff** on chunk advance (NULL lease after commit), **one active generation** partial unique index, **`record_screener_sync_publish_rpc_v1`**, publish-complete requires recorded RPC
4. `20261028230000_screener_sync_staging_recovery_v1.sql` — **`expire_screener_sync_stale_jobs_v1`**, atomic **`publish_screener_sync_staged_generation_v1`** (replace + job record in one transaction), **DROP** obsolete 7-arg `advance_screener_sync_chunk_v1`

**Postgres integration gate (mandatory on PR #196):** GitHub Actions provisions **PostgreSQL 16**, runs `scripts/supabase/screener-sync-pg-test-setup.mjs` (bootstrap + migrations **20260914200000** → **20261028230000**), then `sync-staging-postgres-integration_test.ts`. Local: disposable Docker Postgres only — never Lovable production.

**Production migration prerequisite:** Postgres CI must be green on the PR head **before** Lovable applies migrations `20261028200000`–`20261028230000`.

Validate locally: `node scripts/supabase/migration-order.mjs`

## Enable staged mode (production)

| Step | Owner |
| --- | --- |
| Apply migrations above in order | Lovable Cloud |
| Deploy Edge `sync-screener-data` with PR #196 head | Lovable Cloud |
| Set `SCREENER_SYNC_STAGED=1` | Lovable Cloud |
| Confirm `SYNC_SECRET` authorizes self-continue POSTs | Lovable Cloud |
| Do **not** change cron job 25 | — |

### Rollback

1. Set `SCREENER_SYNC_STAGED=0`
2. Redeploy **post–PR #194** Edge bundle (CPU mitigation + D1 volume semantics — **not** pre-D1 `68092518`, which reintroduces ISS-033)
3. Last published feed generation remains until monolithic path succeeds

### Partial failure handling

| Situation | System behavior |
| --- | --- |
| Continue HTTP dispatch fails | `continue_last_error` set; cron resumes same `generation_id` when lease expired |
| Chunk CAS rejected | Worker exits without publish; retry or cron takeover |
| Finalize owner conflict | 409; other worker owns finalize lease |
| RPC ok, publish state CAS fails | Response includes `publish_state_pending`; retry finalize is safe if feed already shows `sync_run_id` |
| NHL baseline generation changes mid-run | Job `failed` with `nhl_baseline_generation_changed` |
| Job TTL exceeded (25m) | `aborted`; no publish |

## Validation (local — typed Deno)

```sh
deno test --frozen supabase/functions/_shared/screeners/chunked-selection-parity_test.ts
deno test --frozen supabase/functions/_shared/screeners/sync-orchestrator-concurrency_test.ts
deno test --frozen supabase/functions/_shared/screeners/sync-continue-dispatch_test.ts
deno test --frozen supabase/functions/_shared/screeners/sync-staged-e2e_test.ts
deno test --frozen --allow-env=SCREENER_SYNC_PG_TEST_URL supabase/functions/_shared/screeners/sync-chunk-handoff_test.ts
deno test --frozen --allow-env=SCREENER_SYNC_PG_TEST_URL supabase/functions/_shared/screeners/policy-exclusion-serialize_test.ts
deno test --frozen --allow-env=SCREENER_SYNC_PG_TEST_URL supabase/functions/_shared/screeners/sync-staging-postgres-integration_test.ts
npm run typecheck && npm run build
node scripts/supabase/migration-order.mjs
```

**Note:** Logged `mono_ms` / `chunk_ms` / `serialize_ms` are local wall-clock only — **not** Supabase Edge billed CPU.

## ISS-034

Remains **OPEN** until production demonstrates a fresh six-tab publication after staged deploy.
