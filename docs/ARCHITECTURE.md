# Architecture

Stocksist is a Vite React SPA with a Supabase backend and a few long-running Fly workers. Production web traffic is served by Vercel at `https://stocksist.com`. The Supabase project (`zcjptaolpumhtlwhlemq`) is **managed in Lovable Cloud**; GitHub `main` holds the authoritative backend source.

```text
Browser (Vercel SPA — stocksist.com)
  -> Supabase Auth (Lovable Cloud / project zcjptaolpumhtlwhlemq)
  -> Supabase Edge Functions (market data, screeners, catalyst, SEC, watchlist, chat, sitemap, MCP)
  -> Postgres (schema from supabase/migrations in git; apply via Lovable Cloud)

Fly stocksist-radar-v22-worker
  -> Massive / Polygon feed
  -> Edge radar-worker-bridge
  -> Postgres

Fly stocksist-historical-backfill-job (one-shot)
  -> same bridge
  -> Postgres

Fly stocksist-sec-egress-gateway
  -> SEC HTTPS only, when Catalyst is switched to gateway transport

Fly stocksist-ai-trader-shadow-worker
  -> shadow runtime; operating mode OFF; deferred product
```

## Frontend

- Entry: `src/App.tsx` (React Router 6). Layouts: public, dashboard, smart (auth-aware), admin, standalone chart and newsletter.
- Heavy dashboard and public research routes load via `React.lazy` in `src/lazyPages.ts` with `Suspense` and `RouteLoadingFallback` in `App.tsx` (dashboard trader surfaces, journal, admin, chart, heatmap, inboxes, stock/ETF detail, screener, movers, watchlist, news, earnings, articles). Auth and entitlement wrappers stay on the route tree; lazy loading only defers JS download.
- Brand and canonical origin: `src/config/brand.ts`, `seo-boundaries.ts`, `src/config/seo.ts`.
- Screeners and Radar UI read worker output and Edge helpers under `src/lib/screeners/` and `src/lib/radar/`.
- Public `/markets/premarket` reads the same provider gainers and losers snapshot as the regular mover tabs. A row stays on that tab only when the observation timestamp is inside the 4:00–9:30 a.m. ET premarket window. Regular-session prints stay on the gainers and losers tabs. Missing premarket volume stays blank. The table does not invent RVOL or catalyst.
- Catalyst UI: `src/pages/dashboard/Catalyst.tsx` and `src/lib/catalyst/`.
- AI Analyst UI: `src/pages/dashboard/AIAnalyst.tsx`. Chat execution is the `chat` Edge Function.
- Journal UI: `src/journal/` mounted at `/dashboard/journal`.
- MCP tool source: `src/lib/mcp/`. The deployed handler is the generated file `supabase/functions/mcp/index.ts`.

## Backend

- Supabase project id in repo config: `zcjptaolpumhtlwhlemq` (`supabase/config.toml`). Production Supabase operations (deploy Edge Functions, apply migrations, secrets, logs) run through **Lovable Cloud**, not a separate personal Supabase account by default.
- **Cursor / GitHub:** backend code, migrations as files, Edge Function source, tests, and PRs to `main`.
- **Lovable Cloud:** executes production Supabase deploys and configuration against that project.
- **Vercel:** hosts the public SPA at `https://stocksist.com`.
- Edge Functions live in `supabase/functions/`. Shared code is `supabase/functions/_shared/`.
- The Radar worker image is `services/scanner-stream-worker` (`fly.radar.toml`). It publishes the 52-week baseline and, while it holds the lease, the Radar V2.2 board. It does not hold the service-role key.
- Historical catch-up is `services/historical-backfill-job` (`fly.historical-backfill.toml`).
- SEC egress is `services/sec-egress-gateway`. Catalyst remains on direct Supabase egress until `SEC_TRANSPORT_MODE=gateway` is set. That switch is not part of ordinary app merges.
- AI Trader shadow orchestration is `services/ai-trader-shadow-worker`. Product work is deferred.

## Request paths that matter

| User action | Path |
| --- | --- |
| Public page | Vercel rewrite to `index.html`, except `/sitemap.xml` which rewrites to the `sitemap` Edge Function |
| Dashboard screeners | Client reads Radar/screener data exposed through Edge and Postgres |
| Catalyst page | Client reads catalyst intelligence already stored by sync functions |
| AI Analyst | Client calls `chat`. Current-catalyst questions attach a bounded evidence packet; other questions use the same function without that priority block |
| Watchlist | `get-watchlist-data` and watchlist analysis functions |
| Pre-market / after-hours | `get-pre-market-workspace`, `get-daily-brief`, inbox pages |

