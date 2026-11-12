# Batch 226 — Penny Continuation Controlled Persistence & Read Integration V1

**Repository:** Holagpt-ai/hedgefun-insights  
**Baseline:** GitHub `main` `736831e910b0ca57a8ecdb75f900cce8418b0510` (Batch 225 merged)  
**Mode:** Source + migration files only — **no production SQL apply, Edge deploy, or UI wiring**

## Objective

Add an additive Penny-specific persistence and authenticated read path for Batch 225 `penny_continuation_workflow_handoff_v1` payloads, with service-role idempotent upserts, generation fencing, revocation, and a typed client adapter. Does **not** change scanner publication, Radar V2.2 replace, Five Pillars, or late-session Continuation V1 cards.

## Deliverables

| Layer | Artifact |
| --- | --- |
| SQL | `20261112103000_penny_continuation_workflow_handoffs_v1.sql` — table + `upsert` / `list_active` / `revoke` / `expire_stale` RPCs |
| Capture | `capture-penny-continuation-handoffs.ts`, `penny-continuation-workflow-expiry.ts` |
| Bridge | `penny-continuation-handoff-handlers.ts` + `actions.ts` entries (service-role path only) |
| Client | `penny-continuation-handoff-client.ts`, `penny-continuation-handoff-persistence.ts` |
| Tests | Deno `batch226-penny-persistence_test.ts`; Vitest `batch226-penny-continuation-handoff-client.test.ts` |

## Security model

- **Upsert / revoke / expire:** `service_role` only (`REVOKE` from `PUBLIC`).
- **List active:** `authenticated` + `service_role`; requires explicit `(symbol, source_session_date)` pair list (max **64**); returns versioned projection `penny_continuation_handoff_read_v1` (not table rows). Direct `SELECT` on the table is revoked for `authenticated`/`anon`.
- **Stale generation:** upsert returns `{ applied: false, reason: 'stale_generation' }` when `generation_sync_ms` regresses.
- **Revocation:** `penny_continuation_handoff_revoke_v1` sets `revoked_at`; further upserts return `revoked`.
- **Bounded reads:** `list_active_v1` requires an explicit **1–64** `(symbol, source_session_date)` pair list aligned to AM Inbox candidates; returns projection JSON only.

## Activation gate (owner / Lovable Cloud)

1. Apply migration on production Supabase via **Lovable Cloud** (not personal CLI tokens).
2. Deploy Edge `radar-worker-bridge` only when an authorized consumer will call Penny bridge actions.
3. Wire an authorized publisher (e.g. future batch) from `evaluateBoundedPennyContinuationV1` → `projectPennyWorkflowHandoffsFromIntegration` → `buildPennyContinuationHandoffUpsertRowsFromBundle` — **not** enabled in Batch 226.
4. Add React hook / AM Inbox render path consuming `fetchActivePennyContinuationHandoffs` — **deferred**.
5. Schedule `penny_continuation_handoff_expire_stale_v1` if retention policy requires — **deferred**.

## Explicit non-goals (unchanged)

- No `sync-screener-data` or Fly worker calls.
- No Five Pillars or scanner ranking changes.
- No overwrite of Continuation V1 late-session payloads.
