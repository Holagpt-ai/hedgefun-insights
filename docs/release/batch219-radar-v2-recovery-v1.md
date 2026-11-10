# Batch 219 — Radar V2 publication recovery & Operations health V1

**Issues:** **ISS-044** (P0 launch blocker)  
**Base:** GitHub `main` (post Batch 191 acceptance PR **#233**)  
**Branch:** `cursor/batch219-radar-v2-recovery`  
**Date:** November 10, 2026 ET  
**Scope:** Fly worker + Operations health (Batch **219**) and **`replace_radar_v22_candidates_v1` cross-date delete order** (Batch **219.1** migration file only — **not applied** in this session). **No** six-tab scanner, Edge deploy, cron, or production SQL apply.

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

## Batch 219.1 — SQL defect (confirmed; migration pending Lovable apply)

**Table:** `radar_v22_candidates` — **`PRIMARY KEY (symbol)`** (global symbol uniqueness, not scoped to `trading_date`).

**Defect (matches latest GitHub RPC `20261015143000` / production order per owner read-only inspection):**

1. `DELETE … WHERE trading_date = p_trading_date`
2. `INSERT` incoming candidates
3. `DELETE … WHERE trading_date < p_trading_date` **after** insert

When surveillance advances (e.g. Nov **10** publish with symbols still present on Nov **9** AH), step 2 collides on `(symbol)` **before** step 3 removes prior-day rows → PostgreSQL **`23505`** (unique violation). Sampled Fly logs show **`publish_candidates_v2` HTTP 502** with **`rpc_error_code: 23505`**; the **exact constraint name** on the failed request is **not captured**.

**Fix (`20261110193000_radar_v22_cross_date_candidate_delete_v1.sql`):** delete `trading_date < p_trading_date` **then** same-day delete **then** `INSERT`; remove post-insert cleanup. Re-assert `statement_timeout = 120s`. Signature, `SECURITY DEFINER`, `search_path = ''`, grants unchanged.

**Regression:** `supabase/functions/_shared/radar-v22/batch219-cross-date-replace-postgres_test.ts` (CI: disposable Postgres + `scripts/supabase/radar-v22-pg-test-setup.mjs`).

---

## Confirmed code defects (reproducible in tests)

1. **`publishRadarV2Generation`** could treat some RPC **`applied: false`** outcomes as success and clear persist-failure telemetry while **`v2_synced_at` never advanced** (including **`stale_generation`** fence rejects; any explicit `applied: false` now fails closed).
2. **`shouldClearPersistFailureTelemetry`** treated churn **`skipped`** V2 cycles as recovery when V2 was enabled — fixed so only a **committed** V2 result clears an outstanding failure (V2 disabled still falls back to V1-only clear).
3. **Operations** (`buildWorkerOpsView`) scored health from **`updated_at`** and feed connection only, and (initially) applied the **15-minute delayed-feed allowance** to **`v2_synced_at`** — now uses **V2 publication cadence** (~120 s stale window, no provider delay).

V1 `set_radar_v22_feed_status_v1` can refresh `updated_at` without a V2 commit; that separation is expected.

## Production mechanism — read-only Fly evidence (Nov 10, 2026 UTC)

**Not conclusively `stale_generation` in production** (no matching log lines in sampled `fly logs`).

| Evidence | Observation |
| --- | --- |
| V2 disabled? | **No** — repeated `publish_candidates_v2` bridge calls |
| Worker image | `stocksist-radar-v22-worker` release **v46** (`deployment-01M6K5GH34NZCA1C5Y45AWPVHZ`), machine **started** — **predates Batch 219 worker fixes** |
| V1 path | `publish_generation` **HTTP 200** on same timeline |
| V2 failures (sample) | **`publish_candidates_v2` HTTP 502**, `bridge_database_rejected`, **`rpc_error_code: 23505`** (Postgres unique violation class) |
| Worker logs | `radar_persist_v2_failed` with **`persist_failed`** |

**Hypothesis (unverified):** bridge/RPC or DB constraint failure on V2 replace is blocking `v2_synced_at` advancement; the **`stale_generation` misclassification** is a separate defect that could mask fence rejects **if** they occur. **23505** root cause (payload/event idempotency vs schema) is **out of scope** for this batch unless owner approves a follow-up.

Operations cannot read `RADAR_PERSISTENCE_V2_ENABLED` from the browser; absence of `v2_synced_at` during a live session is treated as a V2 publication problem, not as “disabled.”

---

## Code changes

| Area | Change |
| --- | --- |
| `services/scanner-stream-worker/src/radar/persist_v2.ts` | `stale_generation` → `{ ok: false, code: "stale_generation" }`; `isRadarV2PublishCommitted()`; `markFailure` on any non-commit |
| `services/scanner-stream-worker/src/radar/run-health.ts` | Telemetry clear requires committed V2; **`skipped` does not clear**; loop health unchanged on churn skip |
| `services/scanner-stream-worker/src/radar/run.ts` | Persist failure notes include `stale_generation` |
| `src/lib/ops/worker.ts` | `assessV2PublicationFreshness` (**120 s** stale window, no provider delay) + rollup via `worstStatus` |

---

## Tests (local)

- Deno: `services/scanner-stream-worker/src/radar/persist_v2_test.ts`, `run-health_test.ts`
- Vitest: `src/lib/ops/__tests__/ops-control-center.test.ts`

---

## Release procedure (owner-approved)

1. **Merge PR #234** after CI green.
2. **Lovable Cloud:** apply migration **`20261110193000_radar_v22_cross_date_candidate_delete_v1.sql`** (append-only; no historical migration edits).
3. **Deploy Fly** `scanner-stream-worker` image from merged `main` (worker Batch 219 failure/telemetry fixes; image **v46** predates PR).
3. **Verify** during RTH (read-only):
   - `radar_v22_feed_state.v2_synced_at` advances within one V2 checkpoint window (~30s default).
   - `session_kind` matches live session; Nov 10 candidates appear for current session.
   - `/admin/operations` worker status **not Healthy** if V2 timestamp or session alignment is stale (post-frontend deploy).
4. **Frontend:** Vercel deploy for Operations rollup change (no Edge/SQL).

**Config check (read-only):** confirm `RADAR_PERSISTENCE_V2_ENABLED=true` on Fly if V2 still does not advance after deploy.

---

## Rollback

1. **SQL:** redeploy prior `replace_radar_v22_candidates_v1` body from `20261015143000` via approved Lovable apply (restores old delete order; only safe if V2 publication already cleared).
2. **Fly:** redeploy image **v46** `deployment-01M6K5GH34NZCA1C5Y45AWPVHZ` (see `docs/DEPLOYMENT_STATUS.md`).
3. **Vercel:** prior bundle if Operations rollup must be reverted.

---

## Acceptance

- [ ] V2 `v2_synced_at` advances in active sessions after Fly deploy.
- [ ] Session transitions replace prior-session candidates (no AH board presented as current RTH).
- [ ] Operations worker ≠ **Healthy** when checkpoint fresh but V2 stale or `session_kind` mismatched.
- [ ] Closed session: no false V2 alarm (`not_applicable`).
- [ ] Delayed-feed allowance unchanged (15-minute provider delay).
