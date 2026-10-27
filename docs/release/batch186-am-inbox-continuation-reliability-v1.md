# Batch 186 — AM Inbox continuation reliability & acceptance V1

**Issue:** ISS-025  
**Base:** `main` `b69d7444`  
**Depends on:** Batch **175** persistence, Batch **184** loading lifecycle

## Root cause (Oct 27 UI vs Oct 27 prod RPC)

Production **`late_session_handoff_list_active_v1('2026-10-27')`** holds **3,131** active rows (Lovable read-only). Batch **184** removed main-thread sessionStorage mirroring on server fetch. Remaining client gaps:

1. **Handoff RPC waited on workspace `et_date`** — late-session query stayed disabled until `get-pre-market-workspace` returned, serializing two large requests.
2. **Per-row workflow sessionStorage reads** — up to one `readHistoricalWorkflowContext` per RPC row before collapse (3k+ lookups).

## Fixes (source)

| Area | Change |
| --- | --- |
| Session date | `resolveAmInboxSessionDate()` — workspace ET date when valid, else client Eastern date (parallel RPC) |
| AM Inbox | Show continuation section for authenticated users; initial loading only when fetch started and no cached view |
| View build | Per-symbol workflow lookup cache during `buildAmInboxLateSessionViewFromContexts` |
| Hook | `refetchOnWindowFocus: false`; exported `loadAmInboxLateSessionViewForDate` for tests |

## Batch 175 acceptance matrix (post Batch 186 code)

| Criterion | Status | Notes |
| --- | --- | --- |
| RPC persistence / list_active | **PASS** | Lovable Oct 27: 3,131 rows; Monday source on Tue AM; 0 Monday rows for Mon AM date |
| Client funnel / six-card / pagination | **PASS** | Regression + Batch 186 3,131-row fixture |
| Loading lifecycle / retry / no refetch flash | **CONDITIONAL** | Hook tests; **authenticated UI NOT VERIFIED** |
| Prior-session copy / workflow handoffs | **PASS (code)** | Existing HandoffCard + workflow tests |
| End-to-end AM Inbox premarket | **NOT VERIFIED** | Requires login + Vercel deploy |

## Verification

```sh
npm run typecheck
npm run test -- src/lib/am-inbox/__tests__/batch186-am-inbox-continuation-acceptance.test.ts src/hooks/__tests__/useAmInboxLateSessionHandoffs.test.tsx
npm run build
```

Production UI: **NOT VERIFIED** in Cursor.
