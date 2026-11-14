# ISS-034 — November 13, 2026 opening-bell evidence (session transition)

**Issue:** ISS-034 (P0)  
**Not a new batch.** Continues Batch **228** opening-bell finalize work.  
**Base:** GitHub `main` **`72c1a57ca9e6aa77fea5b15cc6a0ed8606f481db`** (Batch **233** PR **#251** merged)  
**Date:** November 14, 2026 ET (evidence from Friday **November 13**)  
**Scope:** Trace 09:30 ET evaluation / `build_evidence` only. **No** Edge, SQL, Fly, cron, secrets, ranking, or publication-policy changes.

Historical lease-expiry record remains in `docs/release/batch228-opening-bell-finalize-v1.md`. Do not rewrite that runbook’s original dated status.

---

## Production evidence (owner-reported, Friday November 13, 2026 ET)

| Window | Outcome |
| --- | --- |
| **09:25** | Successful publication, **88** rows |
| **09:30** | **7/7** chunks; **no** publish RPC; abort **`prior_generation_retained`**; last durable error **`finalize_stage:build_evidence`**; Gappers **`prerequisite_unavailable`**; New Highs/Lows **`not_evaluated`** |
| **09:50** | Successful publication, **101** rows |
| **10:05** | Successful publication, **102** rows, six tabs **evaluated** |

Gappers/NHL **reason codes**, `unresolved_gap_input_count`, `nhl_baseline_status`, and full `abort_evidence` JSON were **not** supplied. Do not invent them.

---

## Root-cause finding (code + this production row)

**Batch 228 lease recovery advanced.** Unlike Nov **10–12** 09:30 jobs that died at `finalize_stage:claim_finalize_lease` with **null** `abort_reason`, this job reached **`build_evidence`** and then **`prior_generation_retained`**.

**Last error `finalize_stage:build_evidence` is expected on a successful preserve abort.** `preserve_check` is **not** a durable marker (`DURABLE_FINALIZE_STAGE_MARKERS`). The last persisted stage before `shouldPreservePriorScreenerGeneration` is `build_evidence`.

**Gappers `prerequisite_unavailable` at 09:30 is the regular-session gap contract.** RTH gap uses **`day.o` vs `prevDay.c` only** (`gapPercent` / `currentSessionOpen(..., false)`). Premarket 09:25 may evaluate from the extended last when `day.o` is absent. The first market-clock snapshot often has **`day.v` before `day.o`**. Volume-active names without an opening print are unresolved. If **none** are calculable → `prior_close_gap_inputs_unavailable`; if **some** are → `gap_input_coverage_incomplete`. Either status is **`prerequisite_unavailable`**. Do not invent `day.o`.

**NHL `not_evaluated` at 09:30 is the day-range contract.** Regular-session eligibility uses **`day.c`**; classification requires **`day.h` / `day.l`** (`dayHighLow` never invents a partial range). Missing range on a volume-active name is unresolved → `baseline_coverage_incomplete` → **`not_evaluated`**.

**Preservation is same surveillance date, not premarket vs RTH.** `isPreviousSessionSnapshotDuringLiveSession` rolls at **04:00 ET**. The 09:25 generation is **current** at 09:30, so evaluated → Gappers `prerequisite_unavailable` and/or NHL `not_evaluated` **retains** the prior generation. That safeguard is **correct**. 09:50 publishes once `day.o` / day range exist.

**No scanner behavior change.** Fail-closed evidence, prior-generation retention, atomic publish, and volume-first ranking stay unchanged. A reproducible **false-unavailable** defect was **not** established from the supplied fields.

### Exact missing evidence (if a later patch is proposed)

From the Nov **13** 09:30 job row (Lovable Cloud read-only):

- `abort_evidence` (tab statuses + `triggered_preservation`)
- Gappers `reason`, `volume_positive_count`, `gap_calculable_count`, `unresolved_gap_input_count`
- NHL `reason`, `baseline_status`, `eligible_count`, `unresolved_count`
- `nhl_baseline_loaded` / frozen snapshot identity

Without those, do **not** treat contradictory `min.t`/`updated` pairs, baseline reload, or CPU as the cause.

---

## Regression

`supabase/functions/_shared/screeners/iss034-opening-bell-evidence_test.ts` — 09:25 evaluate, 09:30 fail-closed + same-date retain, 09:50 evaluate.

---

## Restrictions honored

No production migrations, Edge/Fly deploys, DNS, cron, secrets, feature activation, or Radar worker changes. ISS-044 remains a **separate** P0.
