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

**STOP — Checkpoint A1:** Migration applied and bridge deployed; authenticated read-only RPC smoke test passes.

**STOP — Checkpoint A2:** Fly image + non-writing preflight (below). **Do not unset `HISTORICAL_CATCHUP_PREFLIGHT_ONLY=1`** until a separately authorized pilot (Checkpoint B).

### A2 safe sequence (preflight only)

1. Confirm **`min_machines_running = 0`** in `fly.historical-backfill.toml` (repo) matches Fly (`fly config show`). Never deploy with `min_machines_running = 1` on a one-shot job.
2. Set guards **before** deploy or any machine start:
   ```bash
   fly secrets set -a stocksist-historical-backfill-job \
     HISTORICAL_CATCHUP_TARGET_SESSION='YYYY-MM-DD' \
     HISTORICAL_CATCHUP_PREFLIGHT_ONLY=1
   ```
   Ensure `HISTORICAL_BACKFILL_CONNECTIVITY_ONLY` is **not** set.
3. **`fly deploy --config fly.historical-backfill.toml`** — updates the image/config on existing machines; with `min_machines_running = 0` it must **not** leave a writer running. Verify with `fly machines list` (state `stopped` or no machines).
4. Run preflight once:
   ```bash
   fly scale count 1 --process-group backfill -a stocksist-historical-backfill-job
   fly machine start <id> -a stocksist-historical-backfill-job   # if machine exists but stopped
   fly logs -a stocksist-historical-backfill-job
   ```
   Expect **`catch_up_preflight_ok`** only (no `catch_up_start`, no provider/bridge writes from catch-up).
5. Shutdown (keep preflight secret):
   ```bash
   fly scale count 0 --process-group backfill -a stocksist-historical-backfill-job
   ```
   Confirm **zero** machines. Leave **`HISTORICAL_CATCHUP_PREFLIGHT_ONLY=1`** in place until Checkpoint B.

Connectivity checks (`HISTORICAL_BACKFILL_CONNECTIVITY_ONLY=1`) remain separate from target validation.

## Daily catch-up — Fly one-shot job

### Deploy vs scale

- **`fly deploy --config fly.historical-backfill.toml`** — ship new worker image only when preflight guard (or explicit pilot authorization) is already set. Does **not** replace a deliberate **`fly scale count 0`** shutdown by itself.
- **`fly scale count 1` / `fly machine start`** — runs the entrypoint once (preflight, connectivity, or catch-up depending on secrets). **`fly scale count 0`** destroys machines; the next run creates a new machine.

Optional limits (defaults in `src/config/historical-catchup.config.ts`):

- `HISTORICAL_CATCHUP_MAX_BATCHES`, `HISTORICAL_CATCHUP_MAX_SYMBOLS`, `HISTORICAL_CATCHUP_MAX_PROVIDER_REQUESTS`
- `HISTORICAL_CATCHUP_MAX_NO_PROGRESS_BATCHES`, `HISTORICAL_CATCHUP_MAX_EMPTY_RESOLUTION_BATCHES`

### Resume vs new catch-up

1. **Resume interrupted job** — On start, the worker calls `resumeInterruptedJobs` for jobs in `RUNNING` / `PAUSED` / `FAILED` with the **same** `date_from` / `date_to` as the current target. Completed jobs are never selected.
2. **New extended range** — Set a higher `HISTORICAL_CATCHUP_TARGET_SESSION`. Eligibility uses **latest stored session ≥ target**, not min session count alone. Symbols already current are skipped.
3. **Fly restart mid catch-up** — If the process stops while a batch job is still `RUNNING`, scale to 1 again: resume path continues that job; if the prior run hit Fly per-run provider/batch limits, the job stays `RUNNING` and the next scale-up advances it without resetting completed jobs.

## Checkpoint B — Bounded daily pilot (authorization required; do not run until approved)

**Prepared pilot (not executed):** target session **`2026-10-20`**, **`HISTORICAL_CATCHUP_MAX_SYMBOLS=10`**, **`HISTORICAL_CATCHUP_MAX_BATCHES=1`**, **`HISTORICAL_CATCHUP_MAX_PROVIDER_REQUESTS=100`**.

