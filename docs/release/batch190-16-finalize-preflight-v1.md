# Batch 190.16 — Finalize preflight reads (ISS-034)

**Priority:** P0  
**Base:** GitHub `main` after Batch **190.15**  
**Scope:** Edge `sync-screener-data` only — no migration, no Fly.

## Problem

November 5 production: recurring **HTTP 546** on staged scanner finalization with **~12.8 MB** job rows. Finalize performed multiple **`SELECT *`** loads (full `all_tickers` + merged artifacts) before **`claim_screener_sync_lease_v1`** returned a third full job payload.

## Change

- **`getPreflight(id)`** on the staging store: column list **`STAGING_JOB_PREFLIGHT_SELECT`** (metadata + NHL snapshot; no universe/merged JSON).
- Finalize path: preflight reads for peek, baseline drift, recovery preflight, and error metadata; **one** full job via **`claimWork`** (claim RPC unchanged).
- **`findResumableJob`**: preflight select instead of `*`.
- Continue/finalize HTTP entry: preflight for drift + chunk NHL context (full job still loaded on claim/chunk).
- **`prepareStagedFinalizeRetry`**: when **`publish_rows_inserted`** is set on a **`finalizing`** job, **`completePublish`** / stranded reconcile runs before any definitive dispatch lease release — so uncertain continue-dispatch timeouts (transport) are not treated as hard publish failure when the RPC already recorded rows.

## Activation (owner)

1. Merge PR.
2. Lovable Cloud deploy **`sync-screener-data` only**.
3. Observe Batch **191** RTH/AH publication matrix; do not reapply **190.12** / **190.13** / **190.15** SQL.

## Rollback

Redeploy prior approved Edge revision through Lovable Cloud.
