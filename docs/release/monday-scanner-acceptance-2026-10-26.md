# Monday scanner acceptance — 2026-10-26 (ET)

**Purpose:** Read-only live-market evidence for Momentum Radar / scanner contracts.  
**Git baseline:** `origin/main` **`3ef97ee1`** (Batch **183** merged). Prior acceptance baseline on stale PR **#174**: **`28cbcc9e`**.

**Evidence legend**

| Label | Meaning |
| --- | --- |
| **UI observation** | Production browser check; not Postgres/Fly proof |
| **Regression** | Vitest on `main` in this session |
| **Fly (pre-session)** | From PR **#174** run **2026-10-25 ~12:14 ET** (Sunday) |
| **Backend verified** | Production DB, RPC, or worker telemetry with ET stamp |

Do not treat weekend checks or unit tests alone as live RTH acceptance.

## ET observation windows (2026-10-26 Monday)

| Window | ET time | What to observe |
| --- | --- | --- |
| Premarket discovery | **04:00–09:30** | AM Inbox / premarket screener; session kind `premarket`; honest delayed labels |
| Regular momentum (RTH) | **09:30–16:00** | Day Trade Radar; volume-first; Five Pillars; RVOL / float-turnover gates |
| Late continuation | **16:00–20:00** | Late-session capture → next AM Inbox; cooling / handoff labels |

## Overall verdict (updated 2026-10-26 ~17:00 ET)

| Verdict | **CONDITIONAL — incomplete live sign-off** |
| --- | --- |
| Core contracts | **PASS** (batch26/27 + symbol-session-diagnostic) |
| Live ET matrix | Many rows **NOT VERIFIED** (no RTH Fly/DB capture this session) |
| Known defect (pre-fix) | **FAIL (observational)** — ISS-021 premarket tab showed regular-session prints ~12:33–12:56 ET; **fixed on `main`** Batch **178** (`7c2bf094`), production manifest post-**183** suggests deploy |
| Morning blank-tab report | **NOT VERIFIED** — reported in product notes; no ET-stamped repro attached this session |

---

## Checklist matrix (11 reference rows)

| # | Behavior | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Premarket candidate discovery | **NOT VERIFIED** | No 04:00–09:30 UI/DB capture this session |
| 2 | RTH momentum qualification | **NOT VERIFIED** | Radar behind auth; no worker ranked-board snapshot |
| 3 | Volume-first ordering | **PASS (regression)** | `batch26` / `batch27` / `movers-integrity` on `main` |
| 4 | 5m RVOL unavailable when missing | **PASS (regression)** | `rvol-5m-availability` patterns in batch26 suite |
| 5 | Float turnover gates | **PASS (regression)** | Scanner qualification funnel tests (batch26 guard) |
| 6 | Provider timestamps | **NOT VERIFIED** | No live Radar detail capture |
| 7 | Delayed feed disclosure | **PASS (UI observation)** | `/markets/premarket` ~17:00 ET: “15-minute delayed…” copy visible (Batch **178** disclosure path) |
| 8 | Promotion / cooling lifecycle | **NOT VERIFIED** | No RTH event stream |
| 9 | Duplicate suppression | **PASS (regression)** | Toast dedupe tests on `main` (not live reload) |
| 10 | Catalyst attribution | **PASS (regression)** | Batch **181** gates + batch26; live Radar **NOT VERIFIED** |
| 11 | Late-session handoff | **NOT VERIFIED** | Batch **175** — inbox RPC not queried live |

---

## WS1 — Premarket (04:00–09:30 ET)

| Item | Status | Evidence |
| --- | --- | --- |
| Candidate discovery | **NOT VERIFIED** | — |
| Provider timestamps | **NOT VERIFIED** | — |
| Session classification | **NOT VERIFIED** | Contract: `symbol-session-diagnostic.test.ts` **PASS** |
| Feed freshness / delay labels | **PASS (UI observation)** | Premarket movers page disclosure at ~17:00 ET (outside window; tables empty — no regular-session rows listed) |
| AM Inbox visibility | **NOT VERIFIED** | Auth required |

**Post-close UI ( ~17:00 ET, outside premarket window):** Premarket tab selected; gainers/losers tables **empty**; delayed-data disclaimer present — **consistent with** Batch **178** “no regular-session snapshots on premarket tab” (**UI observation**, not proof of 04:00–09:30 behavior).

