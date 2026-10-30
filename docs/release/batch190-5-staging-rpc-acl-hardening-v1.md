# Batch 190.5 — Staging sync RPC ACL hardening (Lovable production gap)

**Gate:** Pre–Gate B after **190.4** advance fix.

## Problem

Git migrations revoked **PUBLIC** EXECUTE on staging sync RPCs but did not always revoke **anon** / **authenticated**. Lovable Cloud production retained **direct EXECUTE grants** to those platform roles on five functions (disposable PostgreSQL CI did not mirror that state until **190.5**).

## Fix

Migration: `20261030193000_screener_sync_staging_rpc_acl_hardening_v1.sql`

Explicit `REVOKE ALL … FROM PUBLIC, anon, authenticated` and `GRANT EXECUTE … TO service_role` on:

- `claim_screener_sync_lease_v1`
- `complete_screener_sync_publish_v1`
- `record_screener_sync_publish_rpc_v1`
- `expire_screener_sync_stale_jobs_v1`
- `publish_screener_sync_staged_generation_v1`

Six-arg `advance_screener_sync_chunk_v1` remains covered by **190.4**.

## CI fidelity

`supabase/tests/screener-sync-pg/01-simulate-lovable-staging-rpc-grants.sql` runs after migrations through **190.4**, then **190.5** applies. Postgres ACL tests assert effective privileges (not SQL text alone).

## Apply order (Lovable Cloud)

After `20261030183000`, apply **190.5** before Gate B / `SCREENER_SYNC_STAGED=1`.

**ISS-034** remains open until production staged publish is verified.
