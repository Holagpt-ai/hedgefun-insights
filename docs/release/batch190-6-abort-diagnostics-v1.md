# Batch 190.6 — Staged finalization abort diagnostics

**Issue:** ISS-034 (P0 open until Gate C acceptance is documented with durable evidence)  
**Scope:** PostgreSQL columns + staging-store persistence only — no scanner algorithm, chunk sizing, or publication decision changes.

## Problem

With `SCREENER_SYNC_STAGED=1` active, production observed **nine** staging jobs (**five** published, **four** aborted). Aborted rows had **no durable termination classifier**, so Gate C could not distinguish prior-generation retention from lease expiry or other abort paths. **`continue_last_error`** remains for continuation dispatch failures only.

## Gate C observations (production, pre-190.6)

| Observation | Value |
| --- | --- |
| Staged flag | `SCREENER_SYNC_STAGED=1` |
| Universe | ~13,267 symbols |
| Chunks | 7 × 2,200 |
| CPU Time exceeded | **None confirmed** after staged activation |
| Jobs observed | 9 total — 5 published, 4 aborted |
| Abort reason column | **Absent** — historical aborts are legitimately **NULL/unknown**; do not backfill guessed reasons |

## Migration

**`20261030210000_screener_sync_abort_diagnostics_v1.sql`**

- `abort_reason` — nullable; CHECK allows `prior_generation_retained`, `newer_generation_live`
- `abort_evidence` — nullable JSONB; max 4096 bytes

Apply **after** Batch 190.5 ACL migration (`20261030193000`).

## Runtime behavior (post-deploy)

When staged finalization **aborts without publishing**:

| Path | `abort_reason` | `abort_evidence` |
| --- | --- | --- |
| `shouldPreservePriorScreenerGeneration()` | `prior_generation_retained` | Prior `synced_at`, candidate ids, per-tab status comparison for gappers / gainers_losers / new_highs_lows |
| Atomic publish rejects (`newer_generation_live`) | `newer_generation_live` | Candidate generation + sync_run ids only (no invented preservation payload) |
| Lease/TTL expiry (`expire_screener_sync_stale_jobs_v1`) | **NULL** | **NULL** (unchanged) |

Abort updates require `status IN ('chunking','finalizing')` so **published** jobs cannot be overwritten by stale abort writes.

## Release sequence

1. Merge PR to `main`
2. **Lovable Cloud:** apply `20261030210000` (migration-first)
3. **Lovable Cloud:** deploy Edge `sync-screener-data` from merged head
4. Do **not** change `SCREENER_SYNC_STAGED`, cron, or secrets from git-only work

**ISS-034** stays **P0 OPEN** until acceptance uses post-190.6 abort rows plus a verified fresh publication.
