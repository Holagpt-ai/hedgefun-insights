# Batch 190.4 — Staging advance RPC EXECUTE ACL correction

**Gate:** Pre–Gate B security fix (Lovable applies after PR merge).

## Problem

Migration `20261028220000` replaced `advance_screener_sync_chunk_v1` with the **six-argument** signature without `REVOKE`/`GRANT`. PostgreSQL treats that as a new function; default **PUBLIC EXECUTE** remained in production after the four Batch 190 migrations were applied.

## Fix (forward-only)

Migration: `20261030183000_screener_sync_staging_advance_acl_v1.sql`

- Revoke EXECUTE from `PUBLIC`, `anon`, and `authenticated` on  
  `public.advance_screener_sync_chunk_v1(uuid, uuid, integer, integer, jsonb, timestamptz)`.
- Grant EXECUTE to `service_role` only.

## Verification

- `sync-staging-advance-acl-postgres_test.ts` (disposable Postgres bootstrap includes this migration).
- **ISS-034** remains open until staged sync publishes in production.

## Apply order (Lovable Cloud)

After `20261028230000_screener_sync_staging_recovery_v1.sql`, apply **190.4** before enabling Gate B / `SCREENER_SYNC_STAGED=1`.
