# Batch 179 — Public website & conversion V1

Targeted public discovery → stock research → registration handoff fixes. No scanner/Radar logic changes.

## Corrected defects

| Area | Fix |
| --- | --- |
| Stock detail URLs | Homepage movers, hero search, Market Pulse, public movers pages, screener, and shared movers layout use `publicStockDetailPath` (canonical `/stocks/SYMBOL`) |
| Screener watchlist | Toolbar + related-tools watchlist tiles use `publicWatchlistEntryHref` |
| Historical Radar link | Guests auth-gated to login with preserved screener `symbol` + `focus=historical` |
| Homepage watchlist tile | Routes to login + `/dashboard/watchlist` instead of legacy `/watchlist` dead-end for guests |
| Catalyst CTA | Removed `href="#"` fallback when symbol invalid |
| Stock chart CTA | Uses validated `publicChartPath` |
| Copy accuracy | Homepage hero + stock meta descriptions disclose delayed data; workspace/AI availability clarified |

## Tests

`src/lib/__tests__/batch179-public-conversion.test.ts`
