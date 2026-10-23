# SEC filing attribution integrity V1

## Root cause

`toCatalystRowsFromSec` expanded **every** CIK listing from `company_tickers_exchange.json` into a separate `catalyst_events` row (`sec:{accession}:{symbol}`). Issuer-level filings (for example **424B2** shelf supplements) therefore created false per-ticker catalysts for structured notes, preferreds, and other listings that share one CIK.

The Catalyst Intelligence SEC bot already failed closed on `MULTIPLE_CIK_TICKERS`, but the **V1C `sync-sec-edgar-filings` path** did not.

## Rules implemented (`sec-filing-attribution.ts`)

| Case | Behavior |
| --- | --- |
| **424B2 / S-3 / shelf family** | No CIK fan-out. Attribute only with **one** CIK listing or **explicit ticker evidence** in filing metadata. |
| **10-K / 10-Q / 8-K** | Prefer a **single common** listing (non-preferred symbol). Multi-class without a unique common → unattributed. |
| **Explicit `(NYSE: TICK)` evidence** | Security-specific attribution to that symbol when it exists on the CIK. |
| **Unmapped CIK** | No row (existing behavior). |
| **Ambiguous** | Increment `rows_attribution_unattributed`; issuer identity preserved via accession + CIK in logs/facts; **no** fabricated ticker row. |

Issuer-only identity key (non-`catalyst_events`): `sec:{accession}:issuer` for future issuer-level intelligence surfaces.

## Proposed remediation — ~95 existing misattributed rows

**Do not run in production from this PR.** Use an explicit allowlist built from analyst review.

1. **Identify candidates** (read-only SQL):

```sql
-- Example pattern: 424B2 rows where facts show issuer-level form and symbol is not the only listing for CIK
SELECT dedupe_key, symbol, facts->>'accession_number' AS accession, facts->>'form_type' AS form_type
FROM catalyst_events
WHERE provider = 'sec_edgar'
  AND facts->>'form_type' IN ('424B2','424B3','424B4','424B5','S-3','S-3/A')
ORDER BY published_at DESC;
```

2. **Curate** `docs/sec-edgar/remediation/sec-v1c-misattribution-allowlist.csv` with columns: `dedupe_key`, `reason`, `reviewed_by`, `reviewed_at`.

3. **Reversible action** (future maintenance window): soft-invalidate or archive allowlisted rows only — never `DELETE` all SEC rows. Prefer marking verification/state fields or moving to an issuer-level store when available.

4. **Re-ingest**: After deploy, new filings use conservative attribution; legitimate single-ticker rows remain idempotent via unchanged `sec:{accession}:{symbol}` keys.

## Deploy steps (post-merge)

1. Deploy **`sync-sec-edgar-filings`** Edge function (no migration, no write-flag change).
2. Optional: deploy **`market-data`** only if bundled in same release (not required for this fix).
3. Run **`dry_run`** sync and confirm `rows_attribution_unattributed` > 0 for known multi-ticker 424B2 samples while `rows_validated` no longer multiplies per CIK.
4. Execute remediation allowlist in a separate approved change set (Gate H — `docs/sec-edgar/remediation/gate-h-remediation-runbook.md`).

## Unchanged

- SEC request limits, checkpoint anchors, accession dedupe for **correct** attributions
- `SEC_EDGAR_WRITE_ENABLED` gate
- Catalyst Intelligence bot / job 50 wiring
