# Batch 172 — Catalyst Source Coverage V1

**Base:** `main` `88de0ae8` (PR #171 merged). **No Edge deploy, no source `enabled` flags, no new providers.**

## Implemented in git (this PR)

| Area | Change |
| --- | --- |
| Company IR | `classifyIrEarningsDisposition`, `source_identity`, `published_at_unavailable` on normalize (`adapters/company-ir.ts`) |
| Scheduled events | Calendar classification + earnings disposition metadata (`adapters/company-events.ts`) |
| Client contract | `src/lib/catalyst/source-evidence-contract.ts` — provenance, schedule vs results, conflict flags |
| Verification | Hydration + guards honor `provider_ticker_conflict` in facts |
| Distribution | Evidence graph nodes carry verification, earnings disposition, published state; platform map unchanged except guard behavior |
| Presentation | `catalystSourceBadge` for `company_ir` and press/news providers |

## Existing in production (not re-verified this batch)

- Ingestion bots: `sync-catalyst-ir`, `sync-catalyst-news`, `sync-catalyst-events`
- GlobeNewswire parser, news continuation, `source-fetch` 304/429 handling
- SEC path unchanged (Gates B–I not reopened)

## Deployment needed (ops, not this PR)

- Edge bundle deploy for adapter/metadata changes
- Per-source `enabled=true` only after Batch 29/34 activation sequence
- Migration ledger for scanner RPC timeout (separate from catalyst sources)

## Still deferred

- Catalyst source activation in production DB (**ISS-006** / Batch 29 ops)
- Paid provider entitlements
- **ISS-015** `chat` Edge deploy
