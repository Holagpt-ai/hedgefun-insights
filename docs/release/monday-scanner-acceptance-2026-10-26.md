# Monday scanner acceptance — 2026-10-26 (ET)

**Purpose:** Read-only live-market evidence for Momentum Radar / scanner contracts.  
**Do not** claim acceptance until each row has **RTH or premarket provider evidence** from the listed window.

## ET observation windows (2026-10-26 Monday)

| Window | ET time | What to observe |
| --- | --- | --- |
| Premarket discovery | **04:00–09:30** | AM Inbox / premarket screener candidates; session kind `premarket`; honest delayed labels |
| Regular momentum (RTH) | **09:30–16:00** | Day Trade Radar board; volume-first order; Five Pillars qualification; RVOL / float-turnover gates |
| Late continuation | **16:00–20:00** | After-hours inbox; cooling / handoff labels; no weekend replay masquerading as live |

**Weekend rule:** Do not use Saturday/Sunday UI checks or stale board snapshots as live acceptance.

## Evidence checklist

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

**Fly (read-only, ops):** `fly logs -a stocksist-radar-v22-worker --since 2h` during RTH — do not deploy or restart.  
**Vercel:** Confirm preview/production asset hash after security PR merge; manifest has no git SHA.

## Verdict template (fill during Monday session)

| Verdict | When |
| --- | --- |
| **PASS** | All checklist rows with ET-stamped evidence |
| **CONDITIONAL** | Core RTH ranking OK; premarket or late gaps documented |
| **FAIL** | Confirmed defect with repro + issue id |

Record results in `docs/SESSION_HANDOFF.md` after the session; do not pre-fill PASS today.
