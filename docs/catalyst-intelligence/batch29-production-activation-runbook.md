# Batch 29 — Production activation runbook (human-gated)

Cursor implements adapters, client contracts, reliability controls, and tests. **No automatic production activation.**

## Preconditions

1. Intel migrations applied (see `batch08-lovable-handoff.md`).
2. Edge bundle containing `_shared/catalyst-intelligence/*` deployed via approved process.
3. `SEC_USER_AGENT` configured for SEC paths.
4. `SYNC_SECRET` available for manual bot invocations.

## Source enablement (per source row)

1. Confirm `catalyst_intel_sources.enabled = false` in prod before starting.
2. Enable **one** source category at a time (SEC → IR → NEWS → EVENTS).
3. Invoke the matching sync bot with allowlist if needed.
4. Verify run telemetry: `sources_successful`, dedupe counts, zero unexpected `circuit_open` storms.
5. Confirm client surfaces show `verified` / `none` / `unavailable` — not fabricated catalysts.

## SEC writes (29.5 — explicit authorization only)

1. Apply `20260907180000_sec_edgar_sync_state_v1.sql` via approved Supabase process.
2. Deploy `sync-sec-edgar-filings`.
3. `POST {"mode":"dry_run"}` — inspect summary.
4. Single write smoke + idempotency check per `docs/sec-edgar/activation-runbook.md`.
5. Set `SEC_EDGAR_WRITE_ENABLED=true` only after sign-off.
6. Keep cron disabled until cadence approval (`docs/sec-edgar/overlap-and-cadence.md`).

## Operational toggles

| Control | Purpose |
|---------|---------|
| `CATALYST_INTEL_{BOT}_ENABLED` | Bot-level gate (still requires per-source `enabled`) |
| `catalyst_intel_sources.enabled` | Emergency per-source kill switch |
| `SEC_EDGAR_WRITE_ENABLED` | SEC persistence gate |
| Source `backoff_until` / circuit metadata | Automatic recovery after provider outages |

## Rollback

1. Set affected source `enabled=false`.
2. Set bot env flag false if needed.
3. Set `SEC_EDGAR_WRITE_ENABLED=false`.
4. Redeploy prior Edge bundle if required.
5. Do not delete checkpoint rows without ops review.

## Verification checklist

- [ ] Scheduled earnings rows display as upcoming, not as completed announcements.
- [ ] Market Pulse / Watchlist show non-causation disclaimer when reaction evidence attached.
- [ ] HTTP 429 triggers backoff and circuit — no unbounded retry loops.
- [ ] Partial provider failure does not wipe existing `catalyst_events` rows.