---

## WS2 — RTH (09:30–16:00 ET)

| Item | Status | Evidence |
| --- | --- | --- |
| Volume-first ranking | **NOT VERIFIED** | Regression **PASS** only |
| Polygon `v=0` handling | **NOT VERIFIED** live | **ISS-020** fixed in git; live RTH pending |
| Five Pillars / cooling | **NOT VERIFIED** | Batch **182** UI on `main`; no live board |
| 5m RVOL / float-turnover | **NOT VERIFIED** live | Regression guards **PASS** |
| Live vs persisted Radar | **NOT VERIFIED** | — |
| Provider timestamp freshness | **NOT VERIFIED** | — |
| Duplicate suppression | **NOT VERIFIED** live | Code tests **PASS** |
| Catalyst verification labels | **NOT VERIFIED** live | Batch **181** on `main` |
| DB persistence (Fly) | **CONDITIONAL** | PR **#174** pre-session: bridge **ok**, `candidate_rows: 0` (closed market) — **Fly (pre-session)** |
| Quiet-feed watchdog at open | **NOT VERIFIED** | Lovable warning **#5** |

**October 26 afternoon (UI observation, pre-deploy context):** Public **Pre-Market** tab incorrectly listed **regular-session** mover timestamps (~12:33–12:56 ET) — documented as **ISS-021**; remediated in Batch **178**. Re-check after **`index-BD3GjFFl.js`** deploy: ~17:00 ET premarket page **empty**, not filled with RTH prints (**UI observation**).

**Morning blank-tab condition:** Reported for 2026-10-26 open; **NOT VERIFIED** with timestamps or backend logs in this session.

---

## WS3 — Late session (15:00–20:00 ET)

| Item | Status | Evidence |
| --- | --- | --- |
| Power hour qualification | **NOT VERIFIED** | Window in progress at doc update; no capture |
| After-hours handoff labels | **NOT VERIFIED** | — |
| Carryover / next-session AM Inbox | **NOT VERIFIED** | See Batch **175** runbook |
| No stale snapshots as live | **NOT VERIFIED** | Carryover panel contract in git |

---

## WS4 — Lovable ten-warning runtime focus

| # | Subject | Status | Notes |
| --- | --- | --- | --- |
| 1 | Market-data quotas | **NOT VERIFIED** | Mitigated in git (#151/#152) |
| 2 | Historical context >20 symbols | **NOT VERIFIED** live | Fixed in git |
| 3 | DB save timeouts | **CONDITIONAL** | Fly pre-session ok; migration apply **unknown** |
| 5 | Quiet-feed watchdog | **NOT VERIFIED** | Fixed in git |
| 8 | Continuation RVOL baseline | **NOT VERIFIED** live | Fixed in git |
| 9 | AM Inbox qualified fallback | **NOT VERIFIED** live | Batch **175**; funnel tests **PASS** |
| 4, 6, 7, 10 | (code-closed) | **PASS (regression)** | Per `lovable-scanner-reliability-warnings.md` |

---

## WS5 — Deployment / parity (2026-10-26)

| Check | Result |
| --- | --- |
| GitHub `main` | **`3ef97ee1`** — Batch **183** merged |
| Vercel production manifest | **`index-BD3GjFFl.js`** (~17:00 ET) |
| Local dist vs production | **Mismatch** expected until local `npm run build` at same SHA |
| PR **#174** | **CONFLICTING** — supersede, do not merge blindly |

---

## Read-only tooling

```sh
npm run ops:monday-scanner-acceptance
npm run typecheck
npx vitest run src/lib/__tests__/batch26-scanner-integrity.test.ts src/lib/__tests__/batch27-scanner-reliability.test.ts
npx vitest run src/lib/scanner-verification/__tests__/symbol-session-diagnostic.test.ts
```

**Fly (read-only, ops):** `fly logs -a stocksist-radar-v22-worker --since 2h` during RTH.

## Confirmed defects requiring new implementation (this run)

**None newly confirmed** beyond **ISS-021** already fixed on `main` (live post-deploy sign-off still **NOT VERIFIED** for full Monday).

Record updates in `docs/SESSION_HANDOFF.md` after any additional ET-window observations.
