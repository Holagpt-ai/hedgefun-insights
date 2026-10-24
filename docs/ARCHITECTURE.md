# Architecture

Stocksist is a Vite React SPA with a Supabase backend and a few long-running Fly workers. Production web traffic is served by Vercel at `https://stocksist.com`.

```text
Browser (Vercel SPA)
  -> Supabase Auth
  -> Supabase Edge Functions (market data, screeners, catalyst, SEC, watchlist, chat, sitemap, MCP)
  -> Postgres (supabase/migrations)

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
- Brand and canonical origin: `src/config/brand.ts`, `seo-boundaries.ts`, `src/config/seo.ts`.
- Screeners and Radar UI read worker output and Edge helpers under `src/lib/screeners/` and `src/lib/radar/`.
- Catalyst UI: `src/pages/dashboard/Catalyst.tsx` and `src/lib/catalyst/`.
- AI Analyst UI: `src/pages/dashboard/AIAnalyst.tsx`. Chat execution is the `chat` Edge Function.
- Journal UI: `src/journal/` mounted at `/dashboard/journal`.
- MCP tool source: `src/lib/mcp/`. The deployed handler is the generated file `supabase/functions/mcp/index.ts`.

## Backend

- Supabase project id in repo config: `zcjptaolpumhtlwhlemq` (`supabase/config.toml`).
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
| AI Analyst | Client calls `chat` |
| Watchlist | `get-watchlist-data` and watchlist analysis functions |
| Pre-market / after-hours | `get-pre-market-workspace`, `get-daily-brief`, inbox pages |

## What is not in this repo

A separate Next.js SEO stack is described in `src/config/seo.ts` and is not part of this Vite app. Do not duplicate programmatic SEO pages here.

Detailed service inventory: `docs/DATA_AND_SERVICES.md`. Routes: `docs/ROUTE_MAP.md`.