**Out of scope for this Fly app:** intraday reconstruction (`scripts/historical/intraday-reconstruction-prod.ts`), `stocksist-radar-v22-worker`, and any Edge/Lovable deploy. The historical entrypoint only runs `runHistoricalCatchUpPreflight`, connectivity check, or `runHistoricalCatchUpRollout` — never intraday scripts.

### Pre-launch verification (zero machines)

```bash
fly machines list -a stocksist-historical-backfill-job          # expect: no machines
fly secrets list -a stocksist-historical-backfill-job           # expect: PREFLIGHT_ONLY staged/deployed
```

After A2 scale-to-zero, secrets may show **`Staged`**. They apply to the **next** machine only after **`fly secrets deploy`** (or a `fly secrets set` that completes deploy).

### Safe transition: preflight → execution (machines must stay at zero until step 3)

**STOP — human authorization** before step 1.

1. Confirm **`fly machines list`** is empty and **`HISTORICAL_CATCHUP_PREFLIGHT_ONLY=1`** is still set (preflight guard active while idle).
2. Remove preflight guard and set **pilot caps** (still no machines running):
   ```bash
   fly secrets unset -a stocksist-historical-backfill-job HISTORICAL_CATCHUP_PREFLIGHT_ONLY
   fly secrets set -a stocksist-historical-backfill-job \
     HISTORICAL_CATCHUP_TARGET_SESSION='2026-10-20' \
     HISTORICAL_CATCHUP_MAX_SYMBOLS=10 \
     HISTORICAL_CATCHUP_MAX_BATCHES=1 \
     HISTORICAL_CATCHUP_MAX_PROVIDER_REQUESTS=100
   ```
   Ensure **`HISTORICAL_BACKFILL_CONNECTIVITY_ONLY`** is unset.
3. Activate secrets on the next VM:
   ```bash
   fly secrets deploy -a stocksist-historical-backfill-job
   fly secrets list -a stocksist-historical-backfill-job    # confirm Deployed, no PREFLIGHT_ONLY
   ```
4. **Launch one shot:**
   ```bash
   fly scale count 1 --process-group backfill -a stocksist-historical-backfill-job
   fly logs -a stocksist-historical-backfill-job
   ```

### Expected logs (execution mode)

| Event | Meaning |
|-------|---------|
| `catch_up_start` | Catch-up entered (must **not** appear during preflight) |
| `batch_complete` | One batch finished or resumed job advanced |
| `catch_up_partial_stop` | Expected for bounded pilot (limits or remaining eligible work) |
| `rollout_complete` | Full queue caught up — **unlikely** on first 10-symbol pilot |
| `catch_up_preflight_ok` | **Must not** appear if preflight guard was removed correctly |

**Stopping conditions (do not restart without review):** `catch_up_stop` with `provider_request_limit`, `job_paused`, `no_progress`; batch `FAILED`; or process exit non-zero.

### Interruption and shutdown

- **Fly restart mid-run:** scale to 1 again; worker resumes interrupted `RUNNING`/`PAUSED`/`FAILED` job for the same target (see resume rules above).
- **End pilot:**
  ```bash
  fly scale count 0 --process-group backfill -a stocksist-historical-backfill-job
  fly machines list -a stocksist-historical-backfill-job
  ```
- **Re-arm preflight** before any accidental scale-up:
  ```bash
  fly secrets set -a stocksist-historical-backfill-job HISTORICAL_CATCHUP_PREFLIGHT_ONLY=1
  fly secrets deploy -a stocksist-historical-backfill-job
  ```

### Bounded post-run verification (read-only)

- Bridge/SQL: sample symbols from logs — `latest_session` moves toward **`2026-10-20`** for touched names; symbols already current were **`symbolsSkipped`**.
- No change to scanner tables/generations (`stocksist-radar-v22-worker` untouched).
- Episode rows: new sessions only; no destructive migration or delete.

**STOP — Checkpoint C:** After pilot review, authorize wider caps or continuation batches.

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
