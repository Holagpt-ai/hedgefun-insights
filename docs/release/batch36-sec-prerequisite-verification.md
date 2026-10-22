# Batch 36 — SEC activation prerequisite verification (production)

**Project:** `zcjptaolpumhtlwhlemq`  
**Evidence standard:** Direct Postgres read via `scripts/ops/batch36-readonly-prereq.ts` only.

---

## Execution status

| Item | Status |
|------|--------|
| Read-only script executed with approved DB URL | **Not run in Batch 36 workspace** — `HISTORICAL_PRODUCTION_DATABASE_URL` / `LOVABLE_DB_MIGRATION_URL` not present in `.env` / `.env.local` |
| Anonymous REST used for migration proof | **No** (per Batch 36 rules) |

**Action for ops:** Export approved read-only URL, run script, paste JSON below, commit or attach to release ticket.

---

## Expected evidence fields (when script runs)

| Check | SQL / source | Pass criteria |
|-------|----------------|---------------|
| Migration ledger | `supabase_migrations.schema_migrations` versions | Rows for `20260930120000`, `20261020143000`, `20261021183000`, `20261022103000`, `20261022120000` as applicable |
| Statement timeout | `pg_proc.proconfig` for `replace_radar_v22_candidates_v1` | Contains `statement_timeout=120s` |
| Identity ordering | `pg_proc` names | `historical_symbol_history_facts_match`, `historical_identity_apply_diff`, `historical_rollout_symbols_current_through` exist |
| Catalyst schema | `pg_class` | `catalyst_events`, `catalyst_intel_sources` exist |
| SEC checkpoint table | `pg_class` + row count | Table exists; **0 rows** pre-bootstrap; RLS enabled |
| Live SEC events | `count(*) … provider='sec_edgar'` | **0** pre–Gate E (expected) |
| SEC source registry | `catalyst_intel_sources` | Row `sec-latest-filings`, `enabled=false` expected pre-activation |

---

## Recorded production evidence

_Paste output of `batch36-readonly-prereq.ts` here after ops run._

```json
{
  "pending": "Run scripts/ops/batch36-readonly-prereq.ts with approved zcjptaolpumhtlwhlemq database URL"
}
```

---

## Cross-reference (non-authoritative)

Batch 35 reported `sec_edgar_sync_state` absent from PostgREST (**404**). That is **consistent with** an unapplied checkpoint migration but is **not** substituted for ledger evidence in this document.

Historical catch-up through C3.5 implies **catch-up eligibility**, **coverage gaps**, and **identity persistence** are operational; confirm via script ledger rows above.
