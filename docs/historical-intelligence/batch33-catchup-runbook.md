# Batch 33 — Historical catch-up runbook (production authorization required)

This runbook covers **daily backfill catch-up** via `stocksist-historical-backfill-job` and **bounded intraday reconstruction** via `scripts/historical/intraday-reconstruction-prod.ts`. Do not execute production steps until prerequisites below are verified and an operator explicitly authorizes each checkpoint.

## Prerequisites (apply before any catch-up)

| Dependency | Action |
|------------|--------|
| SQL | Apply `supabase/migrations/20261021183000_historical_catchup_eligibility_v1.sql` on production (RPC `historical_rollout_symbols_current_through`). |
| Edge | Deploy **`radar-worker-bridge`** revision that includes `historical_rollout_symbols_current_through`. |
| Edge | Confirm **`radar-historical-context`** revision matches the release that Batch 32+ expects (read deploy SHA from Lovable; no redeploy in this batch). |
| Secrets | Fly job: `RADAR_BRIDGE_URL`, `RADAR_WORKER_SECRET`, `POLYGON_API_KEY`. Intraday script: same bridge secrets + Polygon. |
| Upstash | Confirm Lovable secrets include Upstash Redis URL/token (names only in logs). Verify worker logs show `shared_cache=upstash` when available — do not expose values. |
| Target date | Set **`HISTORICAL_CATCHUP_TARGET_SESSION=YYYY-MM-DD`** on Fly (validated trading day ≤ last completed U.S. session; fail-closed). |

**STOP — Checkpoint A:** Migration applied and bridge deployed; target date and limits validated **without historical writes**:

```bash
fly secrets set -a stocksist-historical-backfill-job \
  HISTORICAL_CATCHUP_TARGET_SESSION='YYYY-MM-DD' \
  HISTORICAL_CATCHUP_PREFLIGHT_ONLY=1
fly scale count 1 --process-group backfill -a stocksist-historical-backfill-job
# Expect log event catch_up_preflight_ok (not catch_up_start)
fly secrets unset -a stocksist-historical-backfill-job HISTORICAL_CATCHUP_PREFLIGHT_ONLY
fly scale count 0 --process-group backfill -a stocksist-historical-backfill-job
```

Connectivity checks (`HISTORICAL_BACKFILL_CONNECTIVITY_ONLY=1`) remain separate from target validation.

## Daily catch-up — Fly one-shot job

### Deploy vs scale

- **`fly deploy --config fly.historical-backfill.toml`** — ship new worker image (Batch 33 code). Does not run backfill.
- **`fly scale count 1 --process-group backfill`** — starts one process that runs `runHistoricalCatchUpRollout` once, then exits when limits or queue empty.

Optional limits (defaults in `src/config/historical-catchup.config.ts`):

- `HISTORICAL_CATCHUP_MAX_BATCHES`, `HISTORICAL_CATCHUP_MAX_SYMBOLS`, `HISTORICAL_CATCHUP_MAX_PROVIDER_REQUESTS`
- `HISTORICAL_CATCHUP_MAX_NO_PROGRESS_BATCHES`, `HISTORICAL_CATCHUP_MAX_EMPTY_RESOLUTION_BATCHES`

### Resume vs new catch-up

1. **Resume interrupted job** — On start, the worker calls `resumeInterruptedJobs` for jobs in `RUNNING` / `PAUSED` / `FAILED` with the **same** `date_from` / `date_to` as the current target. Completed jobs are never selected.
2. **New extended range** — Set a higher `HISTORICAL_CATCHUP_TARGET_SESSION`. Eligibility uses **latest stored session ≥ target**, not min session count alone. Symbols already current are skipped.
3. **Fly restart mid catch-up** — If the process stops while a batch job is still `RUNNING`, scale to 1 again: resume path continues that job; if the prior run hit Fly per-run provider/batch limits, the job stays `RUNNING` and the next scale-up advances it without resetting completed jobs.

**STOP — Checkpoint B:** Pilot scale-up authorized (e.g. first batch only via low `HISTORICAL_CATCHUP_MAX_SYMBOLS`).

### Pilot scope and stopping conditions

- Pilot: low symbol cap (e.g. 50–100), monitor `batch_complete` / `catch_up_stop` JSON logs.
- Stop scaling when: `rollout_complete` (eligible queue empty and no interrupted jobs), or `catch_up_partial_stop` / `catch_up_stop` (limits, paused job, or remaining work). **Do not** treat `catch_up_partial_stop` as full completion — scale up again after review.
- Provider budget: default 2500 requests per Fly process; adjust via env if needed.

### Rollback

- **Do not** delete stored daily rows or episodes.
- Scale Fly backfill to **0** machines.
- Unset or lower `HISTORICAL_CATCHUP_TARGET_SESSION` only after confirming no `RUNNING` jobs need completion.
- Redeploy prior worker image only if new code is faulty; data remains idempotent.

**STOP — Checkpoint C:** After pilot, verify SQL/bridge counts before raising symbol caps.

### Verification (daily)

- Max `session_date` in `security_daily_history` approaches target for pilot symbols.
- Episode counts increase only for new sessions; existing episodes unchanged.
- Logs show `symbolsSkipped` for coverage-current names.

### Return job to zero machines

```bash
fly scale count 0 --process-group backfill -a stocksist-historical-backfill-job
```

## Intraday reconstruction catch-up

Run locally or CI runner with production bridge credentials (never commit secrets).

Defaults (Batch 33): `INTRADAY_RECON_MAX_EPISODES=50`, page limit 25, `INTRADAY_RECON_INCLUDE_EXISTING` unset (skip validated COMPLETE rows).

| Env | Purpose |
|-----|---------|
| `INTRADAY_RECON_MAX_EPISODES` | Cap episodes per invocation |
| `INTRADAY_RECON_PAGE_LIMIT` | Episode ID pagination |
| `INTRADAY_RECON_MAX_PROVIDER_ERRORS` | Stop after repeated Polygon failures |
| `INTRADAY_RECON_INCLUDE_EXISTING=1` | Opt-in overwrite/reprocess (not default) |

**Pilot:** `INTRADAY_RECON_MAX_EPISODES=10`, one SIGNIFICANT episode, confirm bridge persistence and outcome bucket in logs.

**Continuation:** 50 → 100 episode caps in separate authorized runs.

Outcomes: `complete`, `partial`, `daily_only`, `unavailable` / `provider_failed` (see log summary).

**STOP — Checkpoint D:** Intraday pilot authorized separately from daily catch-up.

Verify forward-outcome / momentum fields for a sample of newly reconstructed episodes.

## Connectivity check (no market data)

Set `HISTORICAL_BACKFILL_CONNECTIVITY_ONLY=1`, scale to 1, confirm `connectivity_ok`, unset flag, scale to 0 (see `services/historical-backfill-job/README.md`).
