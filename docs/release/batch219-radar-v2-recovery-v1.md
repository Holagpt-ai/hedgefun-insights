# Batch 219 — Radar V2 publication recovery & Operations health V1

**Issues:** **ISS-044** (P0 launch blocker)  
**Base:** GitHub `main` (post Batch 191 acceptance PR **#233**)  
**Branch:** `cursor/batch219-radar-v2-recovery`  
**Date:** November 10, 2026 ET  
**Scope:** Fly scanner worker V2 publish semantics + Operations worker health rollup. **No** six-tab scanner, Edge SQL, migrations, cron, or provider changes.

## Restrictions honored

No production Fly deploy, Edge deploy, SQL apply, DNS, cron, or secret changes from this batch. **Stop before merge/deploy** unless the owner explicitly approves release steps below.

---

## Verified production evidence — November 10, 2026 (owner-reported)

| Signal | Observation |
| --- | --- |
| Six-tab screener | Publishing normally during RTH |
| Fly worker checkpoint (`radar_v22_feed_state.updated_at`) | Refreshes during RTH |
| Provider observation timestamps | Advance |
| **V2 publication (`v2_synced_at`)** | Stuck ~Nov 9 **~7:59 PM ET** |
| **`session_kind` / candidates** | Still **after-hours** Nov 9 AH set (**89** rows); **no** Nov 10 V2 candidates |
| Feed flags | `feed_stale=false`, `feed_telemetry_stale=false`, `feed_connection_state=subscribed` |
| Operations worker rollup | **Healthy** (checkpoint + connection only) |

`rvol_5m` / `acceleration_5m` null on stored rows is **out of scope** for this batch (no metric fabrication).

---

## Root cause (code-level, reproducible)

1. **`publishRadarV2Generation`** treated RPC `applied: false, reason: stale_generation` as **`ok: true`**, so the worker cleared persist-failure telemetry and loop health while **`v2_synced_at` / `session_kind` never advanced**.
2. **`publishRadarV2IfNeeded`** did not call **`markFailure`** on that path, so the V2 write gate could not back off/retry correctly after a fence reject.
3. **Operations** (`buildWorkerOpsView`) scored health from **`updated_at`** (V1/status checkpoint) and feed connection only — **not** `v2_synced_at` or feed **`session_kind` / `session_date`** alignment with the live market session.

V1 `set_radar_v22_feed_status_v1` can refresh `updated_at` without a V2 commit; that is expected separation — health must not treat it as V2 publication success.

---

## Code changes

| Area | Change |
| --- | --- |
| `services/scanner-stream-worker/src/radar/persist_v2.ts` | `stale_generation` → `{ ok: false, code: "stale_generation" }`; `isRadarV2PublishCommitted()`; `markFailure` on any non-commit |
| `services/scanner-stream-worker/src/radar/run-health.ts` | Loop health / telemetry clear use `isRadarV2PublishCommitted` |
| `services/scanner-stream-worker/src/radar/run.ts` | Persist failure notes include `stale_generation` |
| `src/lib/ops/worker.ts` | `assessV2PublicationFreshness` + rollup via `worstStatus` |

---

## Tests (local)

- Deno: `services/scanner-stream-worker/src/radar/persist_v2_test.ts`, `run-health_test.ts`
- Vitest: `src/lib/ops/__tests__/ops-control-center.test.ts`

---

## Release procedure (owner-approved)

1. **Merge PR** after CI green.
2. **Deploy Fly** `scanner-stream-worker` image from merged `main` (Lovable Cloud or existing Fly pipeline — same artifact as `services/scanner-stream-worker`).
3. **Verify** during RTH (read-only):
   - `radar_v22_feed_state.v2_synced_at` advances within one V2 checkpoint window (~30s default).
   - `session_kind` matches live session; Nov 10 candidates appear for current session.
   - `/admin/operations` worker status **not Healthy** if V2 timestamp or session alignment is stale (post-frontend deploy).
4. **Frontend:** Vercel deploy for Operations rollup change (no Edge/SQL).

**Config check (read-only):** confirm `RADAR_PERSISTENCE_V2_ENABLED=true` on Fly if V2 still does not advance after deploy.

---

## Rollback

1. Revert PR on `main` or redeploy the prior Fly worker image tag recorded before deploy.
2. Operations will again mask V2 staleness until the frontend rollback or forward-fix is live.
3. No database rollback required (no migrations in this batch).

---

## Acceptance

- [ ] V2 `v2_synced_at` advances in active sessions after Fly deploy.
- [ ] Session transitions replace prior-session candidates (no AH board presented as current RTH).
- [ ] Operations worker ≠ **Healthy** when checkpoint fresh but V2 stale or `session_kind` mismatched.
- [ ] Closed session: no false V2 alarm (`not_applicable`).
- [ ] Delayed-feed allowance unchanged (15-minute provider delay).
