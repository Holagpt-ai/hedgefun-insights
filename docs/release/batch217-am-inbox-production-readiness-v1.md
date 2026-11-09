# Batch 217 — AM Inbox production readiness V1

**Issue:** ISS-025  
**Base:** `main` `17a31da8` (Batch 216 merged)  
**Depends on:** Batch **186** / **186.1** continuation reliability, Batch **192** metadata + brief integrity

## Production evidence (November 9, 2026)

| Fact | Value |
| --- | --- |
| RPC | `late_session_handoff_list_active_v1('2026-11-09')` |
| Rows | **3,776** |
| Distinct symbols | **1,525** |
| Payload | ~**4.1 MB** JSON |
| Source sessions | November 5 and November 6 |
| Client timeout | `LATE_SESSION_HANDOFF_FETCH_TIMEOUT_MS` = **25 s** |
| Backend persistence | Working |
| Authenticated UI | **NOT VERIFIED** (still required after merge/deploy) |

## Demonstrated gap fixed

Continuation cards exposed Catalyst / Watchlist / Journal / Action Center / AI Analyst / Chart, but **Screeners** was missing from `PreMarketSymbolActions`, and `buildInboxWorkflowNavigatePath("screeners")` returned a non-symbol URL. Screeners destinations already consume `?symbol=` via `readScannerHandoffQuery`. Batch 217 adds the symbol-aware Screeners route to the shared workflow router and the continuation action row (desktop overflow + mobile More).

## Load measurement (local Vitest, synthetic Nov 9 fixture)

| Step | Result |
| --- | --- |
| Rows / symbols | 3,776 / 1,525 |
| Map + build | **~424 ms** total (`mapMs≈155`, `buildMs≈269`) |
| Bound | `< 8_000 ms` (same Batch 186 gate) |
| Default cards | 6 |
| Expanded page | 40 |
| Expired omitted | Thursday non-Day-Two captures excluded on Monday AM |

No ranking, qualification, RPC, migration, or arbitrary candidate-limit change was required for the measured workload.

## Preserved contracts

- Volume-first priority / qualified fallback / provenance and “prior-session snapshot” disclosure
- Power-Hour, After-Hours, Strong Close/HOD, Day-Two expiry and Fri→Mon rollover
- Initial load terminates; retry on error; successful data survives failed background refresh
- Batches **215** / **216** Edge deployment recorded as owner-reported complete (continuity docs only)

## Verification

```sh
npm run typecheck
npm run test -- src/lib/am-inbox/__tests__/batch217-am-inbox-production-readiness.test.ts src/components/pre-market/__tests__/PreMarketSymbolActions.test.tsx src/hooks/__tests__/useAmInboxLateSessionHandoffs.test.tsx src/pages/dashboard/__tests__/AMInbox.late-session-reliability.test.tsx
npm run integrity
npm run build
```

Authenticated production AM Inbox visual acceptance remains **NOT VERIFIED**.