## AI Analyst catalyst evidence

The dashboard still calls `chat`. For a current-catalyst question, the client packet and the Edge fresh-search path classify evidence before the model sees it:

- Verified SEC or company filings and confirmed catalyst rows can lead the answer when they match the asked symbol and are current for the session.
- Unverified headlines stay secondary.
- Events older than 45 days are historical context, not today's cause.
- A missing source, timestamp, or figure stays null. The prompt says null means unavailable.
- `supabase/functions/chat/analyst-intelligence-delivery.ts` keeps the serialized packet at or under 4500 characters and keeps sourced priority facts ahead of lower-priority rows.

General questions use the same `chat` function. The priority catalyst block is added only when the packet is in current-catalyst mode. This path does not write Postgres, does not change scanner ranking, and does not change SEC ingestion. Production chat behavior changes only after an approved deploy of `chat`.

## Scanner, Radar, and catalyst surfacing

Volume-first ranking and Radar promotion stay on market momentum. The Fly scanner worker (`services/scanner-stream-worker`) does not fetch catalyst rows for rank or promotion; shared contract `supabase/functions/_shared/radar-v22/scanner-catalyst-surfacing.ts` documents client-side enrichment only.

Verified catalyst copy on Screeners, Day Trade Radar, and the Catalyst tab uses:

- `src/lib/catalyst/enrichment.ts` for per-symbol selection, SEC freshness gates, and invalidated-row exclusion.
- `catalystDisplayCategoryFromEvent()` / `catalystDisplayLabelFromEvent()` for SEC EDGAR taxonomy (8-K items, offerings, and so on) instead of generic `sec_filing_news` labels.
- Catalyst tab filters in `src/lib/catalyst/catalyst-filters.ts`, including an **SEC EDGAR** provider chip that does not raise the global feed fetch limit.

Symbol handoffs from Radar to Action Center use `workflowSymbolRoutes()` so `?symbol=` (and optional `securityId`) persist across Screeners → Catalyst → AI Analyst → Watchlist → Journal → Action Center.

### Momentum Radar + catalyst discovery (V2)

Catalyst tab discovery uses existing `catalyst_events` rows only (`catalyst-discovery-priority.ts`): **Market-moving** category filter, **Market-moving priority** vs **Newest** sort, and preserved **SEC EDGAR** provider filter. No fetch limit increase.

Radar news cells distinguish **verified catalyst** vs **historical catalyst context** vs **unverified news** vs unavailable (`radar-momentum-catalyst-context.ts`, `radar-news-display.ts`). Association is display-only and does not affect scanner rank or promotion.

Day Trade Five Pillars transparency (Batch 182): `buildFivePillarsTransparencyView()` in `src/lib/day-trade/five-pillars-transparency.ts` evaluates price, move, float, participation, and freshness from the same scanner row fields as `day-trade-strategy` and `day-trade-freshness`, merged with persisted `day_trade_qualification_state` for grace, monitoring, and desk lifecycle. Radar detail renders `FivePillarsQualificationSection`. Ranking and desk selection are unchanged.

Trader discovery routes: `momentumWorkflowRoutes()` links Radar/Screeners, Catalyst, AI Analyst, Watchlist, Journal, and Action Center with `?symbol=`.

Production Fly worker **`stocksist-radar-v22-worker` v45** (digest `sha256:47ff670c…`) matches approved worker behavior on `main` through `ce68e0d8`; image git SHA is not labeled by Fly.

Market movers: Polygon snapshot `day.v=0` is treated as **missing** volume (`polygonSnapshotVolume` in `movers-integrity.ts`). Verified zero from cache/RPC still sorts before unknown volume.

Live-market acceptance report: `docs/release/scanner-live-market-acceptance-v1.md`.

## What is not in this repo

A separate Next.js SEO stack is described in `src/config/seo.ts` and is not part of this Vite app. Do not duplicate programmatic SEO pages here.

Detailed service inventory: `docs/DATA_AND_SERVICES.md`. Routes: `docs/ROUTE_MAP.md`.
