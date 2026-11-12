# Batch 227 — P0 Scanner production acceptance & targeted corrections

**Repository:** Holagpt-ai/hedgefun-insights  
**Baseline:** GitHub `main` **`6a969e9457909444adce6f582172e40e3f9eee0e`** (Batch **226** PR **#244** merged)  
**Branch:** `cursor/batch227-scanner-p0-acceptance` · **PR #245**  
**Date:** November 12, 2026 ET  
**Scope:** Read-only acceptance reconciliation, continuity sync, and Lovable Cloud query pack. **No** Edge/Fly deploy, SQL apply, cron, secrets, scanner behavior changes, or Penny activation.

**Supersedes:** docs intent in open PR **#243** (Batch 225/226 continuity-only). **Do not merge or close #243 from this batch** — record supersession here; owner may close #243 when convenient.

---

## Confirmed findings (no new code defects authorized)

| Item | Verdict | Evidence |
| --- | --- | --- |
| **ISS-034** | **OPEN (P0)** | Batch **191** ledger through **Nov 10 ~1:30 PM ET** preserved in `batch191-scanner-acceptance-v1.md` (**Nov 10 AH not accepted**). **Nov 11** full ET day and **Nov 12** through **~11:00 AM ET** owner-verified via read-only Lovable (below). Opening-window aborts on **Nov 11** and **Nov 12** at **09:30** show **`finalize_stage:claim_finalize_lease`**; **Nov 11 09:45** **`prior_generation_retained`** (Gainers/Losers prerequisite unavailable — tab status, not provider proof). **Nov 12** publishing resumed **09:45**. **Do not** infer CPU-specific failure or exact root cause. Full Batch **191** RTH/AH matrix and multi-day sign-off still **incomplete**. |
| **ISS-024** | **OPEN (P0)** | **Layer B verified** @ Nov 12 ~11:00 AM ET: **104** rows, six tabs **`evaluated`**, Gappers **0** unresolved, NHL **available**; Day Trade Radar **4** rows, other five tabs **20** each. **Layer C/D** (per-generation tab evidence replay + authenticated UI) **NOT VERIFIED**. Nov 10 ~1:30 PM feed attestation in Batch **191** **preserved**. |
| **ISS-045** | **Code fixed on `main`; production UI NOT VERIFIED** | Batch **219.3B** on `main`. **Vercel production deployment identity NOT VERIFIED** — do **not** infer from PR preview checks. Owner NHL tab acceptance during session-gate / `generation_unavailable` still required. |
| **ISS-044** | **OPEN (P0)** | Fly **v48** (`219.3A`). Read-only checkpoint: **`radar_v22_closed_snapshot` = 0 rows**; **`radar_v22_candidates` = 176** rows for **Nov 12** market date. Closed-session park eligibility and **20:00 ET** execution acceptance **not** established — **no fix proposed** in this batch. |
| **Batch 226 Penny** | **Merged (files only)** | PR **#244** @ `6a969e94`. **Not production-activated**. |

**Distinctions preserved:** DB `http_546` = confirmed Edge resource limit when recorded; **`finalize_stage:*`** on a row = stage marker only — **not** CPU proof (Batch **218** gate). `prior_generation_retained` = confirmed preservation, not provider outage proof.

---

## Owner-verified production evidence — November 11–12, 2026 (read-only Lovable)

Independent review **November 12, 2026** (read-only Lovable Cloud). **Historical Nov 10** counts remain authoritative in `batch191-scanner-acceptance-v1.md` — not replaced.

### Publication ledger (Layer A)

| Date | Session | Published | Aborted | Notes |
| --- | --- | ---: | ---: | --- |
| **Nov 11** | Premarket | **66** | **0** | |
| **Nov 11** | Regular | **71** | **2** | |
| **Nov 11** | After-hours | **48** | **0** | |
| **Nov 12** | Premarket | **66** | **0** | |
| **Nov 12** | Regular | **16** | **1** | Through **~11:00 AM ET** only — **not** full RTH day |

### Opening-window abort detail (ISS-034 characterization)

| ET timestamp | Mechanism / marker (from job row) |
| --- | --- |
| **Nov 11 09:30** | **`finalize_stage:claim_finalize_lease`** |
| **Nov 11 09:45** | **`prior_generation_retained`**; Gainers/Losers **prerequisite unavailable** (tab status in abort evidence) |
| **Nov 12 09:30** | **`finalize_stage:claim_finalize_lease`** |
| **Nov 12 09:45** | Publishing **resumed** (subsequent published job in window) |

### Current feed @ ~11:00 AM ET Nov 12 (Layer B)

| Field | Value |
| --- | --- |
| **`rows_inserted`** | **104** |
| Six tabs | all **`evaluated`** |
| Gappers | **0** unresolved |
| NHL baseline | **`available`** |
| Day Trade Radar tab row count | **4** |
| Other five screener tabs | **20** each |

### Radar V2 (ISS-044)

| Table | Checkpoint |
| --- | --- |
| `radar_v22_closed_snapshot` | **0** rows |
| `radar_v22_candidates` (Nov 12 trading date) | **176** rows |

---

## November 10 evidence (preserved — Batch 191 / PR #233)

Do **not** regress or overwrite:

- Nov **10** RTH through **1:30 PM:** **43** published, **4** aborted; feed **107** rows @ 1:30 PM.
- **Nov 10 after-hours:** **NOT accepted**.
- Nov **6/9** session totals in `batch191-scanner-acceptance-v1.md`.

---

## Prepared read-only verification (Lovable Cloud — owner-authorized)

Run in **read-only** SQL editor or via admin RPC. Do **not** mutate rows.

### A — Publication ledger (ISS-034)

Use **Eastern calendar-day bounds** (`timezone('America/New_York', …)`) so UTC midnight literals do not skew ET dates. Session buckets match equities scan window **04:00–20:00 ET** (premarket / regular / after-hours).

```sql
-- Adjust et_start_date / et_end_date (end exclusive)
WITH bounds AS (
  SELECT
    timezone('America/New_York', timestamp '2026-11-11 00:00:00') AS start_ts,
    timezone('America/New_York', timestamp '2026-11-13 00:00:00') AS end_ts
)
SELECT
  (j.created_at AT TIME ZONE 'America/New_York')::date AS et_date,
  CASE
    WHEN (j.created_at AT TIME ZONE 'America/New_York')::time >= time '04:00'
     AND (j.created_at AT TIME ZONE 'America/New_York')::time <  time '09:30' THEN 'premarket'
    WHEN (j.created_at AT TIME ZONE 'America/New_York')::time >= time '09:30'
     AND (j.created_at AT TIME ZONE 'America/New_York')::time <  time '16:00' THEN 'regular'
    WHEN (j.created_at AT TIME ZONE 'America/New_York')::time >= time '16:00'
     AND (j.created_at AT TIME ZONE 'America/New_York')::time <  time '20:00' THEN 'after_hours'
    ELSE 'outside_scan_window'
  END AS session_bucket,
  j.status,
  count(*)::int
FROM public.screener_sync_generation_jobs j
CROSS JOIN bounds b
WHERE j.created_at >= b.start_ts
  AND j.created_at <  b.end_ts
  AND j.status IN ('published', 'aborted')
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;
```

```sql
-- Opening-window abort detail (ISS-034) — single ET calendar day
WITH day_bounds AS (
  SELECT
    timezone('America/New_York', timestamp '2026-11-12 00:00:00') AS start_ts,
    timezone('America/New_York', timestamp '2026-11-13 00:00:00') AS end_ts
)
SELECT id, status, created_at,
       continue_last_error, abort_reason,
       next_chunk_index, total_chunks,
       publish_rows_inserted
FROM public.screener_sync_generation_jobs j
CROSS JOIN day_bounds d
WHERE j.created_at >= d.start_ts
  AND j.created_at <  d.end_ts
  AND (j.created_at AT TIME ZONE 'America/New_York')::time BETWEEN time '09:25' AND time '10:15'
ORDER BY j.created_at;
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

Compare `nhl_baseline_status` from feed state with authenticated Screeners NHL tab during a job window where `nhl_baseline_loaded=true` in the corresponding generation job observation (job row / admin diagnostics). **Vercel production SHA NOT VERIFIED** in this batch. **Mismatch after verified deploy** → reopen UI acceptance; **no baseline SQL change**.

### D — Radar closed snapshot (ISS-044)

Use **`captured_at`** (not nonexistent `created_at` / `candidate_count` on snapshot metadata). Aggregate row counts with **`count(*)`**.

```sql
SELECT snapshot_kind, trading_date, captured_at, count(*)::int AS row_count
FROM public.radar_v22_closed_snapshot
GROUP BY snapshot_kind, trading_date, captured_at
ORDER BY captured_at DESC NULLS LAST
LIMIT 10;
```

```sql
SELECT trading_date, count(*)::int AS candidate_rows
FROM public.radar_v22_candidates
GROUP BY trading_date
ORDER BY trading_date DESC
LIMIT 5;
```

---

## Targeted corrections

**None in Batch 227.** No confirmed unreleased scanner source defect beyond already-merged **219.3B** (ISS-045). Do **not** weaken `prior_generation_retained`, finalize fencing, or evidence gates.

---

## Remaining production acceptance requirements

1. **ISS-034:** Batch **191** matrix — **Nov 10 AH**, **Nov 12** full RTH through **16:00** and AH **16:00–20:00**, multi-day sign-off; characterize new opening-window aborts using markers only.
2. **ISS-024:** Layer **C/D** — per-job tab evidence replay + authenticated Six-tab UI acceptance.
3. **ISS-045:** **Verify Vercel production deployment** (identity unverified) + owner NHL tab check with baseline **available** during `generation_unavailable` / session-gate states.
4. **ISS-044:** Establish closed-session **eligibility** and observe **20:00 ET** weekday park; expect non-empty `radar_v22_closed_snapshot` when eligible (Fly v48). **0 rows** at Nov 12 ~11 AM checkpoint — acceptance **not** met.
5. **ISS-025 / AM Inbox:** Authenticated UI (separate from scanner P0 but blocks launch narrative).

---

## Tests (this batch)

Documentation only — **no application diff**. Regression suites for scanner remain on `main` (`screener-truth-state`, Batch 191/218 runbooks).
