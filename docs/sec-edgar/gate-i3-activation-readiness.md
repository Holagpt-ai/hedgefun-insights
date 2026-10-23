# Gate I.3 — SEC EDGAR automated ingestion activation readiness

Project: `zcjptaolpumhtlwhlemq`. Function: `sync-sec-edgar-filings`.

This batch adds **circuit breaker auto-pause**, **manual resume RPC**, **ET schedule guard**, and extended run telemetry. It does **not** enable writes, cron, or migrations in production from Cursor.

## WS1 — Failure circuit breaker

| Control | Behavior |
|---------|----------|
| `failure_pause_threshold` | Default **3** on `sec_edgar_sync_state` (1–20) |
| Qualifying failures | `run_status=error` only (provider, checkpoint, DB, unknown) |
| Auto-pause | At threshold, `ingestion_paused=true`, `ingestion_pause_reason=consecutive_failures` |
| Success | Resets `consecutive_failures` to **0**; does **not** clear `ingestion_paused` |
| Lease busy / paused pre-check | Do **not** increment failures |
| Manual resume | `resume_sec_edgar_ingestion_v1('issuer_direct_latest_filings')` — **service_role only** |

Edge logic: `apply_sec_edgar_sync_run_outcome_v1` (Postgres) via RPC; mirrored in `_shared/sec-edgar/sync-outcome.ts` for tests.

## WS2 — Scheduling (not activated)

- Cadence: **`*/30 * * * *`** with **`sec_edgar_sync_cron_should_invoke_v1()`** guard
- Window: **Mon–Fri**, **4:00 AM–10:00 PM America/New_York** (22:00 exclusive)
- DST: guard uses `AT TIME ZONE 'America/New_York'`, not fixed UTC offsets
- Draft SQL: `docs/sec-edgar/unapplied-cron.sql` (vault `SYNC_SECRET`, body `{"mode":"write"}`)

## WS3 — Write authorization

Unchanged: Bearer `SYNC_SECRET`, `SEC_EDGAR_WRITE_ENABLED=true`, service-role DB RPCs only. Pause is checked for **write** mode before lease/SEC calls.

## WS4 — Telemetry

`sec_edgar_sync_runs.summary` and JSON log `sec_edgar_sync_run` include: `ingestion_paused`, `auto_pause_applied`, `checkpoint_revision`, `last_success_at`, plus existing Gate I counters. Auto-pause emits `sec_edgar_sync_auto_pause`.

## Activation procedure (Lovable / ops)

1. Apply migrations through **`20261024153000_sec_edgar_ingestion_circuit_breaker_v1.sql`** (after `20261024103000`).
2. Deploy `sync-sec-edgar-filings` Edge bundle from approved branch commit.
3. Confirm `failure_pause_threshold=3`, `ingestion_paused=false`, checkpoint revision **2** unchanged.
4. Dry-run POST with `SYNC_SECRET` (no write flag).
5. Enable `SEC_EDGAR_WRITE_ENABLED=true`; single controlled write; verify run row + checkpoint.
6. Apply cron from `unapplied-cron.sql` when approved (still vault-only secrets).

## Pause / rollback

| Action | Command / step |
|--------|----------------|
| **Pause writes immediately** | `UPDATE sec_edgar_sync_state SET ingestion_paused=true, ingestion_pause_reason='manual' WHERE stream_key='issuer_direct_latest_filings';` |
| **Resume after fix** | `SELECT resume_sec_edgar_ingestion_v1('issuer_direct_latest_filings');` (service_role) |
| **Disable schedule** | `SELECT cron.unschedule('sync-sec-edgar-filings-weekday-et');` |
| **Disable writes** | Unset `SEC_EDGAR_WRITE_ENABLED` |
| **Reset failure streak only** | Happens automatically on next successful run; pause remains until resume |
