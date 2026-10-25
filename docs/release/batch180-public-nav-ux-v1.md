# Batch 180 — Public navigation & UX integrity V1

Residual public surfaces after Batch 179: trending, heatmap, IPO screener, symbol lookup.

## Fixes

- Canonical stock links + `trackPublicDiscoveryNav` on the four pages
- ETF/FUND rows in symbol lookup → `/etf/SYMBOL`
- Watchlist/auth handoffs via `publicWatchlistEntryHref`
- Delayed-data and non-wired feature disclosures (heatmap export/timeframes, trending metrics)
- Heatmap download/timeframe dead clicks → explicit coming-soon toasts

## Tests

`src/lib/__tests__/batch180-public-nav-ux.test.ts`
