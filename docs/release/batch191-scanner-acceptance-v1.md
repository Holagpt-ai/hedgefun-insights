# Batch 191 — Scanner production acceptance V1 (read-only)

**Issues:** ISS-034 (P0), ISS-024 (tab evidence), ISS-033 (premarket D1 — partial)  
**Base:** GitHub `main` `fcef28f6` (Batch 218 #232 merged)  
**Branch:** `cursor/batch191-scanner-acceptance-v1`  
**Review window:** November 10, 2026, **~1:26 PM ET** (acceptance capture time)  
**Scope:** Bounded **read-only** production acceptance. **No** Edge/SQL/Fly/cron/deploy. **No** code changes unless a reproducible production defect is established (none found).

**Contract:** `docs/release/STOCKSIST_MASTER_PENDING_BACKLOG_2026-10-28.md` § Batch 191; supplementary continuity in Batch **218** runbook and **ISSUE_REGISTER**.

---

## Evidence sources used this session

| Source | What was obtained | Limit |
| --- | --- | --- |
| **Public PostgREST** (`screener_feed_state`, `state_key=current`) | Live snapshot **2026-11-10T18:25:03Z** via production anon key (same as public SPA) | Current generation only; no job ledger |
| **Owner-reported / prior continuity** (Batches 207, 218, register) | Nov 2 premarket, Nov 6/9/10 aggregates, Nov 10 opening abort detail | Not re-attested in this session unless noted |
| **`screener_sync_generation_jobs`** | **Not available** — table is **service_role** only (no anon SELECT). REST returned **zero rows** (RLS), not proof of emptiness. |

### Missing evidence — exact read-only queries (Lovable Cloud / admin)

Run with **service_role** or **`get_ops_scanner_diagnostics_v1`** (admin) — **not** available to this workspace:

```sql
-- Per-day publication vs abort counts (RTH/AH/premarket windows need ET filters in application layer)
SELECT
  date_trunc('minute', created_at AT TIME ZONE 'America/New_York') AS et_minute,
  status,
  abort_reason,
  continue_last_error,
  publish_rows_inserted,
  next_chunk_index,
  total_chunks
FROM public.screener_sync_generation_jobs
WHERE created_at >= '2026-11-06'::timestamptz
  AND created_at < '2026-11-11'::timestamptz
ORDER BY created_at;

-- Seven-chunk completion + atomic publish proof for a single generation
SELECT id, sync_run_id, status, next_chunk_index, total_chunks,
       publish_rows_inserted, publish_rpc_recorded_at, continue_last_error
FROM public.screener_sync_generation_jobs
WHERE status = 'published'
  AND total_chunks = 7
  AND created_at::date = '2026-11-10'
ORDER BY created_at DESC
LIMIT 20;

-- Gappers / NHL on a published generation (compare feed vs job artifacts)
SELECT synced_at, rows_inserted, tab_counts, nhl_baseline_status,
       tab_evaluation_evidence->'gappers' AS gappers_evidence,
       tab_evaluation_evidence->'new_highs_lows' AS nhl_evidence
FROM public.screener_feed_state
WHERE state_key = 'current';
```

Optional authenticated UI: six-tab row counts, disclosure copy (RVOL, float, delayed feed), AM Inbox late-session handoff after **16:00 ET**.

---

## Live production checkpoint (Nov 10, ~1:25 PM ET)

Captured via public `screener_feed_state` (read-only):

| Field | Value |
| --- | --- |
| `synced_at` | **2026-11-10T18:25:03.25+00:00** (~**1:25 PM ET**) |
| `sync_run_id` | `50b8efbb-a873-441d-9f69-3cc07d16e539` |
| `rows_inserted` | **108** |
| `status` | `available` |
| `provider_as_of_min` / `max` | `2026-11-10T15:10:00+00:00` → `2026-11-10T18:10:02.677+00:00` (~10:10 AM–1:10 PM ET observation span) |
| `nhl_baseline_status` | **`available`** |
| Tab row counts | gappers **20**, gainers_losers **20**, volume_spikes **20**, unusual_volume **20**, new_highs_lows **20**, day_trade_radar **8** (sum **108**) |

**Tab evaluation evidence (all six keys present):**

| Tab | `status` | Notes |
| --- | --- | --- |
| gappers | **evaluated** | `unresolved_gap_input_count=0`, `split_scale_suppressed_count=2` |
| gainers_losers | **evaluated** | — |
| new_highs_lows | **evaluated** | baseline **available** (column + evidence aligned) |
| volume_spikes | **evaluated** | — |
| unusual_volume | **evaluated** | — |
| day_trade_radar | **evaluated** | — |

Public product copy at capture: homepage **Market Pulse · 15-minute delayed market data** (consistent with delayed-feed allowance).

---

## PASS / FAIL / NOT VERIFIED matrix

Legend: **P** = PASS (production evidence in this batch), **F** = FAIL (confirmed regression), **N** = NOT VERIFIED (missing or insufficient evidence). **R** = reported historical evidence only (not re-run this session).

### Session windows

| Requirement | Nov 6 (Fri) | Nov 9 (Sun) | Nov 10 (Tue) | Overall |
| --- | --- | --- | --- | --- |
| **Premarket (04:00–09:30 ET) publication** | **N** | **R** (61 publishes through 09:00 — register) | **N** (no job-level query this session) | **R/N** — Nov 2 **R** seven-pub PASS (60/62/63 rows); Nov 10 not verified here |
| **Regular session (09:30–16:00 ET) publication** | **R** (47 published / 26 aborted — aggregate only) | **F** partial — **09:30 `http_546`** unpublished; recovery **R** (10:55–11:50 all published; 113 rows @ 11:50) | **P** partial — live feed **evaluated** @ 1:25 PM; **R** 32 pubs 10:00–12:35; opening **09:30** abort mechanism **N**; **09:45–09:55** **R** `prior_generation_retained` | **N** — full 09:30–16:00 ET **not** proven for any single day |
| **After-hours (16:00–20:00 ET) publication** | **R** (48 published — aggregate) | **N** | **N** — session **not complete** at capture (~1:26 PM ET); **do not claim** Nov 10 AH PASS | **N** |
| **Late-session → AM Inbox handoff** | **N** | **R** (RPC 3,776 rows — Batch 217; UI **NOT VERIFIED**) | **N** | **N** |

### Pipeline integrity

| Requirement | Result | Evidence |
| --- | --- | --- |
| **7/7 staged chunks + atomic publish** | **N** | Jobs table inaccessible; no per-generation chunk proof in this session |
| **Six-tab row counts + evaluated evidence** | **P** (point-in-time Nov 10 1:25 PM) | Live `tab_counts` + `tab_evaluation_evidence` all **evaluated** |
| **Gappers prior-close completeness** | **P** (current feed) / **N** (full RTH history) | `unresolved_gap_input_count=0`; opening-window **R** transient counts in Batch 218 |
| **NHL baselines** | **P** (current feed) / **N** (multi-day) | `nhl_baseline_status=available`; tabs **evaluated** |
| **`http_546` vs `prior_generation_retained`** | **P** distinction documented / **F** Nov 9 finalize | Nov 9 **09:30 `http_546`** **F** for that slot; Nov 10 **R** no new 546 on retention trio; **09:30** mechanism **N** |
| **Provider freshness (delayed allowance)** | **P** (snapshot) | `provider_as_of_*` within RTH; public 15-min delayed disclosure |
| **D1 `min.av` when `day.v=0` (premarket)** | **R** | Nov 2 ISS-033 window **R** PASS; Nov 10 premarket **N** |
| **RVOL / float / Five Pillars disclosures (UI)** | **N** | Requires authenticated Screeners / Radar walkthrough — out of scope for feed row alone |
| **Repeated multi-session sign-off** | **N** | Nov 6/9/10 not uniformly **P** across PM/RTH/AH |

---

## Nov 10 opening jobs (continuity — not re-queried)

From Batch **218** owner-reported job fields (service-role evidence):

- **09:30:** aborted — mechanism **not conclusively established** (`abort_reason` / `abort_evidence` null; last `finalize_stage:claim_finalize_lease`).
- **09:45–09:55:** **confirmed `prior_generation_retained`** (not `http_546`).
- **10:00–12:35:** **32** consecutive successful publications (**R**).
- **12:35:** **106** rows (**R**); live feed at 1:25 PM shows **108** rows (later publication).

---

## ISS-034 / ISS-024 closure determination

| Issue | Close? | Reason |
| --- | --- | --- |
| **ISS-034** | **NO — remains OPEN** | Batch 191 gate requires **signed** premarket, **full** RTH, and **after-hours** matrices across **repeated** sessions. Nov 9 finalize **`http_546`** remains a **FAIL** for that window. Nov 10 RTH opening aborts and inconclusive **09:30** job block unconditional PASS. Nov 10 **AH not attempted**. Seven-chunk job proof **missing** in this session. |
| **ISS-024** | **NO — remains OPEN** | Current feed shows complete Gappers/NHL evidence (**P** momentary). Multi-day RTH/AH tab-evidence acceptance and authenticated UI parity (**Nov 5 reported** stale Gappers/NHL) **NOT VERIFIED**. |

**No reproducible production defect** requiring code change was established. Safeguards (atomic publish, evidence completeness, prior-generation retention) **unchanged**.

---

## What is missing for Batch 191 sign-off

1. **Service-role or admin** job history for Nov 6, 9, 10 with ET session labels and 7/7 chunk completion rates.
2. **Nov 10 premarket** and **Nov 10 after-hours** (capture after **8:00 PM ET** when records exist).
3. **Nov 9 after-hours** publication row (if any) and tab evidence.
4. **Authenticated** Screeners pass: RVOL availability, float disclosure (ISS-037), Five Pillars / Day Trade Radar qualification copy.
5. **Second RTH day** with full 09:30–16:00 publication without unexplained finalize kill (Nov 9 disqualifies as clean day).

---

## CI (documentation branch)

`npm run integrity` (local). No application code changes.

## Next approved work

1. Owner/Lovable: run queries above; append ET-labeled job matrix to this doc or attestation file.
2. After **Nov 10 AH:** extend matrix for 16:00–20:00 ET + handoff RPC spot-check.
3. Batch **192** / **ISS-025** authenticated AM Inbox after scanner matrix progresses.
