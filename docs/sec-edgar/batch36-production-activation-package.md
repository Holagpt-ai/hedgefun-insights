# Batch 36 — SEC EDGAR production activation package

**Project:** `zcjptaolpumhtlwhlemq`  
**Approved code base:** `main` (post Batch 34)  
**Implementation:** `sync-sec-edgar-filings` + `_shared/sec-edgar/*`  
**Companion:** `activation-runbook.md`, `overlap-and-cadence.md`

This document is the **dependency-ordered, individually gated** production procedure. Each step that introduces writes requires explicit human approval before execution.

---

## Provider and rate-limit assumptions

| Assumption | Value |
|------------|--------|
| SEC feed | Official Latest Filings Atom (`browse-edgar?action=getcurrent`, owner=exclude, page size 100) |
| CIK map | `https://www.sec.gov/files/company_tickers_exchange.json` (24h in-process cache) |
| Client identity | `SEC_USER_AGENT` — declared application identity (never commit) |
| Request budget | **≤ 5 req/s** (`SEC_MAX_REQUESTS_PER_SECOND`), 8s timeout, backoff `[350, 900, 1800]` ms |
| Paging | Up to **20** pages per run (`pages_fetched` cap in checkpoint migration) |
| Forms ingested | Closed set in `SEC_INCLUDED_FORMS` (8-K, 10-Q/K, S/F-1, 424B*, etc.) |
| Timestamps | `published_at` = Atom `updated` (SEC acceptance); no synthetic “second accepted” field |
| Writes | Upsert to `catalyst_events` on `dedupe_key`; checkpoint CAS on `sec_edgar_sync_state` |

---

## Prerequisites (read-only verification)

Run on an ops host with approved Postgres read access:

```bash
npx vite-node --config vitest.config.ts scripts/ops/batch36-readonly-prereq.ts
```

Requires `HISTORICAL_PRODUCTION_DATABASE_URL` (or `LOVABLE_DB_MIGRATION_URL` / `SUPABASE_DB_URL` / `DATABASE_URL`) targeting `zcjptaolpumhtlwhlemq`.

Record JSON output in `docs/release/batch36-sec-prerequisite-verification.md` (evidence table).

**Do not** treat anonymous PostgREST 401/404 as migration proof.

---

## Gated activation sequence

### Gate A — Schema (no ingestion)

**Approval required:** DBA / platform owner.

1. Review `supabase/migrations/20260907180000_sec_edgar_sync_state_v1.sql`.
2. Apply **only** this migration via approved Supabase Cloud process if `batch36-readonly-prereq.ts` reports `sec_edgar_sync_state.present: false`.
3. Re-run read-only script; confirm RLS on, **0 rows** in `sec_edgar_sync_state`, anon/authenticated have no table privileges.

**If table already present:** skip apply; document revision row count.

### Gate B — Edge deploy (no writes)

**Approval required:** Edge release owner.

1. Deploy `sync-sec-edgar-filings` from approved `main` SHA (includes `_shared/sec-edgar/*`).
2. Confirm `OPTIONS` returns 200/204 on `/functions/v1/sync-sec-edgar-filings`.
3. Set **`SEC_USER_AGENT`** (Supabase secret). Do **not** set `SEC_EDGAR_WRITE_ENABLED` yet (unset or `false`).
4. Confirm `SYNC_SECRET` already configured for manual invoke.

### Gate C — Dry run (read-only provider + DB read)

**Approval required:** Catalyst ops.

1. `POST /functions/v1/sync-sec-edgar-filings`  
   `Authorization: Bearer <SYNC_SECRET>`  
   Body: `{"mode":"dry_run"}`
2. Expect HTTP 200 and sanitized summary (`sanitizeActivationSummary`):
   - `checkpoint_present`, `checkpoint_status`, `pages_fetched`, `entries_scanned`
   - `forms_found`, `mapped_issuers`, `unmapped_issuers`
   - `rows_would_insert`, `rows_existing`, **`rows_upserted: 0`**
3. Fail closed on `PROVIDER_FORBIDDEN`, `PROVIDER_RATE_LIMITED`, `CHECKPOINT_*` errors.

