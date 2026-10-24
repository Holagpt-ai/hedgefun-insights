# Catalyst Intelligence V2 — SEC EDGAR integration (read path)

Integrates verified `provider=sec_edgar` rows into classification, screener/scanner enrichment, and Catalyst UI. Does **not** change SEC ingestion, cron, or write authorization.

## Classification

- Form and 8-K **item** aware taxonomy (`classifySecFilingTaxonomy`) — no bullish/bearish from form type alone.
- Filing date vs SEC acceptance timestamp surfaced separately.

## Scanner / screener

- Volume-led ranking unchanged; catalyst fields are supporting metadata only.
- SEC rows excluded when `verification_state !== provider_reported`, stale/historical by published age, or `attribution_invalidated`.
- Dedupe via existing `dedupe_key` (`sec:{accession}:{symbol}`).

## UI

- `CatalystEventCard` shows filing type, attribution status, relevance signals (no fabricated market reaction).
- Workflow links: Catalyst, AI Analyst, Watchlist, Screeners, Action Center.

## Limitations

- No automated market-reaction scoring for SEC rows.
- Item detail limited to Atom summary / stored `sec_items` (no full filing parse in UI).
- AI interpretation only where existing analyst pipelines already consume catalyst evidence.
