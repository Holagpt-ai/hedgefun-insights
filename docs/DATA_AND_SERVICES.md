# Data and services

Postgres, Auth, and Edge Functions belong to Supabase project `zcjptaolpumhtlwhlemq`. Schema changes ship as timestamped files in `supabase/migrations/`. Production apply state is not stored in git. See `docs/DEPLOYMENT_STATUS.md`.

`drizzle/migrations/` mirrors selected changes for alternate tooling. It is not the production history (`docs/migration-drizzle-supabase-notes.md`).

## Edge Functions

Present under `supabase/functions/` on `main`:

| Area | Functions |
| --- | --- |
| Market data | `market-data`, `refresh-market-data`, `sync-stocks`, `sync-etfs`, `sync-indexes`, `sync-ticker-details`, `sync-ticker-search`, `sync-market-caps`, `sync-market-calendar`, `backfill-sectors` |
| Screeners and Radar | `sync-screener-data`, `sync-screener-stocks`, `sync-screener-52w-baselines`, `radar-worker-bridge`, `radar-historical-context`, `sync-after-hours-movers`, `get-pre-market-workspace` |
| Catalyst and SEC | `sync-catalyst-events`, `sync-catalyst-news`, `sync-catalyst-sec`, `sync-catalyst-ir`, `sync-catalyst-company-events`, `sync-catalyst-reactions`, `sync-catalyst-reconcile`, `sync-catalyst-attribution-correction`, `sync-catalyst-run-recovery`, `sync-sec-edgar-filings` |
| Watchlist and briefs | `get-watchlist-data`, `analyze-watchlist-tickers`, `analyze-watchlist-tickers-v2`, `run-watchlist-analysis-v2-batch`, `build-watchlist-rvol-baselines-v2`, `generate-daily-brief`, `get-daily-brief`, `brief-dispatch`, `evaluate-user-price-alerts` |
| AI | `chat`, `mcp` |
| Reference | `sync-news`, `sync-market-news`, `sync-earnings`, `sync-earnings-finnhub`, `invoke-sync-earnings`, `sync-ipos`, `sync-ipo-calendar`, `sync-ipo-news`, `sync-historical-ipos`, `get-stock-history`, `get-corporate-actions`, `sitemap` |
| Billing, mail, game | `stripe-checkout`, `stripe-portal`, `stripe-webhook`, `newsletter-welcome`, `newsletter-unsubscribe`, `game-join`, `game-trade`, `game-sync-prices` |

`mcp` is generated from `src/lib/mcp/` by `@lovable.dev/mcp-js` `0.20.0`. Manifest: `.lovable/mcp/manifest.json`. Tools: `search_stocks`, `get_stock_quote`, `get_market_movers`, `get_market_news`.

## Workers

| App | Config | Role |
| --- | --- | --- |
| `stocksist-radar-v22-worker` | `fly.radar.toml` | 52-week baseline publisher and Radar V2.2 feed. Image from `services/scanner-stream-worker`. |
| `stocksist-historical-backfill-job` | `fly.historical-backfill.toml` | One-shot historical catch-up. Image from `services/historical-backfill-job`. |
| `stocksist-sec-egress-gateway` | `services/sec-egress-gateway/fly.toml` | Fixed-path SEC fetch. Not a general proxy. |
| `stocksist-ai-trader-shadow-worker` | `services/ai-trader-shadow-worker/fly.toml` | Shadow cycles. Writes nothing while operating mode is `OFF`. Deferred. |

Radar and historical jobs call `radar-worker-bridge` with `RADAR_WORKER_SECRET`. They do not receive `SUPABASE_SERVICE_ROLE_KEY`.

## Client domains

| Area | Source |
| --- | --- |
| Scanner / Radar | `src/lib/screeners/`, `src/lib/radar/`, `src/pages/dashboard/Screeners.tsx` |
| Catalyst | `src/lib/catalyst/`, `src/pages/dashboard/Catalyst.tsx` |
| Historical / repeat movers | `src/lib/repeat-movers/`, `scripts/historical/` |
| SEC attribution | `src/lib/catalyst/sec-edgar-events.ts`, `supabase/functions/_shared/sec-edgar/` |
| Watchlist and inboxes | `src/lib/watchlist-v2/`, `src/pages/dashboard/AMInbox.tsx`, `PMInbox.tsx`, watchlist pages |
| Action Center | `src/pages/dashboard/ActionCenter.tsx`, `src/lib/action-center/` |
| AI Analyst | `src/pages/dashboard/AIAnalyst.tsx`, `src/lib/ai-analyst/`, `supabase/functions/chat/` |
| Journal | `src/journal/` |
| Homepage | `src/pages/Index.tsx` |

## Gates

- SEC scheduled ingestion was historically activated as cron job 52. See `docs/DEPLOYMENT_STATUS.md`. `docs/sec-edgar/unapplied-cron.sql` is a leftover draft, not the live schedule. An app merge does not reapply it.
- `docs/sec-edgar/gate-i3-activation-readiness.md` is the pre-activation procedure. It is not a current live-state reading.
- Catalyst source rows stay off until the activation sequence is approved.
- SEC gateway transport stays off until `SEC_TRANSPORT_MODE=gateway` is set on `sync-catalyst-sec`.

Current pause flags, the write flag, and the latest SEC checkpoint were not re-read for this record.
