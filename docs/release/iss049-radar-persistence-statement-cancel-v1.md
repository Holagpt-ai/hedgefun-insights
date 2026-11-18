# ISS-049 — Radar V2 persistence statement cancellations (P0 investigation)

**Date:** November 18, 2026 ET  
**Scope:** Fly worker → Edge `radar-worker-bridge` → Postgres. **Not** `sync-screener-data` atomic screener publication.  
**GitHub `main` (at investigation):** `de3d6d9ce…` (includes ISS-034 rollback docs **#263**).

---

## Lovable-reported signals (owner)

| Signal | Window | Interpretation (bounded) |
| --- | --- | --- |
| **23** database statement cancellations | ~24 h | Postgres `statement_timeout` / cancel class across project DB (multiple RPCs possible) |
| **99** failed Radar database saves | ~8 min | Consistent with **~5 s** Fly eval cadence × sustained `replace_radar_v22_candidates_v1` rejections (not one atomic screener publish) |
| Stale / missing Radar results | Qualitative | Expected when V2 replace fails: last committed `v2_synced_at` retained; board can advance in memory |

---

## Confirmed write path (code)

| Layer | Component | Database surface |
| --- | --- | --- |
| Fly worker | `evaluateAndPublish` → `publishRadarV2IfNeeded` | — |
| Fly worker | `bridge.radarV2Rpc` action **`publish_candidates_v2`** | — |
| Edge | `radar-worker-bridge/handler.ts` → `rpcResult` | RPC **`replace_radar_v22_candidates_v1`** |
| Postgres | Replace RPC body | **`radar_v22_candidates`**, **`radar_v22_events`**, feed/sentinel fields |

**Screener six-tab publish** uses **`sync-screener-data`** → staged job → `publish_screener_*` RPCs on **`screener_sync_generation_jobs`** / publication tables. **Separate defect class** unless logs prove shared root cause.

---

## Failure taxonomy

| Outcome | Data loss? | Retry character |
| --- | --- | --- |
| RPC **`57014`** statement timeout (cancel) | **No** committed partial replace (transaction rolls back) | Bridge returns **502 `persist_failed`**; worker **does not** HTTP-retry application rejections (`bridge.ts` § `applicationRejected`) |
| Client bridge **timeout** (> budget) | **No** | Up to **3** HTTP retries (`LATENCY_BRIDGE_MAX_ATTEMPTS`) — can multiply attempts if budget < DB `statement_timeout` |
| Fence **`already_current` / `stale_generation`** | **No** | Idempotent; not a failed save of new generation bytes |

---

## Root cause (bounded; production ledger not re-opened from Cursor)

1. **Primary:** `replace_radar_v22_candidates_v1` exceeding Postgres **`statement_timeout`** under live candidate/event volume → **`57014`** cancellations.
2. **Amplifier:** V2 **fingerprint churn** on ~5 s eval ticks retries failed writes after a short (15 s) cooldown → burst of failed saves without advancing `v2_synced_at` (matches **~99 / 8 min** order of magnitude).
3. **Mitigations already on `main` (require Fly + migration attestation in prod):**
   - RPC `statement_timeout` migration **`20261020143000`** (+ cross-date delete **`20261110193000`**).
   - Bridge publish timeout **`130_000` ms** (≥ 120 s RPC budget).
   - V2 failure cooldown + event batching (Batch 06R / backpressure commits).

**Not evidence-linked to Nov 18 screener deploy:** Owner attestation — `sync-screener-data` deploy **2026-11-18 ~17:10:30 UTC**, fingerprint `e16fba307fd842e3df5984432153976286bca7221c77f6ac0f8dae820c0a21fd`, Option B **OFF**, first natural generation **17:15 UTC** published **103** rows, six tabs evaluated, Gappers unresolved **0**, no continuation error/abort.

---

## Code correction (this batch — Fly worker only)

Align V2 persist-failure backoff with the configured **checkpoint interval** (capped at 60 s) so sustained DB timeouts do not re-invoke replace RPC every fingerprint change while still allowing session-forced writes.

**Does not:** change SQL, Edge `sync-screener-data`, secrets, or cron.

---

## Owner read-only verification (required before closing ISS-049)

1. **Migration ledger:** `20261020143000` + `20261110193000` applied in Lovable (`pg_proc.proconfig` shows `statement_timeout=120s` on `replace_radar_v22_candidates_v1`).
2. **Fly image:** running worker includes `RADAR_PUBLISH_BRIDGE_TIMEOUT_MS=130_000` (git ≥ Batch 27 bridge timeout).
3. **Log correlation (8 min burst window):** Fly `bridge_database_rejected` / `radar_bridge_rpc_error` with `rpc_name=replace_radar_v22_candidates_v1` and `code=57014` (or Edge equivalent).
4. **Radar vs screener:** confirm cancellations are **not** dominated by `publish_screener_*` during the same window.

---

## Explicit non-goals

- ISS-034 Edge handler / Option B / Gappers accounting changes.
- Other five Lovable reliability warnings (see `lovable-scanner-reliability-warnings.md` #1, #4–#10).
- ISS-024 Layer C migration activation.
- Production timeout / RLS / cron edits from Cursor.