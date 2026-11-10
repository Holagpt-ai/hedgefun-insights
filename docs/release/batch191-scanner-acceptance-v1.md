# Batch 191 — Scanner production acceptance V1 (read-only)

**Issues:** ISS-034 (P0), ISS-024 (tab evidence), ISS-033 (premarket D1 — partial)  
**Base:** GitHub `main` `fcef28f6` (Batch 218 #232 merged)  
**Branch:** `cursor/batch191-scanner-acceptance-v1` (PR **#233**)  
**Last evidence update:** November 10, 2026, **~1:30 PM ET**  
**Scope:** Bounded **read-only** production acceptance. **No** Edge/SQL/Fly/cron/deploy. **No** scanner code changes.

**Contract:** `docs/release/STOCKSIST_MASTER_PENDING_BACKLOG_2026-10-28.md` § Batch 191; supplementary detail in Batch **218** runbook.

---

## Evidence layers (do not conflate)

| Layer | What it proves | Status this batch |
| --- | --- | --- |
| **A — Publication ledger** | `screener_sync_generation_jobs` counts by ET session, 7/7 chunks, publish RPC, abort reason | **Owner-verified** via **authorized read-only Lovable Cloud** database access |
| **B — Current feed snapshot** | `screener_feed_state` row counts + `tab_evaluation_evidence` on **current** generation | **Verified** @ ~1:30 PM ET Nov 10 (anon REST + owner attestation) |
| **C — Historical per-tab evaluation** | Six-tab evidence on **every** published generation across sessions | **NOT VERIFIED** — ledger does not substitute for per-job evidence replay |
| **D — Authenticated UI** | RVOL/float disclosures, Five Pillars copy, tab freshness parity | **NOT VERIFIED** |

**Job ledger access:** `screener_sync_generation_jobs` is **not** exposed to anonymous PostgREST (service_role only; anon REST returns no rows). It **was** successfully inspected through **authorized read-only Lovable Cloud** access — not “unavailable,” but **unavailable to the public SPA path only**.

---

## Owner-verified publication ledger (ET session totals)

| Date | Session | Published | Aborted |
| --- | --- | ---: | ---: |
| **Nov 6** | Premarket | **66** | **0** |
| **Nov 6** | Regular | **47** | **26** |
| **Nov 6** | After-hours | **48** | **0** |
| **Nov 9** | Premarket | **63** | **1** |
| **Nov 9** | Regular | **74** | **1** |
| **Nov 9** | After-hours | **48** | **0** |
| **Nov 10** | Premarket | **66** | **0** |
| **Nov 10** | Regular (through **1:30 PM ET**) | **43** | **4** |

### Verified abort / failure detail

| Window | Detail |
| --- | --- |
| **Nov 6 regular** | **25** aborts **`prior_generation_retained`**, **one** other abort (mechanism not expanded in this attestation) |
| **Nov 9 regular** | **One** confirmed **`http_546`** finalize resource-limit failure |
| **Nov 10 regular (opening)** | **09:30** — abort; mechanism **not conclusively established**. **09:45 / 09:50 / 09:55** — **confirmed `prior_generation_retained`** (not `http_546`) |
| **Nov 10 after-hours** | **NOT accepted** in this batch — session incomplete / records not signed off at attestation time |

### November 10 regular session — pipeline (published jobs only)

- All **43** published regular-session jobs (through **1:30 PM ET**) completed **7/7** staged chunks and recorded **successful publish RPCs** (publication ledger).

### Current feed @ ~1:30 PM ET (Layer B)

- **`rows_inserted`:** **107**
- **Six tabs:** all **`evaluated`**
- **Gappers:** `unresolved_gap_input_count` **0**
- **NHL:** baseline **`available`**

*(Earlier public REST capture ~1:25 PM showed **108** rows — consistent with a subsequent natural publication before the 1:30 attestation.)*

---

## PASS / FAIL / NOT VERIFIED matrix (publication ledger + feed)

Legend: **P** = PASS, **F** = FAIL (confirmed harmful event), **N** = NOT VERIFIED (gap remains), **C** = CONDITIONAL (publications occurred with known abort pattern).

### Session publication volume (Layer A)

| Requirement | Nov 6 | Nov 9 | Nov 10 | Overall |
| --- | --- | --- | --- | --- |
| **Premarket publication** | **P** (66/0) | **P** (63/1) | **P** (66/0) | **C** — volumes verified; **per-tab / D1 spot checks not replayed** on every PM job |
| **Regular session publication** | **C** (47/26; 25 retention) | **F** (74/1; **1× `http_546`**) | **C** (43/4 through 1:30 PM; opening retention + inconclusive 09:30) | **N** — no **clean** full RTH day without finalize kill **and** low retention noise |
| **After-hours publication** | **P** (48/0) | **P** (48/0) | **N** — **not accepted** | **N** — Nov 10 AH **outstanding** |
| **Late-session → AM Inbox** | **N** | **N** (RPC scale **reported** elsewhere; UI **N**) | **N** | **N** |

### Pipeline and evidence (Layers A + B; not C or D)

| Requirement | Result | Evidence |
| --- | --- | --- |
| **7/7 chunks + atomic publish RPC** | **P** (Nov 10 RTH pubs through 1:30 PM) | All **43** published RTH jobs |
| **7/7 + publish RPC (Nov 6/9 full days)** | **N** | Ledger totals only; not per-job roll-up in this doc |
| **Six-tab evaluated on current feed** | **P** @ 1:30 PM | **107** rows; six tabs **`evaluated`** |
| **Gappers completeness (current)** | **P** | `unresolved_gap_input_count=0` |
| **NHL baselines (current)** | **P** | **`available`** |
| **Historical six-tab evidence every publish** | **N** | Layer **C** |
| **`http_546` vs retention** | **P** classification | Nov 9 **1× `http_546`**; Nov 10 opening **retention** + **09:30** inconclusive |
| **Provider / delayed-feed allowance** | **C** | Feed as-of spans + product disclosure; **not** full ISS-033 replay |
| **RVOL / float / UI disclosures** | **N** | Layer **D** |

### Prior reported evidence (unchanged)

- **Nov 2 premarket** (seven consecutive publications; 60/62/63 rows): **reported PASS** for ISS-033 narrow window — not re-queried here.

---

## ISS-034 / ISS-024 closure determination

| Issue | Close? | Reason |
| --- | --- | --- |
| **ISS-034** | **NO — OPEN** | Publication ledger **strengthens** acceptance for **premarket** and **AH (Nov 6/9)** and **7/7 publish path (Nov 10 RTH-to-1:30)**. **Blocks remain:** Nov 9 **`http_546`**; Nov 6/10 **retention** abort density at RTH open; **Nov 10 RTH incomplete** (not through 4:00 PM); **Nov 10 AH not accepted**; no **multi-day clean RTH** sign-off; finalize stage/CPU on Nov 9 **not** re-litigated here. |
| **ISS-024** | **NO — OPEN** | Current feed Gappers/NHL **evaluated**. **Layer C** (per-generation tab evidence history) and **Layer D** (authenticated UI / Nov 5 stale-tab reports) **not verified**. |

**No reproducible production defect** requiring code change. Safeguards unchanged.

---

## Remaining acceptance gaps

1. **Nov 10 after-hours** (16:00–20:00 ET) — publication ledger + feed evidence after session completes.
2. **Nov 10 regular** — remainder **1:30 PM–4:00 PM ET** without disproportionate finalize failures.
3. **Layer C** — sample or audit `tab_evaluation_evidence` on published jobs across PM/RTH/AH (not only `current`).
4. **Layer D** — authenticated Screeners walkthrough (RVOL, float ISS-037, Five Pillars).
5. **Clean RTH day** — repeated session without **`http_546`** and with opening retention within documented tolerance (Batch 191 gate).

### Reference SQL (future read-only passes)

Still valid for **Lovable Cloud** read-only operators; ledger totals above supersede the “missing job history” gap from the initial PR revision:

```sql
SELECT id, sync_run_id, status, next_chunk_index, total_chunks,
       publish_rows_inserted, publish_rpc_recorded_at,
       abort_reason, continue_last_error, created_at
FROM public.screener_sync_generation_jobs
WHERE created_at >= '2026-11-06'::timestamptz
ORDER BY created_at;
```

---

## CI

Documentation-only branch: `npm run integrity` (local).

## Next approved work

1. After **Nov 10 8:00 PM ET:** append AH row to ledger table; update Layer B feed.
2. Layer **C** spot-check on sample published `sync_run_id`s.
3. Batch **192** / **ISS-025** UI acceptance in parallel where appropriate.
