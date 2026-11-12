# Batch 227 — P0 Scanner production acceptance & targeted corrections

**Repository:** Holagpt-ai/hedgefun-insights  
**Baseline:** GitHub `main` **`6a969e9457909444adce6f582172e40e3f9eee0e`** (Batch **226** PR **#244** merged)  
**Branch:** `cursor/batch227-scanner-p0-acceptance`  
**Date:** November 12, 2026 ET  
**Scope:** Read-only acceptance reconciliation, continuity sync, and **prepared** Lovable Cloud queries. **No** Edge/Fly deploy, SQL apply, cron, secrets, scanner behavior changes, or Penny activation.

**Supersedes:** docs intent in open PR **#243** (Batch 225/226 continuity-only). **Do not merge or close #243 from this batch** — record supersession here; owner may close #243 when convenient.

---

## Confirmed findings (no new code defects authorized)

| Item | Verdict | Evidence |
| --- | --- | --- |
| **ISS-034** | **OPEN (P0)** | Latest **owner-verified** publication ledger through **Nov 10 ~1:30 PM ET** (`batch191-scanner-acceptance-v1.md`). **Nov 10 AH not accepted.** Nov **9** one confirmed **`http_546`**; Nov **10** opening abort mechanism **not conclusively established** (`batch218-iss034-root-cause-closure-gate-v1.md`). **No Nov 11–12 ledger attestation** in repo at batch time — **NOT VERIFIED**. |
| **ISS-024** | **OPEN (P0)** | Nov 10 feed: six tabs **`evaluated`**, Gappers **0** unresolved, NHL **available** (Layer B). **Per-generation** tab evidence history + authenticated UI **NOT VERIFIED** (Layers C/D). |
| **ISS-045** | **Code fixed on `main`; production UI NOT VERIFIED** | Batch **219.3B** merged: `generation_unavailable` no longer shows **Baseline unavailable** when `nhl_baseline_status=available` (`screener-truth-state.test.ts`). Nov **11 ~7:41 AM ET** incident **reported**; requires **Vercel** deploy acceptance only — **no further source fix** in Batch 227. |
| **ISS-044** | **OPEN (P0)** | Fly **v48** deployed (`219.3A`). Closed-session snapshot acceptance pending weekday **20:00 ET** park observation. **No new Fly/SQL** in this batch. |
| **Batch 226 Penny** | **Merged (files only)** | PR **#244** @ `6a969e94`. **Not production-activated** — no migration apply, publisher, or UI hook. |

**Distinctions preserved:** DB `http_546` = confirmed Edge resource limit; **finalize stage** and **CPU-specific cause** = **NOT VERIFIED** unless explicit limit wording or `finalize_stage:*` on row (Batch 218 gate). `prior_generation_retained` = confirmed preservation, not provider outage proof.

---

## November 12 evidence posture

- **Git `main`** includes scanner fail-closed behavior and ISS-045 truth-state fix; **does not** substitute for fresh production ledger/UI attestation.
- **No new owner screenshots or Lovable query exports** were attached to this batch commit. Acceptance gaps after **Nov 10 1:30 PM ET** are explicitly **NOT VERIFIED**, not failures.
- **Admin path (when owner is authenticated admin):** `get_ops_scanner_diagnostics_v1` per Batch 213 — preferred bounded read over ad hoc table SQL.

---

## Prepared read-only verification (Lovable Cloud — owner-authorized)

Run in **read-only** SQL editor or via admin RPC. Do **not** mutate rows.

### A — Publication ledger (ISS-034)

```sql
-- ET session totals (adjust dates)
SELECT
  (created_at AT TIME ZONE 'America/New_York')::date AS et_date,
  CASE
    WHEN (created_at AT TIME ZONE 'America/New_York')::time < time '09:30' THEN 'premarket'
    WHEN (created_at AT TIME ZONE 'America/New_York')::time < time '16:00' THEN 'regular'
    ELSE 'after_hours'
  END AS session_bucket,
  status,
  count(*)::int
FROM public.screener_sync_generation_jobs
WHERE created_at >= '2026-11-11'::timestamptz
  AND created_at <  '2026-11-13'::timestamptz
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;
```

```sql
-- Opening-window abort detail (ISS-034)
SELECT id, status, created_at,
       continue_last_error, abort_reason,
       next_chunk_index, total_chunks,
       publish_rows_inserted
FROM public.screener_sync_generation_jobs
WHERE (created_at AT TIME ZONE 'America/New_York')::date = '2026-11-12'
  AND (created_at AT TIME ZONE 'America/New_York')::time BETWEEN time '09:25' AND time '10:15'
ORDER BY created_at;
```

### B — Current feed + tab evidence (ISS-024)

```sql
SELECT state_key, status, synced_at, rows_inserted,
       tab_counts, tab_evaluation_evidence,
       nhl_baseline_status, provider_as_of_min, provider_as_of_max
FROM public.screener_feed_state
WHERE state_key = 'current';
```

```sql
-- Gappers unresolved count on latest published generation (if exposed in evidence JSON)
SELECT tab_evaluation_evidence->'gappers'->>'unresolved_gap_input_count' AS gappers_unresolved
FROM public.screener_feed_state
WHERE state_key = 'current';
```

### C — NHL baseline vs UI (ISS-045)

Compare `nhl_baseline_status` from feed state with authenticated Screeners NHL tab during a job window where `nhl_baseline_loaded=true` in the corresponding generation job observation (job row / admin diagnostics). **Mismatch after Vercel deploy** → reopen UI acceptance; **no baseline SQL change**.

### D — Radar closed snapshot (ISS-044)

```sql
SELECT snapshot_kind, trading_date, candidate_count, created_at, generation_id
FROM public.radar_v22_closed_snapshot
ORDER BY created_at DESC
LIMIT 5;
```

```sql
SELECT trading_date, count(*)::int
FROM public.radar_v22_candidates
WHERE trading_date >= current_date - 3
GROUP BY 1
ORDER BY 1 DESC;
```

---

## Targeted corrections

**None in Batch 227.** No confirmed unreleased scanner source defect beyond already-merged **219.3B** (ISS-045). Do **not** weaken `prior_generation_retained`, finalize fencing, or evidence gates.

---

## Remaining production acceptance requirements

1. **ISS-034:** Complete Batch **191** matrix — Nov **10 AH**, multi-day RTH/AH, characterize opening-window aborts without speculating CPU; optional `finalize_stage:*` correlation on **new** failures only.
2. **ISS-024:** Layer C/D — per-job tab evidence replay + authenticated Six-tab UI acceptance.
3. **ISS-045:** Vercel deploy + owner NHL tab check with baseline **available** during `generation_unavailable` / session-gate states.
4. **ISS-044:** Post-**20:00 ET** weekday closed-snapshot row when eligible candidates exist (Fly v48).
5. **ISS-025 / AM Inbox:** Authenticated UI (separate from scanner P0 but blocks launch narrative).

---

## Tests (this batch)

Documentation only — **no application diff**. Regression suites for scanner remain on `main` (`screener-truth-state`, Batch 191/218 runbooks).