### Gate D — Source registry (config only)

**Approval required:** Catalyst ops (separate from write gate).

Two layers must both allow SEC (see `20260930120000_catalyst_intelligence_foundation_v1.sql` comments):

1. Bot gate: `catalyst_intel_bot_config.bot = 'sec'` **or** `CATALYST_INTEL_SEC_ENABLED=true` (env overrides row).
2. Source gate: `catalyst_intel_sources.source_key = 'sec-latest-filings'` → `enabled = true`.

**Note:** Direct `sync-sec-edgar-filings` writes **`catalyst_events`** with `provider = 'sec_edgar'`. The intel bot registry gates the **parallel** `catalyst-intelligence` SEC feed path. For V1C direct ingestion, enabling `sec-latest-filings` is still recommended for operational consistency but is **not** a substitute for `SEC_EDGAR_WRITE_ENABLED`.

Enable **only** `sec-latest-filings` row when ready for scheduled bot work (Gate G deferred).

### Gate E — First production write

**Approval required:** Catalyst ops + product sign-off.

1. Set `SEC_EDGAR_WRITE_ENABLED=true`.
2. Single invoke: `{"mode":"write"}` with `SYNC_SECRET`.
3. Read-only SQL (from `activation-runbook.md`):
   - One checkpoint row, revision advanced
   - New `catalyst_events` rows with `provider = 'sec_edgar'`
   - **No** duplicate `dedupe_key`
   - `facts.primary_document` remains null
4. Second `write` invoke → expect idempotency (`rows_upserted` ≈ 0).

### Gate F — Downstream verification (evidence)

**Approval required:** QA / ops spot-check.

With live SEC rows present (post Gate E only):

| Surface | Contract | Live SEC data required to pass |
|---------|----------|--------------------------------|
| Catalyst tab / cards | `sec_edgar` badge, `sec_filing_news` type | Yes — row visible |
| Watchlist / Radar / AM Inbox / Action Center | `enrichment.ts` + verification guards | Yes — symbol with recent filing |
| Market Pulse verified catalyst | `resolveVerifiedCatalystForPulse` | Yes — observation + verified row |
| Public stock detail | Same enrichment rules | Yes |

**Pre-Gate E:** surfaces may show **none/pending/unavailable** honestly — that is expected.

### Gate G — Recurring sync (deferred)

**Not in Batch 36.** Requires separate approval per `overlap-and-cadence.md` and `docs/sec-edgar/unapplied-cron.sql`. Do not schedule cron until cadence sign-off.

---

## Required approvals (summary)

| Gate | Approver | Introduces |
|------|----------|------------|
| A | Platform / DBA | New table (checkpoint) |
| B | Edge release | Deploy + `SEC_USER_AGENT` |
| C | Catalyst ops | SEC HTTP traffic only |
| D | Catalyst ops | Source registry flag |
| E | Catalyst + product | `catalyst_events` writes + checkpoint |
| F | QA | Validation |
| G | Leadership + ops | Cron / recurring |

---

## Production rollback

1. Set `SEC_EDGAR_WRITE_ENABLED=false` (immediate write stop).
2. Set `catalyst_intel_sources.enabled = false` for `sec-latest-filings`; disable sec bot row / `CATALYST_INTEL_SEC_ENABLED=false`.
3. Do **not** delete `catalyst_events` or checkpoint rows without ops review (audit trail).
4. Redeploy prior Edge bundle if a bad deploy shipped.
5. If migration must be reversed (extreme): requires approved down migration plan — **not** automated in this package.

---

## Missing critical functionality (code audit)

| Area | Status |
|------|--------|
| Dry-run / write mode gate | Implemented (`activation.ts`, handler) |
| Accession dedupe | `sec:{accession}:{symbol}` |
| Checkpoint CAS | `sec_edgar_sync_state.revision` |
| CIK/ticker map | `company_tickers_exchange.json` |
| Rate limit / retry telemetry | `createSecRequester` + activation summary |
| Client presentation | `catalystSourceBadge("sec_edgar")`, enrichment guards |

**No additional code prerequisites identified** for first controlled write beyond applying checkpoint migration when absent.
