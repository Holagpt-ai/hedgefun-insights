# Batch 190.11 — Publish validation surface + RPC transport diagnostics (ISS-034)

**Issue:** ISS-034 (P0 OPEN until post-deploy acceptance)  
**Scope:** Git-only — no production migration apply or Edge deploy from this batch.

## Problem

Production finalize reached `atomic_publish` with seven completed chunks, then failed with opaque `staged_publish_failed`. PostgREST returned a PostgreSQL exception from `replace_screener_results_generation_v1` inside `publish_screener_sync_staged_generation_v1`; the Edge client discarded `message` / `details` / SQLSTATE.

Batch **190.10** (PR **#204**) fixes the dominant **selection** defect: Day Trade Radar top-20 could rank on regular-session `day.v` while rows persisted observation-session volume, producing ratio-tab rows that fail replace validation.

## Corrections (this batch)

1. **SQL (migration `20261101143000`):** Catch replace validation exceptions inside `publish_screener_sync_staged_generation_v1` and return `{ ok: false, reason: <slug> }` instead of aborting the RPC. Count mismatch returns `replace_generation_count_mismatch` without raising.

2. **Edge:** `formatStagedPublishRpcTransportFailure` maps any remaining PostgREST transport errors to bounded reason tokens for `failJob` / logs.

## Production acceptance (after Lovable applies migration + deploy)

1. Failed generations record specific reasons (`nonpositive_volume`, `ratio_tabs_require_positive_prior_session_volume`, etc.) instead of bare `staged_publish_failed` when replace validation rejects rows.
2. With Batch **190.10** Edge logic deployed, extended-session publications succeed without ratio-tab validation failures on Day Trade Radar.

## Tests

- Deno unit tests for publish RPC error slugging.
- Postgres 16 integration tests for surfaced validation reasons (bootstrap includes this migration).
