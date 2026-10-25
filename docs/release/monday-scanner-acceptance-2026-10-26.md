# Monday scanner acceptance — 2026-10-26 (ET)

**Purpose:** Read-only live-market evidence for Momentum Radar / scanner contracts.  
**Do not** claim acceptance until each row has **RTH or premarket provider evidence** from the listed window.

**Baseline git:** `main` **`28cbcc9e`** (PR **#173** merged 2026-10-25T16:09:45Z).

## ET observation windows (2026-10-26 Monday)

| Window | ET time | What to observe |
| --- | --- | --- |
| Premarket discovery | **04:00–09:30** | AM Inbox / premarket screener candidates; session kind `premarket`; honest delayed labels |
| Regular momentum (RTH) | **09:30–16:00** | Day Trade Radar board; volume-first order; Five Pillars qualification; RVOL / float-turnover gates |
| Late continuation | **16:00–20:00** | After-hours inbox; cooling / handoff labels; no weekend replay masquerading as live |

**Weekend rule:** Do not use Saturday/Sunday UI checks or stale board snapshots as live acceptance.

## Batch 174 evidence run (2026-10-25, pre-session)

**Observation anchor (ET):** **2026-10-25 ~12:14–12:18 ET** (Sunday — **before** the 2026-10-26 Monday session).  
**Ops helper:** `npm run ops:monday-scanner-acceptance` (checklist only; no production writes).  
**Regression guards (not live acceptance):** `batch26-scanner-integrity` + `batch27-scanner-reliability` — **13/13 pass** at `28cbcc9e`.

### Overall verdict (2026-10-25)

| Verdict | **INCOMPLETE — pre-session** |
| --- | --- |
| Meaning | No checklist row has **Monday 2026-10-26 ET window** evidence. Weekend Fly telemetry and unit tests do **not** substitute for WS1–WS3. |
| Next | Re-run this matrix during **04:00–20:00 ET on 2026-10-26**; update rows below; set final **PASS / CONDITIONAL / FAIL**. |

### WS1 — Premarket (04:00–09:30 ET)

| Item | ET time | Source | Observed | Expected | Status |
| --- | --- | --- | --- | --- | --- |
| Candidate discovery | — | Dashboard / diagnostics | Not observed (session not started) | Symbols with timestamps or honest unavailable | **NOT OBSERVED** |
| Provider timestamps | — | Radar / premarket feed | Not observed | `provider_as_of` or unavailable | **NOT OBSERVED** |
| Session classification | — | `symbol-session-diagnostic` | Not observed | `premarket` during window | **NOT OBSERVED** |
| Feed freshness / delay labels | — | Market data status rail | Not observed | Delayed/stale disclosed when applicable | **NOT OBSERVED** |
| AM Inbox visibility | — | AM Inbox UI | Not observed | Qualified premarket/continuation visible | **NOT OBSERVED** |

### WS2 — RTH (09:30–16:00 ET)

| Item | ET time | Source | Observed | Expected | Status |
| --- | --- | --- | --- | --- | --- |
| Volume-first ranking | — | Live Radar board | Not observed | Higher verified volume above lower | **NOT OBSERVED** |
| Polygon `v=0` handling | — | Live movers / Radar | Not observed (ISS-020 code on `main`; live proof pending) | Zero not treated as liquidity | **NOT OBSERVED** |
| Momentum qualification / cooling | — | Radar + worker | Not observed | Five Pillars lifecycle without spam | **NOT OBSERVED** |
| 5m RVOL / float-turnover | — | Radar cells / funnel | Not observed | Unavailable when missing; gates match inputs | **NOT OBSERVED** |
| Live vs persisted Radar | — | UI + DB read-only | Not observed | Consistent ranked set | **NOT OBSERVED** |
| Provider timestamp freshness | — | Radar detail | Not observed | Fresh or labeled delayed | **NOT OBSERVED** |
| Duplicate suppression | — | Toasts / events | Not observed | No duplicate spam | **NOT OBSERVED** |
| Catalyst verification labels | — | Radar news / Catalyst | Not observed | verified / historical / unverified; no rank impact | **NOT OBSERVED** |
| DB persistence | 2026-10-25 ~12:14 ET | Fly `stocksist-radar-v22-worker` (`fly logs -n`) | `publish_candidates_v2` and `append_daily_volume_history` **outcome: ok**; `candidate_rows: 0` (closed market) | RTH publishes succeed; failures logged | **CONDITIONAL** (weekend only — not RTH) |
| Quiet-feed watchdog after reopen | — | Feed state / logs | Not observed | Session-aware feed selection at open | **NOT OBSERVED** |

### WS3 — Late session (15:00–20:00 ET)

| Item | ET time | Source | Observed | Expected | Status |
| --- | --- | --- | --- | --- | --- |
| Power hour (15:00–16:00) | — | Radar | Not observed | Momentum qualification during last hour | **NOT OBSERVED** |
| After-hours (16:00–20:00) | — | Late inbox / handoff | Not observed | Continuation labels correct | **NOT OBSERVED** |
| Carryover / next-session handoff | — | AM inbox / handoff storage | Not observed | Batch 173 guards; live symbol continuity | **NOT OBSERVED** |
| No stale snapshots as live | — | UI | Not observed | Current session only | **NOT OBSERVED** |

### WS4 — Lovable ten-warning acceptance (runtime focus)

| # | Subject | ET time | Source | Observed | Expected | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Market-data quotas | — | Edge `market-data` / UI | Not observed Monday RTH | Charts/quotes not exhausted site-wide | **NOT OBSERVED** |
| 2 | Historical context >20 symbols | — | Live Radar board | Not observed | Progressive batches; context present | **NOT OBSERVED** |
| 3 | DB save timeouts | 2026-10-25 ~12:14 ET | Fly bridge logs | No `failure_origin` / timeout failures in **recent** sample; all sampled bridge **ok** | Bounded RPC; failures visible | **CONDITIONAL** (no RTH load; migration apply still **unknown** per register) |
| 5 | Quiet-feed watchdog | — | RTH reopen logs | Not observed | Correct feed after reopen | **NOT OBSERVED** |
| 8 | Continuation RVOL baseline | — | Late session UI | Not observed | Baseline propagated in labels/scoring | **NOT OBSERVED** |
| 9 | AM Inbox qualification | — | AM Inbox | Not observed (Batch **175** inbox pass) | Qualified fallback when pool empty | **NOT OBSERVED** |

Rows **4, 6, 7, 10** remain **fixed/disproven in code** per `docs/release/lovable-scanner-reliability-warnings.md` — not reopened without new evidence.

### WS5 — Deployment / parity (read-only, 2026-10-25)

| Check | ET time | Source | Result |
| --- | --- | --- | --- |
| GitHub `main` | 2026-10-25 ~12:17 ET | `git fetch origin main` | **`28cbcc9e`** — PR **#173** **MERGED** |
| Vercel production manifest | 2026-10-25 ~12:17 ET | `https://stocksist.com/asset-manifest.json` | `js`: **`/assets/index-vzEEFfGK.js`**, `css`: **`/assets/index-CqYGeua4.css`** (no git SHA on manifest) |
| Local build at `28cbcc9e` vs production | 2026-10-25 ~12:18 ET | `npm run integrity -- --remote` | **Mismatch** — local dist **`index-hZRK9LjP.js`** ≠ production **`index-vzEEFfGK.js`** → **#173 frontend deploy not verified** from manifest alone |
| Fly worker liveness | 2026-10-25 ~12:14 ET | `fly logs -a stocksist-radar-v22-worker -n` | Heartbeat + publish loop active; **no** scanner restart performed |

### Confirmed defects requiring implementation (this run)

**None newly confirmed.** **ISS-020** live RTH sign-off remains **pending** Monday evidence. **ISS-015** (`chat` Edge) unchanged.

---

## Evidence checklist (reference)

| # | Behavior | Pass criteria | Evidence source (read-only) |
| --- | --- | --- | --- |
| 1 | Premarket candidate discovery | Symbols appear with provider timestamps or explicit unavailable | Dashboard premarket + `symbol-session-diagnostic` patterns |
| 2 | RTH momentum qualification | Ranked rows match volume-first contract; catalyst does not promote unqualified symbols | Radar UI + Batch 26/27 tests as regression guard |
| 3 | Volume-first ordering | Higher verified volume ranks above lower; unknown volume last; Polygon `v=0` not fake liquidity | `movers-integrity` / Market Pulse |
| 4 | 5m RVOL | Label unavailable when data missing; no fabricated RVOL | `rvol-5m-availability` + Radar cells |
| 5 | Float turnover | Gate pass/fail matches stored inputs | Screener qualification funnel |
| 6 | Provider timestamps | `provider_as_of` / observation lines present or honest unavailable | Radar detail + market status rail |
| 7 | Delayed feed disclosure | Status rail shows delayed/stale when applicable | `MarketDataStatus`, scanner clock |
| 8 | Promotion / cooling | Lifecycle transitions without duplicate spam | Fly worker logs (read-only), radar events table |
| 9 | Duplicate suppression | Same symbol/event not repeated in alert toast stream | `canonical-event-identity` / toast dedupe |
| 10 | Catalyst attribution | Verified vs unverified vs historical labels; no rank impact | Radar news cell + Catalyst tab |
| 11 | Late-session handoff | Carryover watch / next-session labels correct | `carryover-watch`, AM inbox Monday |

## Read-only tooling

```sh
# Local checklist (no production writes)
node scripts/ops/monday-scanner-acceptance-readonly.mjs

# Regression guards (run before/after Monday session)
npm run typecheck
npx vitest run src/lib/__tests__/batch26-scanner-integrity.test.ts src/lib/__tests__/batch27-scanner-reliability.test.ts
npx vitest run src/lib/scanner-verification/__tests__/symbol-session-diagnostic.test.ts
```

**Fly (read-only, ops):** `fly logs -a stocksist-radar-v22-worker -n` during RTH — do not deploy or restart.  
**Vercel:** Confirm production asset hash after merges; manifest has no git SHA.

## Verdict template (fill during Monday session)

| Verdict | When |
| --- | --- |
| **PASS** | All checklist rows with ET-stamped evidence |
| **CONDITIONAL** | Core RTH ranking OK; premarket or late gaps documented |
| **FAIL** | Confirmed defect with repro + issue id |

Record results in `docs/SESSION_HANDOFF.md` after the session.
