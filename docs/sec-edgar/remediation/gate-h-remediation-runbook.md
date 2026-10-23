# Gate H — SEC V1C historical misattribution remediation

**Project:** `zcjptaolpumhtlwhlemq`  
**Policy:** `sec-v1c-attribution-remediation-v1`  
**Prerequisite:** Gate G deployed (`sync-sec-edgar-filings` + Attribution Integrity V1)

This package prepares **reversible soft-invalidation** of pre-V1 CIK fan-out rows. It does **not** delete rows or touch `sec_edgar_sync_state`.

---

## Classification (read-only)

Replays `resolveSecFilingAttribution` against each `provider = 'sec_edgar'` row using:

- `dedupe_key` (`sec:{accession}:{symbol}`)
- `facts` (`form_type`, `cik`, `accession_number`, …)
- Current SEC `company_tickers_exchange.json` CIK map (read-only fetch)

Outputs:

| Artifact | Purpose |
| --- | --- |
| `gate-h-classification-report.json` | Counts: confirmed / legitimate / unresolved |
| `sec-v1c-misattribution-allowlist.csv` | **Confirmed misattributions only** |
| `sec-v1c-unresolved-candidates.csv` | Manual review queue (missing facts, CIK map gaps) |

```bash
# Approved read-only/migration Postgres URL required
export HISTORICAL_PRODUCTION_DATABASE_URL='postgresql://…zcjptaolpumhtlwhlemq…'
export SEC_USER_AGENT='…'

deno run -A scripts/ops/sec-v1c-misattribution-classify.deno.ts
```

---

## Schema + RPC (apply migration first)

Migration: `supabase/migrations/20261023103000_sec_v1c_attribution_remediation_v1.sql`

- Extends `catalyst_events.verification_state` with `attribution_invalidated`
- Audit table: `sec_v1c_remediation_audit`
- RPC: `apply_sec_v1c_attribution_invalidation(p_items jsonb, p_policy_version, p_dry_run)`
- RPC: `rollback_sec_v1c_attribution_invalidation(p_batch_id, p_dry_run)`

**UI / feed behavior:** Client and Edge reads filter `verification_state = 'provider_reported'`, so invalidated rows drop from verified surfaces without DELETE.

---

## Dry-run preview (no writes)

After migration is applied on the target database:

```bash
npx vite-node --config vitest.config.ts scripts/ops/sec-v1c-misattribution-remediate.ts
# explicit: --dry-run is default; --csv path optional
```

Expected RPC summary fields:

- `would_apply` — rows that would move to `attribution_invalidated`
- `skipped` — already invalidated or non–`provider_reported`
- `not_found` — allowlist key absent or non-SEC provider
- `applied` — **0** on dry-run

---

## Production apply (separate approval)

```bash
npx vite-node --config vitest.config.ts scripts/ops/sec-v1c-misattribution-remediate.ts --apply
```

Store `batch_id` from RPC JSON for rollback.

---

## Approvals required before apply

| Step | Approver | Evidence |
| --- | --- | --- |
| Migration apply | Platform / DBA | Migration review + staging dry-run |
| Allowlist sign-off | Catalyst ops + data QA | `gate-h-classification-report.json` + spot-check unresolved CSV |
| Production apply | Catalyst ops + product | Dry-run `would_apply` matches signed allowlist row count |
| Post-apply verify | QA | SEC rows hidden from symbol feeds; legitimate rows unchanged |

**Do not** enable SEC cron, `SEC_EDGAR_WRITE_ENABLED`, or Job 50 changes as part of Gate H.

---

## Read-only SQL (pre-classify sanity)

```sql
SELECT count(*) AS sec_rows
FROM public.catalyst_events
WHERE provider = 'sec_edgar'
  AND verification_state = 'provider_reported';

SELECT facts->>'form_type' AS form_type, count(*)
FROM public.catalyst_events
WHERE provider = 'sec_edgar'
  AND verification_state = 'provider_reported'
GROUP BY 1
ORDER BY 2 DESC;
```
