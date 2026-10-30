# Batch 190.7 — Staged finalization exception recovery

**Issue:** ISS-034 (P0 open)  
**Scope:** Edge finalize diagnostics + **atomic** lease release CAS (Postgres RPC) — no scanner changes.

## Prerequisites (production)

| Prerequisite | Status |
| --- | --- |
| Batch **190.6** migration `20261030210000` + Edge | **Applied / deployed** (Lovable) |
| Batch **190.7** migration `20261030220000` (`release_screener_sync_finalize_lease_cas_v1`) | **Required before Edge 190.7** |
| Edge `sync-screener-data` 190.7 | Deploy after migration |

## Confirmed incident (2026-10-30 ~20:15 UTC)

| Field | Value |
| --- | --- |
| Job | `ce0593d4-9259-441b-adcd-91b484d432b9` |
| Sync run | `ac60e2a0-5bf7-430f-9a62-3deaa6c34570` |
| Chunks | 7/7 @ 2,200 |
| Status | `finalizing`, state_version **7** |
| Observed | `unexpected error` → continue **`http_500`** |
| Impact | Finalize lease blocked cron until expiry; last publish **20:10 UTC** |

**Original exception not identified** in git. 190.7 hardens recovery; it does **not** prove the root throw is fixed.

## Implementation (190.7 + release-safety)

1. **Allowlisted diagnostics** — stage + sanitized error code + job/run IDs only (no raw messages, URLs, or payloads).
2. **Atomic lease release** — `release_screener_sync_finalize_lease_cas_v1` updates only when `finalizing`, `publish_rows_inserted IS NULL`, matching `state_version` and `finalize_lease_token`.
3. **Uncertain dispatch** — bare `http_*` / timeout-style continue errors **do not** release leases; structured `finalize_failed:*` or in-process catch after confirmed pre-publish failure may release via CAS.
4. **Reconciliation** — complete pending publish when rows already recorded; refresh when feed matches run id.

## Deploy sequence

1. Lovable: apply **`20261030220000_screener_sync_finalize_lease_release_cas_v1.sql`**
2. Lovable: deploy Edge **`sync-screener-data`** from merge head
3. No change to `SCREENER_SYNC_STAGED`, cron, or secrets from git-only work

**ISS-034** stays **P0 OPEN** until verified fresh publication post-deploy.
