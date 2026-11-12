# Batch 230 — AM Inbox continuation production reliability V1

**Issue:** ISS-025  
**Baseline:** GitHub `main` `34e8fb739b5b5ff2103c43c7c3ce72662429554a`  
**Scope:** Frontend only — **no** SQL, Edge, Fly, cron, secrets.

## Recorded production evidence (prior batch)

| Item | Evidence |
| --- | --- |
| Batch **229** Catalyst (authenticated UI, Nov **12**) | **Upcoming Earnings 821**, **Reported in Last 24h 791** — closes **ISS-046** acceptance path; **no further Catalyst counter work** in Batch 230 |
| Batch **217** RPC | `late_session_handoff_list_active_v1('2026-11-09')` → **3,776** rows / **1,525** symbols / ~**4.1 MB** |
| Client map+build | **~424 ms** on Nov 9 fixture (`batch217-am-inbox-production-readiness.test.ts`) |

## Audit summary (Batch 230)

| Area | Finding | Source change? |
| --- | --- | --- |
| Continuation RPC | Single RPC, **25 s** timeout, no RPC pagination; UI caps **6** / **40** | **No** |
| Categories + expiry | Power-Hour, After-Hours, Strong Close/HOD, Day-Two — client/server aligned; Fri→Mon / Day-Two rollover covered in **186/217** tests | **No** |
| Card navigation | `PreMarketSymbolActions` + `workflowSymbolRoutes` (Batch **217**) | **Yes** — helper `amInboxNavigatePath` fixed |
| Prior-session labeling | Section + card copy unchanged | **No** |
| Workspace first load | `get-pre-market-workspace` had **no** client timeout → unbounded `isLoading` | **Yes** — **25 s** bounded fetch |
| Authenticated UI | **NOT VERIFIED** — **ISS-025 stays OPEN** | Docs / runbook only |

## Source fixes

1. **`am-inbox-workflow-handoff.ts`** — `amInboxNavigatePath` now always returns symbol-aware Screeners and Action Center URLs (matches `workflowSymbolRoutes`).
2. **`usePreMarketWorkspace.ts`** — `fetchPreMarketWorkspace` + `PRE_MARKET_WORKSPACE_FETCH_TIMEOUT_MS` (**25 s**, same bound as handoff RPC).

## Verification (local)

```sh
npm run typecheck
npm run test -- src/lib/am-inbox/__tests__/batch217-am-inbox-production-readiness.test.ts src/lib/am-inbox/__tests__/batch186-am-inbox-continuation-acceptance.test.ts src/lib/am-inbox/__tests__/am-inbox-late-session.test.ts src/hooks/__tests__/usePreMarketWorkspace.test.tsx src/hooks/__tests__/useAmInboxLateSessionHandoffs.test.tsx src/pages/dashboard/__tests__/AMInbox.late-session-reliability.test.tsx
npm run build
```

## Authenticated production steps still required (do not close ISS-025)

1. Sign in on **Vercel production** (confirm deployment SHA vs merged PR).
2. Open **AM Inbox** during **pre-market**; confirm Late-Session Continuation exits loading within **~25 s** on success or error (not infinite spinner).
3. With Nov-scale data: default **6** cards, **View All** paging **40**, volume-first ordering.
4. Spot-check categories: Power-Hour Momentum, After-Hours Continuation, Strong Close Near HOD, Day-Two Watch — correct labels, source session dates, expired rows omitted on Monday AM.
5. From a continuation card, open **Screeners**, **Catalyst**, **Watchlist**, **AI Analyst**, **Journal**, **Action Center** — URLs include `?symbol=` (and `securityId` when present).
6. Confirm “Prior-session snapshot — not live market activity” on cards; workspace delayed-data disclosure in header.
7. Induce workspace refresh failure (offline / retry) — prior continuation cards remain when refresh warning path applies (Batch **186.1**).
