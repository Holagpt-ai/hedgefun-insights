# Batch 228 — Opening-bell scanner finalization reliability

**Issue:** ISS-034 (P0)  
**Base:** GitHub `main` **`e7a3eaeeceec1310e941d263dd5df63fd3b76998`** (Batch **227** PR **#245** merged)  
**Branch:** `cursor/batch228-opening-bell-finalize`  
**Date:** November 12, 2026 ET  
**Scope:** Edge staging finalization lifecycle only. **No** SQL apply, Fly deploy, cron schedule, secrets, ranking, or publication policy changes.

---

## Confirmed production evidence (ledger)

| Observation | Value |
| --- | --- |
| **09:30 ET** jobs **Nov 10, 11, 12** | **7/7** chunks; **no** publish RPC; **aborted** ~**12–15 min** later; `abort_reason` **null**; last durable marker often **`finalize_stage:claim_finalize_lease`** |
| **Recovery** | Publishing resumes (**09:45+** on Nov 11–12; **10:00+** on Nov 10 per Batch **218**) |
| **Nov 10 after-hours** (owner-verified) | **48** published, **0** aborted; **48/48** with complete chunks and publish RPCs (**Layer A ledger**; **not** full UI acceptance) |
| **CPU / exact finalize kill stage** | **NOT VERIFIED** |

**Do not** treat `finalize_stage:claim_finalize_lease` as proof the isolate failed inside `claim_screener_sync_lease_v1`. Pre–Batch **228** code persisted that marker **before** the CAS claim returned (diagnostic ordering bug — **fixed** in this batch).

---

## Verified cause vs hypotheses

| Finding | Status |
| --- | --- |
| Stranded finalize (no publish RPC; lease held until TTL) leaves **`finalize_lease_expires_at`** set (**12 min** lease) | **Confirmed** (code + production null-`abort_reason` aborts; **Edge isolate kill / CPU NOT VERIFIED**) |
| `expire_screener_sync_stale_jobs_v1` aborts finalizing jobs when **`finalize_lease_expires_at < now`** and **`publish_rows_inserted IS NULL`** with **`abort_reason` NULL** | **Confirmed** (`batch190-6-abort-diagnostics-v1.md`) — matches production null-reason aborts |
| Cron ran **`abortExpired` before** any lease release, discarding **7/7** work instead of redispatching finalize | **Confirmed race** in handler + orchestrator ordering |
| `stagedJobNeedsResume` treated **`finalize_stage:*`** as dispatch failure while lease still active → duplicate finalize pressure at the open | **Confirmed** (resume unit tests) |
| Opening bell **heavier** finalize work (session transition, NHL baseline reload) vs **09:25** premarket success | **Hypothesis** (consistent with timing; **not** isolated root cause proof) |
| Edge **CPU** / **`http_546`** on Nov 10–12 **09:30** rows | **NOT VERIFIED** on those rows (Nov **9** `http_546` remains historical) |

---

## Code changes (fail-closed)

1. **`releaseExpiredFinalizeLeasesBeforeAbort`** — before `abortExpired`, CAS-release expired finalize leases (existing **`release_screener_sync_finalize_lease_cas_v1`**) so the same generation can redispatch finalize instead of terminal abort.
2. **`stagedJobNeedsResume`** — do not resume while finalize lease is active and `continue_last_error` is **only** a `finalize_stage:*` progress marker.
3. **`finalizeStagedScreenerGeneration`** — persist `claim_finalize_lease` marker **after** successful `claimWork` (accurate stage attribution).

---

## Comparison: 09:25 vs 09:30 vs 09:45+

| Window | Typical outcome | Mechanism class |
| --- | --- | --- |
| **09:25 premarket** | Published | Finalize completes within lease; lighter session context |
| **09:30 RTH open** | Abort after ~lease TTL | Stranded finalize → lease expiry → **`expire_*` abort** (pre-228); possible concurrent cron pressure (mitigated §2) |
| **09:45+** | Published or **`prior_generation_retained`** | New generation; retention is **documented** fail-closed policy when tabs would degrade (Batch **218**) |

---

## Read-only diagnostics (if post-deploy aborts persist)

```sql
SELECT id, status, created_at, updated_at,
       next_chunk_index, total_chunks,
       finalize_lease_token IS NOT NULL AS has_finalize_lease,
       finalize_lease_expires_at,
       publish_rows_inserted, publish_rpc_recorded_at,
       continue_last_error, abort_reason,
       abort_evidence
FROM public.screener_sync_generation_jobs
WHERE (created_at AT TIME ZONE 'America/New_York')::date IN ('2026-11-10', '2026-11-11', '2026-11-12')
  AND (created_at AT TIME ZONE 'America/New_York')::time BETWEEN time '09:28' AND time '09:48'
ORDER BY created_at;
```

Correlate with Edge logs for **`staged_finalize_stage_enter`**, **`continue_dispatch_failed`**, and any **`http_546`** on parent dispatch — without inferring CPU unless explicitly logged.

---

## Deployment

- **Requires:** Lovable Cloud Edge deploy of **`sync-screener-data`** from merged head (existing RPC **`release_screener_sync_finalize_lease_cas_v1`** must already be applied — production has it from Batch **190.7**).
- **No** new SQL migration in this batch.

---

## Tests

- `batch228-opening-bell-finalize_test.ts`
- `sync-staging-resume_test.ts` (stage marker + active lease)
- Existing `sync-staging-expiry_test.ts` unchanged (abort-after-expiry contract preserved when release skipped)

---

## Production release attestation — November 12, 2026

- **Authorization:** Owner explicitly accepted one-time Git-snapshot-only rollback exception, because previous active Edge revision and a restorable platform version were unavailable. This exception is **only** for Batch 228 `sync-screener-data`. Git fallback `e7a3eaeeceec1310e941d263dd5df63fd3b76998` requires separate redeploy and is **not** previous live binary.
- **Source:** GitHub main `caefbe6b5e5d83582d0a69c8cf6f74bf3b0d0def` (PR #246 merged), Lovable editor `09266183e352b6a21f61acbd10d23ce91b2016f8`; verified scanner runtime source parity. An unrelated auto-regenerated frontend `types.ts` differs due to unapplied Penny RPC; scanner deployment unaffected. Penny UI and migrations remain deferred.
- **Platform result:** Lovable Cloud reported `Successfully deployed edge functions: sync-screener-data` once. UTC window **2026-11-12 17:18:24–17:18:34**, source/settings fingerprint `07656eebf28569838df72838ea1f5c2026344167eb157b2728b25291bcbe3e29`. Running Edge version/revision ID was **not** returned. OPTIONS returned HTTP 200; logs returned no revision evidence.
- **Nonmutating postdeploy query 12:19 ET:** Latest feed 107 rows with `synced_at` ~12:15 ET, **pre-deployment**; not an acceptance success. No manual scan triggered.
- **Acceptance remains OPEN:** ISS-034 requires natural **Friday, Nov 13, 09:30 ET** generation and lease behavior; do not infer finalize performance from deploy success.
- **Scope controls:** No SQL, migrations, Fly, cron, secrets/env, other Edge function, frontend publish, Penny/overnight activation or other prod modifications.
