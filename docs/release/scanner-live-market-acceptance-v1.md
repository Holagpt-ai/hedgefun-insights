# Scanner live-market acceptance V1 (evidence report)

**Git baseline:** `b735073b` (PR #168 on `main`)  
**Report date:** 2026-10-24 (Saturday, US equity markets closed)  
**Scope:** Code contracts, automated tests, read-only production SPA manifest. **No live regular-session tape was observed in this workspace.**

## WS1 — Market-session evidence

| Area | Status | Evidence |
| --- | --- | --- |
| Premarket / regular / late-session classification | **Contract verified in git** | `symbol-session-diagnostic.test.ts` (19 tests), `carryover-watch.test.ts`, worker `session.ts` / `ws.ts` (closed-session backoff). |
| Volume / RVOL / float-turnover gates | **Contract verified** | `scanner-tab-qualification.test.ts`, `rvol-5m-availability.test.ts`, `batch26-scanner-integrity.test.ts`. |
| Live provider telemetry this session | **Not collected** | No production Postgres or Polygon session replay queried; **Saturday** — must not label weekend checks as live RTH acceptance. |

## WS2 — Scanner integrity

| Item | Result |
| --- | --- |
| Volume ordering (verified vs unknown) | **PASS** — `movers-integrity.test.ts` ranks explicit verified `0` before unknown; Polygon `day.v=0` treated as **missing** (Batch 27 + PR #167 reconciled). |
| Polygon zero-volume as false liquidity | **FIXED this batch** — `polygonSnapshotVolume()` in `movers-integrity.ts`; Batch 27 tests green. |
| Stale promotion / duplicate momentum / session mislabel | **No new defect confirmed** in targeted tests; **live-session promotion audit deferred** to next RTH. |
| Delayed-feed disclosure | **Unchanged** — existing Radar/Screener status rails and `observation-freshness` patterns; not re-run against live feed. |

## WS3 — Catalyst integration acceptance

| Item | Result |
| --- | --- |
| Catalyst does not block momentum rank | **PASS** — `scanner-radar-catalyst-parity.test.ts`, worker sentinel tests (prior parity read). |
| Classification / attribution on Radar | **PASS in git** — `radar-news-display.test.ts`, V2 association labels on `main` #168. |
| Filing-only move inference | **Not introduced** — enrichment guards unchanged. |

## WS4 — Reliability fixes shipped in this batch

- Reconcile Polygon snapshot volume `0` → `null` while preserving verified-zero ordering for non-Polygon sources (`polygonSnapshotVolume`, MCP bundle regen).

## WS5 — Requires next trading session

- End-to-end premarket discovery population vs Polygon delayed feed  
- Regular-session promotion / cooling lifecycle under live worker lease  
- Late-session continuation handoff to AM inbox  
- Duplicate-event dedupe under real bar throughput  
- Provider timestamp skew under live `stocksist-radar-v22-worker` v45  

## Deployment / data limits

| Surface | Observation (2026-10-24) |
| --- | --- |
| Vercel SPA | Production manifest `index-Drz78K0e.js` (post–PR #168 deploy observed) |
| Fly worker | v45 digest unchanged; behavior parity PASS vs pre-#168 worker logic |
| Supabase Edge `chat` | **ISS-015** still open |
| Live acceptance claim | **Not asserted** — automated + contract evidence only |

## Verdict

**CONDITIONAL PASS (contracts + tests)** — suitable to merge reliability fix PR. **Full live-market acceptance** remains **pending next RTH session** with read-only telemetry capture.
