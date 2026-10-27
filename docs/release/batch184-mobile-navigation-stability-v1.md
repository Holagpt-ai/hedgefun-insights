# Batch 184 — Mobile navigation stability & loading lifecycle V1

**Base:** `main` `e65746ab`  
**Issues addressed:** ISS-023 (reported), ISS-027 (partial — loading/skeleton termination)

## Root causes (confirmed in code)

1. **Late-Session Continuation query blocked the main thread** — `buildAmInboxLateSessionViewFromContexts` called `persistLateSessionHandoff` once per collapsed row. Each call re-read and re-wrote the entire sessionStorage JSON store (~O(n²) work). With Monday persistence (~800+ collapsed symbols), the React Query `queryFn` could run for many seconds on mobile, leaving `LateSessionHandoffsList` in loading and freezing touch navigation.
2. **Background refetch showed loading again** — AM Inbox treated `isFetching && !view` as loading even when cached data existed.
3. **Unbounded Radar V2 fetch for Volume Leaders** — `useRadarV2VolumeLeaders` had no timeout; a hung network left Volume Leaders in skeleton indefinitely during pre-market.
4. **Synchronous handoff writes on link click** — Pre-Market workflow links wrote sessionStorage on the click turn before the router navigated.

## Fixes

- Batch sessionStorage mirror + disable mirror on server fetch path.
- Initial-load-only skeleton for late session; bounded RPC timeout + React Query retries; Retry control on error.
- Radar V2 volume leaders fetch timeout → terminal unavailable (existing soft-refresh preserve rules unchanged).
- Defer handoff side effects; 1.5s guarded link clicks on Pre-Market / Carryover workflow links.

## Out of scope (Batch 185+)

- Scanner gap / tab-evaluation evidence (ISS-024, Batch 185).
- Full Tuesday continuation display acceptance (ISS-025, Batch 186).
- Carryover card density (ISS-030, Batch 188).

## Verification

```sh
npm run typecheck
npm run test -- src/lib/am-inbox/__tests__/batch184-mobile-navigation-lifecycle.test.ts
npm run build
```

Authenticated Android Chrome re-check of `/dashboard/pre-market` → workflow links → `/dashboard/screeners` and Carryover handoffs remains **NOT VERIFIED** in CI.
