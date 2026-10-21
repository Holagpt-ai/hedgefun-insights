# Batch 30 — Daily Intelligence & Connected Workflows

Cross-platform distribution of Batch 29 `SymbolCatalystPlatformContext` into AM Inbox, PM Inbox, Action Center, Watchlist, and Day Trade Radar.

## Rules

- Propagate `verified` / `none` / `unavailable` (plus explicit `pending` while enrichment loads).
- Reuse `useCatalystEnrichmentForSymbols` fetch + `selectEnrichmentEntries`; add `useCatalystPlatformContextForSymbols` for guards and evidence graph.
- Do not change volume-first scanner ranking or fabricate catalyst causation.
- Market evidence handoffs may include optional verified catalyst metadata for Action Center continuity.

## Surfaces

| Surface | Module |
|---------|--------|
| AM Inbox morning board | `am-inbox-catalyst-intelligence.ts` |
| PM Inbox activity | `pm-inbox-catalyst-intelligence.ts` |
| Action Center leaders | `action-center-catalyst-intelligence.ts` |
| Watchlist | `watchlist-catalyst-context.ts` (`resolveWatchlistPlatformContext`) |
| Radar news column | `radar-catalyst-platform.ts` |
