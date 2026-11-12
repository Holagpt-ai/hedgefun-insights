# Batch 232 — Watchlist V2 data reliability & workflow handoffs V1

**Baseline:** GitHub `main` `d4c77d1f45f7c484bb43123cd8f7ca7ae9fd751e`  
**Scope:** Frontend only — **no** SQL, Edge, Fly, cron, secrets, Watchlist AI pipeline changes.

## Recorded production evidence (Batch 231 scanner ledger, owner-verified)

| Item | Evidence |
| --- | --- |
| Published generation jobs | **502** jobs **Nov 10–12** |
| Chunks + publish RPC | **Complete** on all recorded jobs |
| NHL baseline | **Loaded** |
| Staging artifacts | **Present** as expected |
| Historical per-tab evaluation (Layer C) | **NOT VERIFIED** — `tab_evaluation_evidence` / per-job fields **not stored** on generation job rows; DB ledger alone cannot close Layer C |

Batch **231** was acceptance-only (**no PR**). Layer B six-tab feed checks from Batch **227** remain the reference for feed shape.

## Audit summary (Batch 232)

| Area | Finding | Source change? |
| --- | --- | --- |
| Cold load / symbols before analysis | `resolveWatchlistLoadingState` + split symbol/analysis queries — **PASS** (Batch **220**) | **No** |
| RLS, dedupe, ownership | Existing contracts + batch **24 / 24.1 / 11** tests — **PASS** | **No** |
| Delayed / stale quote UX | Trust states, disclosure, `data_unavailable` copy — **PASS** | **No** |
| Add via `useAddToWatchlist` / stock detail CTA | Invalidated legacy `["watchlist"]` only → **V2 grid stale** after add | **Yes** |
| Outbound workflow links from row actions | Hard-coded `?symbol=` only — drops session `securityId` | **Yes** |
| Inbound handoffs (Screeners, Pre-Market, Catalyst, Action Center) | Already use `workflowSymbolRoutes` elsewhere — **PASS** | **No** |

## Confirmed defects fixed

1. **`invalidateWatchlistClientCaches`** — shared helper invalidates legacy watchlist keys **and** `watchlist-v2` query tree.
2. **`useAddToWatchlist`** + **`StockCtaButtons`** — call helper after successful insert.
3. **`useWatchlistV2`** add/remove — use same helper (keeps legacy hooks in sync).
4. **`WatchlistRowV2`** expanded workflow actions — `workflowSymbolRoutes` + `touchWorkflowHandoff`; optional **Action Center** link; chart/stock use canonical routes.

## Verification (local)

```sh
npm run typecheck
npm run test -- src/lib/watchlist-v2/__tests__/batch232-invalidate-watchlist-caches.test.ts src/lib/watchlist-v2/__tests__/batch24-watchlist-data-reliability.test.ts src/lib/watchlist-v2/__tests__/batch24-1-watchlist-isolation.test.ts src/lib/watchlist-v2/__tests__/watchlist-loading-state.test.ts src/lib/watchlist-v2/__tests__/batch11-watchlist-session-reliability.test.ts src/lib/historical-workflow/__tests__/batch173-handoff-integrity.test.ts src/components/watchlist-v2/__tests__/WatchlistRowV2.test.tsx
npm run build
```

**Local (Nov 12):** typecheck **PASS**; **53** targeted Vitest **PASS**; build **PASS** (`index-DDUOTP1u.js`).

## Authenticated production steps still recommended

1. Sign in on production Watchlist V2; confirm saved symbols render **before** analysis completes (cold load).
2. Add symbol from **stock detail** and from **screener/radar** CTA; confirm symbol appears on Watchlist **without hard refresh**.
3. Remove symbol; refresh page — confirm persistence and user isolation (second account cannot see first user's list).
4. From Watchlist row actions (expanded), open **AI Analyst**, **Catalyst**, **Screeners**, **Action Center** — URLs include `securityId` when session handoff exists.
5. Spot-check delayed-feed disclosure on quotes (15-minute policy); stale rows show unavailable states, not fabricated live prices.

## Deferred (explicitly out of scope)

- Watchlist AI generation / analysis pipeline
- AI Analyst V2.1 troubleshooting
- SQL migrations or production DB writes
