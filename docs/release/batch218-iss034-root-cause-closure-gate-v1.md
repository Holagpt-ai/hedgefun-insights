# Batch 218 — ISS-034 root-cause verification & closure gate V1

**Issues:** ISS-034 (P0), ISS-024 (tab evidence), ISS-043 (closed-session; observational only)  
**Base:** GitHub `main` `a23c7474` (post Batch 217 / #231 preview-auth parity)  
**Branch:** `cursor/batch218-scanner-recovery`  
**Date:** November 10, 2026 ET  
**Scope:** Documentation and evidence reconciliation only. **No** Edge/Fly deploy, SQL, cron, secrets, or scanner behavior changes in this batch.

## Restrictions honored

No production migrations, Edge deploys, DNS, cron, provider upgrades, or infrastructure changes. Batches **190**, **191.1**, **215**, **216**, and **217** are not reopened. Atomic publication, evidence completeness, and prior-generation retention semantics are unchanged.

---

## Verified production evidence — November 10, 2026 (owner-reported)

| Observation | Value |
| --- | --- |
| Primary screener | Publishing normally by **12:35 PM ET** |
| Published rows (latest) | **106**; all **six** tabs evaluated |
| Jobs through 12:35 ET | **98** successful publications, **4** aborted |
| RTH stability (post-open) | **32** consecutive successful publications **10:00 AM–12:35 PM ET** |
| Aborted cron windows | **09:30**, **09:45**, **09:50**, **09:55 AM ET |
| Aborted job mechanism (Nov 10) | **`prior_generation_retained`** — **no** confirmed new **`http_546`** on these four jobs |
| Gappers `unresolved_gap_input_count` | **3** @ 09:30 → **2** @ 09:45 → **1** @ 09:50/09:55 → **0** by 10:00 |
| Preservation trigger (09:45–09:55) | Prerequisite degradation, **primarily Gappers**; Gainers/Losers also recorded prerequisite pressure at **09:45** in retained abort evidence |

Batch **191.1** split-scale evidence accounting is **already merged** on `main` — do **not** reimplement.

---

## Finding 1 — November 9 `http_546` (finalize resource limit)

### Confirmed facts

- The **09:30 ET** November 9 job completed **7/7** staged chunks, entered finalization, recorded **`continue_last_error=http_546`**, and **did not publish**.
- Lovable Cloud Edge runtime **v518** was observed for that era.
- A **09:35 ET** separate invocation recorded **HTTP 409** (lease/conflict class); that is **not** the same event as the 09:30 finalize kill.
- Owner/Lovable diagnostic sampling (**14:25–14:40 UTC** log window) found **no** matching 09:30 HTTP 546 **request record**, **no** Batch **216** `staged_finalize_stage_enter/exit` lines, and **no** explicit **`CPU Time exceeded`** string.

### Reconciliation with Batch 216 stage instrumentation

Batch **216** (merged PR #229 → `17a31da8`, owner-reported Edge deploy with Batch 215) persists a bounded **`finalize_stage:<stage>`** marker via conditional UPDATE and merges it with parent-recorded kills as **`http_546:finalize_stage:<stage>`**.

The November 9 **09:30** failure predates **usable production correlation** with that marker on the stranded row: the job died with **plain `http_546` only**, consistent with the pre-marker narrative in CHANGELOG (child isolate killed before durable stage retention). **Batch 216 does not retroactively name the failing stage for Nov 9.**

### Root-cause verdict (Nov 9 `http_546`)

| Question | Status |
| --- | --- |
| Did an Edge **resource-limit** event occur? | **Confirmed** (DB `http_546`) |
| Which finalize **stage** failed? | **NOT VERIFIED** (no `finalize_stage:*` on row; logs inconclusive) |
| Was cause **CPU time** specifically? | **NOT VERIFIED** — do **not** infer CPU exhaustion without explicit limit wording or correlated stage logs |
| Did scanner recover same day? | **Confirmed** — publications resumed; 10:55–11:50 ET observed all published |

**No reproducible code defect** was established for November 9 from git + retained DB fields + sampled logs. **No scanner code change** is authorized in Batch 218 for this item.

---

## Finding 2 — November 10 opening-window aborts (Gappers / preservation)

### Confirmed facts

- All four November 10 morning aborts are **`prior_generation_retained`**, not finalize HTTP 546.
- Abort diagnostics structure matches Batch **190.6** / `buildPriorGenerationRetentionAbortDetail` (`generation-abort-diagnostics.ts`): tabs can show **`evaluated` → `prerequisite_unavailable`** on **`gappers`**, **`gainers_losers`**, and **`new_highs_lows`** when `shouldPreservePriorScreenerGeneration` fires.
- Gappers evidence counters showed **monotonically decreasing** `unresolved_gap_input_count` across 09:30–10:00 ET, reaching **zero** when publication succeeded — consistent with **transient incomplete provider/prior-close inputs at the RTH open**, not a stable mis-accounting bug.

### Classification vs incomplete provider input

Code path (`evaluation-evidence.ts` → `evaluateGappersEvidence`):

- **`split_scale_suppressed_count`** — Batch **191.1**; symbols null **only** via **`impliesSplitScale`**.
- **`unresolved_gap_input_count`** — volume-active symbols still missing calculable gap inputs after structural exclusions.
- **`gap_input_coverage_incomplete`** → **`prerequisite_unavailable`** when accounting is incomplete.
- **`shouldPreservePriorScreenerGeneration`** — fail-closed retention when a tab would **degrade** from **`evaluated`**; **by design**.

### Gainers/Losers at 09:45

`evaluateGenericTabEvidence` marks **`gainers_losers`** **`prerequisite_unavailable`** with **`no_usable_session_volume`** when extended/observation session volume accounting yields zero volume-active symbols — a distinct path from Gappers accounting. Retained November 10 abort rows show **Gainers/Losers** prerequisite pressure at **09:45** alongside Gappers; preservation triggers if **any** of the three preservation tabs degrades. **No code defect** was reproduced in git tests for this transient open-window pattern.

### Root-cause verdict (Nov 10 aborts)

| Question | Status |
| --- | --- |
| Incorrect split-scale classification (Batch 191.1 class)? | **NOT INDICATED** — unresolved counts decayed to zero within 30 minutes |
| Incomplete provider input at open? | **CONFIRMED LIKELY** — matches counter decay and successful 10:00+ publication streak |
| Should preservation have been disabled? | **No** — valid fail-closed behavior per Batch **185** / **190.6** |

**No narrow code correction or regression test** — behavior matches documented contracts.

---

## Batch 191 acceptance requirements (review only)

Per `docs/release/STOCKSIST_MASTER_PENDING_BACKLOG_2026-10-28.md` § Batch 191:

- **Premarket**, **regular (09:30–16:00 ET)**, and **after-hours (15:00–20:00 ET)** windows need a signed live matrix with explicit **NOT VERIFIED** gaps.
- Gates include D1 volume semantics, six-tab evidence, Gappers/NHL integrity, RVOL/float disclosures, and honest zero-match states.
- **One** successful post-190.15 publication **does not** close ISS-034.

### November 10 partial matrix (documented here; not full Batch 191 sign-off)

| Window | Result |
| --- | --- |
| RTH open (09:30–09:55) | **CONDITIONAL** — fail-closed preservation aborts when Gappers inputs incomplete; recovered by 10:00 |
| RTH mid (10:00–12:35) | **PASS (reported)** — 32 consecutive publications, 106 rows, six tabs evaluated |
| After-hours Nov 10 | **NOT VERIFIED** in this batch |
| Repeated multi-day RTH/AH | **NOT VERIFIED** — ISS-034 **stays OPEN** |

---

## ISS-034 closure requirements (unchanged gate; clarified evidence)

ISS-034 closes only when **Batch 191** acceptance is satisfied **and**:

1. **Repeated** regular-session and after-hours production windows show successful six-tab publication without systematic finalize resource-limit failures.
2. Any remaining **`http_546`** events are correlated with **`http_546:finalize_stage:*`** (post–Batch 216 Edge) **or** explicit platform limit logs — **not** speculated CPU cause.
3. Opening-window **`prior_generation_retained`** aborts are **distinguished** from finalize kills and are **not** counted as publication regressions when transient Gappers input lag is documented (as Nov 10).
4. Nov 9 **09:30 `http_546` stage** may remain **historically unverified** without blocking closure **if** subsequent windows meet Batch 191 and no unexplained finalize kill pattern persists.

**Batch 218 does not close ISS-034.** It records verified Nov 10 RTH recovery, classifies Nov 10 aborts, and preserves Nov 9 finalize uncertainty.

---

## Follow-up — Fly Radar V2 stale feed / false Healthy (out of scope)

**Tracking:** **ISS-044** (new, reported). Operations worker classifier (`src/lib/ops/worker.ts`) can report **`healthy`** when checkpoint and connection states are fresh even if downstream consumers observe stale candidate boards — **not investigated or changed** in Batch 218. No Fly or Operations code edits.

---

## Deliverables

| Artifact | Action |
| --- | --- |
| Application code | **None** (documentation-only) |
| `docs/release/batch218-iss034-root-cause-closure-gate-v1.md` | This runbook |
| `docs/ISSUE_REGISTER.md` | ISS-034 / ISS-024 narrative; **ISS-044** follow-up |
| `docs/PROJECT_MEMORY.md` | Nov 10 verified checkpoint |
| `docs/SESSION_HANDOFF.md` | Batch 218 handoff |
| `docs/CHANGELOG.md` | Batch 218 entry |

## CI / regression

Run standard gates on the documentation branch: `npm run typecheck`, `npm run build`, `npm run test:integrity`, `npm run integrity`. No new Deno scanner tests (no reproducible defect).

## Next approved work

1. **Batch 191** — complete after-hours and additional RTH day matrix; authenticated tab-evidence screenshots (**ISS-024**).
2. Correlate **next** `http_546` (if any) with **`finalize_stage:*`** under Batch 216 instrumentation.
3. **ISS-044** — bounded Fly Radar V2 vs Operations health parity review (separate batch).
4. **ISS-025** — AM Inbox authenticated UI acceptance (Batch 217 landed on `main`).
