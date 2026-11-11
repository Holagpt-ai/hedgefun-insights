# Batch 219 — Radar V2 publication recovery & Operations health V1

**Issues:** **ISS-044** (P0 launch blocker)  
**Base:** GitHub `main` (post Batch 191 acceptance PR **#233**)  
**Branch:** `cursor/batch219-radar-v2-recovery`  
**Date:** November 10, 2026 ET  
**Scope:** Fly worker + Operations health (Batch **219**), **`replace_radar_v22_candidates_v1` cross-date delete order** (Batch **219.1**), **closed-session snapshot named-column copy** (Batch **219.2**), and **closed-session park flush / empty soft_rth_ah wipe guard** (Batch **219.3A**). Migration **`20261110193000` applied** in production; Fly worker **v47** from `f4452bfd`. **219.3A is worker-only** — no further SQL. **No** six-tab scanner, Edge deploy, or cron changes.

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

## Batch 219.2 — closed-session snapshot schema mismatch (confirmed; same pending migration)

**Owner-verified production schema (read-only):**

| Table | Columns | attnum 48 | attnum 49 |
| --- | --- | --- | --- |
| `radar_v22_candidates` | **62** | `promotion_reason` (JSONB) | `radar_event_lifecycle` (TEXT) |
| `radar_v22_closed_snapshot` | **64** | `snapshot_kind` (TEXT) | `captured_at` (TIMESTAMPTZ) |

Cause: snapshot table was created `LIKE radar_v22_candidates` then appended `snapshot_kind` / `captured_at`; later participation columns were added to **both** tables and therefore land **after** those metadata columns on the snapshot table only.

Production RPC used `INSERT INTO radar_v22_closed_snapshot SELECT c.*, 'closed_session', p_synced_at`. That positional list writes candidate col 48 into `snapshot_kind` and col 49 into `captured_at`, aborting the closed-session copy. Both `radar_v22_closed_snapshot` and `radar_v22_carryover_snapshot` currently contain **zero rows**.

**Fix (same `20261110193000` body, still not applied):** named target columns and matching `c.<column>` / `'closed_session'` / `p_synced_at` expressions. Cross-date delete-before-insert (219.1) is unchanged. Generation fencing, transactional rollback, event retention, and carryover triggers are unchanged.

**Do not** restore `SELECT c.*` for tables whose physical column orders diverge.

---

## Batch 219.3A — closed-session snapshot still empty after SQL repair (worker)

**Production read-only (post-apply / Fly v47):** Radar V2 publishes in live sessions; repaired RPC installed; archival triggers enabled; `radar_v22_closed_snapshot` and `radar_v22_carryover_snapshot` remain **0 rows**. Nov 10 **7:55–8:15 PM ET** closed window: Fly log retention **did not include** that interval — exact publish payloads for that park are **NOT AVAILABLE**.

**Reproducible worker defects (Deno):**

1. **`park_closed`** cleared in-memory V2 (`clearV2`) before publishing the empty closed replace. RPC closed-snapshot branch requires `EXISTS` same-day candidates; empty in-memory + prior wipe → nothing to copy.
2. Empty **`soft_rth_ah`** V2 replaces could delete same-day AH candidate rows (only a session-boundary event) before park, leaving the closed branch with nothing to archive.
3. Pre-park flush and empty-closed must use **distinct `p_generation_id` and a later `p_synced_at`**; reusing the same fence keys returns `already_current` and skips the snapshot branch.

**Worker fix (no SQL):** `EvaluateResult.preParkFlush`; `publishRadarV2ClosedParkIfNeeded`; skip empty soft_rth_ah candidate wipes unless non-session events need flush. Ranking, Five Pillars, caps, lifecycle, delayed-feed behavior unchanged.

## Confirmed code defects (reproducible in tests)

1. **`publishRadarV2Generation`** could treat some RPC **`applied: false`** outcomes as success and clear persist-failure telemetry while **`v2_synced_at` never advanced** (including **`stale_generation`** fence rejects; any explicit `applied: false` now fails closed).
2. **`shouldClearPersistFailureTelemetry`** treated churn **`skipped`** V2 cycles as recovery when V2 was enabled — fixed so only a **committed** V2 result clears an outstanding failure (V2 disabled still falls back to V1-only clear).
3. **Operations** (`buildWorkerOpsView`) scored health from **`updated_at`** and feed connection only, and (initially) applied the **15-minute delayed-feed allowance** to **`v2_synced_at`** — now uses **V2 publication cadence** (~120 s stale window, no provider delay).
4. **219.3A:** closed park published empty closed without flushing last live candidates; empty soft_rth_ah could wipe AH rows before snapshot.

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
| `engine.ts` / `persist_v2.ts` / `run.ts` (**219.3A**) | `preParkFlush`; `publishRadarV2ClosedParkIfNeeded`; skip empty soft_rth_ah candidate wipe |

---

## Tests (local)

- Deno: `services/scanner-stream-worker/src/radar/persist_v2_test.ts` (includes **219.3A** park flush / soft_rth_ah skip), `run-health_test.ts`, `persistence_v2_rpc_contract_test.ts`
- Postgres (CI disposable, must execute not skip): `batch219-cross-date-replace-postgres_test.ts` — cross-date 23505, stale_generation, rollback, closed-snapshot named copy, carryover archive, failed-tx snapshot retention
- Vitest: `src/lib/ops/__tests__/ops-control-center.test.ts`

---

## Release procedure (owner-approved)

**Completed (219 / 219.1 / 219.2):** PR #234 merged; Lovable applied `20261110193000`; Fly worker **v47** from `f4452bfd`. Do **not** reapply the migration.

**219.3A remaining:**

1. **Merge** the 219.3A worker PR after CI green.
2. **Deploy Fly only** `scanner-stream-worker` from merged `main` (no SQL, no Edge, no cron).
3. **Accept** the next weekday **20:00 ET** closed park: `radar_v22_closed_snapshot` non-empty with `snapshot_kind='closed_session'` and intact participation fields; later surveillance-date carryover archive as designed.
4. **Frontend:** Vercel for Operations rollup only if that bundle is still pending from earlier 219 work.

**Config check (read-only):** confirm `RADAR_PERSISTENCE_V2_ENABLED=true` on Fly if V2 still does not advance after deploy.

---

## Rollback

1. **SQL:** redeploying the pre-219.1 RPC body (`20261015143000`) **reintroduces both** the cross-date `(symbol)` PK / `23505` defect **and** the positional closed-snapshot insert that leaves closed/carryover tables empty — **do not roll back SQL** unless an owner accepts those consequences and has a data remediation plan. Prefer forward-fix with the current `20261110193000` body.
2. **Fly:** redeploy image **v46** `deployment-01M6K5GH34NZCA1C5Y45AWPVHZ` (see `docs/DEPLOYMENT_STATUS.md`).
3. **Vercel:** prior bundle if Operations rollup must be reverted.

---

## Acceptance

- [ ] V2 `v2_synced_at` advances in active sessions after Fly deploy.
- [ ] Session transitions replace prior-session candidates (no AH board presented as current RTH).
- [ ] Operations worker ≠ **Healthy** when checkpoint fresh but V2 stale or `session_kind` mismatched.
- [ ] Closed session: no false V2 alarm (`not_applicable`).
- [ ] Closed-session park writes `radar_v22_closed_snapshot` with `snapshot_kind='closed_session'`, correct `captured_at`, and participation fields intact; next surveillance date archives carryover.
- [ ] Delayed-feed allowance unchanged (15-minute provider delay).
