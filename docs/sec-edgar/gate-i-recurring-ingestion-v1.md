# Gate I — SEC EDGAR recurring ingestion V1

Production project: `zcjptaolpumhtlwhlemq`. Edge function: `sync-sec-edgar-filings`. Checkpoint stream: `issuer_direct_latest_filings` (`sec_edgar_sync_state`).

This batch adds **operational scheduling design**, **single-flight lease**, **run telemetry**, **pause/failure counters**, and **Gate H–safe dedupe** without enabling cron, writes, or deployment from the repo.

## Architecture (WS1)

| Component | Role |
|-----------|------|
| `sync-sec-edgar-filings` | Existing V1C walk + checkpoint; Gate I wraps each invocation with lease + run record |
| `sec_edgar_sync_lease` | DB-backed single-flight lock (TTL default 900s, aligned with `SEC_SYNC_LEASE_TTL_SECONDS`) |
| `sec_edgar_sync_runs` | Per-run JSON summary for ops (no secrets) |
| `sec_edgar_sync_state.consecutive_failures` | Streak counter for failed runs |
| `sec_edgar_sync_state.ingestion_paused` | When `true`, write mode returns `INGESTION_PAUSED` before SEC calls |
| Vault cron (draft only) | See `docs/sec-edgar/unapplied-cron.sql` — **not applied** in this batch |

Pause/resume: set `ingestion_paused = false` to resume; checkpoint row is unchanged. Dry-run continues to work while paused (useful for validation).

Overlap: concurrent invocations receive HTTP **409** `LEASE_BUSY` and do not walk the feed.

## Provider reliability (WS2)

Unchanged server-fixed limits in code:

- SEC User-Agent from `SEC_USER_AGENT`
- ~5 req/s pacing (`SEC_MIN_REQUEST_INTERVAL_MS`)
- Bounded retries on 429/5xx/timeouts via `createSecRequester`
- Max **20** feed pages per cycle (`SEC_LATEST_FILINGS_MAX_PAGES`)
- Max **120s** wall clock per invocation (`SEC_SYNC_MAX_RUN_DURATION_MS`)
- Checkpoint **not** advanced on walk failure, gap, insert failure, or checkpoint CAS failure

Inserts use `upsert` with **`ignoreDuplicates: true`** so existing rows (including `attribution_invalidated`) are never updated.

## Attribution integrity (WS3)

- Conservative `resolveSecFilingAttribution` unchanged (Gate F).
- `partitionSecIngestRows` treats any existing `dedupe_key` as skip; counts `rows_skipped_invalidated` when state is `attribution_invalidated`.
- Recurring ingestion must not reactivate Gate H remediated rows.

## Catalyst consumers (WS4)

Central rule: `isEligibleCatalystFeedRow` / `CATALYST_FEED_VERIFICATION_STATE` in `_shared/catalyst/catalyst-feed-eligibility.ts`, wired into pre-market contract, daily brief, scanner enrichment, and Watchlist V2 validation.

## Telemetry (WS5)

Each authenticated run emits:

1. Structured log line `sec_edgar_sync_run` (JSON)
2. Row in `sec_edgar_sync_runs` with full `summary` (sanitized activation summary)

Fields include duration, checkpoint status, pages/entries, attribution counts, skipped invalidated rows, SEC request count, and consecutive failures.

## Proposed cadence (not activated)

Align with `docs/sec-edgar/overlap-and-cadence.md`:

- **Weekdays:** `*/5` minutes during extended hours (4:00 AM–10:00 PM ET sketches in `unapplied-cron.sql`), body `{"mode":"write"}`.
- **Weekends:** lower frequency or off until weekday overlap is proven in ops.
- SEC filings are **not** limited to RTH; do not gate discovery on the market calendar.

## Safe activation procedure (WS6)

1. **Apply migration** `20261024103000_sec_edgar_recurring_ingestion_v1.sql` on production (Lovable).
2. **Deploy** Edge Function `sync-sec-edgar-filings` (includes Gate I handler).
3. **Secrets:** `SYNC_SECRET`, `SEC_USER_AGENT`, service role (platform); do **not** set `SEC_EDGAR_WRITE_ENABLED=true` until write checklist passes.
4. **Dry-run:** POST with Bearer `SYNC_SECRET`, body `{}` or `{"mode":"dry_run"}`; confirm `run_status=ok`, lease release, no writes.
5. **Write enable:** Set `SEC_EDGAR_WRITE_ENABLED=true`; POST `{"mode":"write"}` once; verify checkpoint revision, `sec_edgar_sync_runs`, catalyst inserts, `rows_skipped_invalidated` if re-walking remediated keys.
6. **Schedule:** Apply vault-backed cron from `unapplied-cron.sql` only after steps 4–5 pass.

## Pause / disable

| Action | How |
|--------|-----|
| Pause writes | `UPDATE sec_edgar_sync_state SET ingestion_paused = true WHERE stream_key = 'issuer_direct_latest_filings';` |
| Disable writes | Unset or non-`true` `SEC_EDGAR_WRITE_ENABLED` (409 `WRITE_DISABLED`) |
| Stop schedule | Unschedule cron jobs (no migration rollback required) |

## Failure recovery

| Symptom | Guidance |
|---------|----------|
| `LEASE_BUSY` | Wait for TTL or delete stale lease row only if holder expired (ops) |
| `CHECKPOINT_GAP` | Do not reset checkpoint; investigate anchor drift; re-run after SEC feed stable |
| Rising `consecutive_failures` | Inspect latest `sec_edgar_sync_runs.error_code` and provider metrics |
| Provider outage | Runs fail closed; checkpoint unchanged; retry on next schedule |

## Checkpoint recovery

Do not delete `sec_edgar_sync_state` without ops sign-off. Revision CAS prevents lost updates. Bootstrap only when row absent and first successful write path inserts revision 0.

## Production acceptance checklist (minimal)

- [ ] Migration applied; RPC ACL service_role only
- [ ] Edge deploy matches PR commit
- [ ] Dry-run OK with run telemetry row
- [ ] Write test with `SEC_EDGAR_WRITE_ENABLED=true` (single controlled run)
- [ ] No increase in `attribution_invalidated` rows changing to `provider_reported`
- [ ] Catalyst feeds exclude invalidated rows (spot-check ticker feed)
- [ ] Cron **still off** until explicit go-live

## Remaining steps after merge (Cursor STOP boundary)

1. Lovable: apply migration + deploy function.
2. Execute dry-run acceptance.
3. Enable write gate + one write cycle.
4. Configure cron from `unapplied-cron.sql` when approved.
