# Batch 181 — Catalyst + Watchlist Source Integrity V1

**Base:** `origin/main` `d4095c86`. **No ISS-006 activation**, no Edge deploy, no migrations.

## Problem

Persisted `attribution_class: direct` in catalyst facts could disagree with the live headline. Radar “recent news” could show provider headlines that name another company. Watchlist `company_event` alerts reused the headline text without a ticker match gate. Source attribution lines were not shared across Radar and Market Pulse.

## Fix

| Area | Change |
| --- | --- |
| Hydration | Recompute attribution from title + related symbols; downgrade overstated persisted classes unless provider is SEC / earnings calendar / company IR |
| Presentation | `catalyst-attribution-presentation.ts` — tier labels, cross-surface source line, event identity, causation disclaimer |
| Radar | Recent-news tier requires `headlineQualifiesForTickerScopedNews`; verified catalyst source line uses cross-surface builder |
| Watchlist / Action Center | `formatWatchlistAlertFeedDetail` flags mismatched company_event headlines |
| Market Pulse | Causation disclaimer imported from shared presentation module |

## Out of scope

- Alert distribution / intel bridge activation (**ISS-006**)
- AI Analyst deferred regression (**ISS-007**)
- Five Pillars qualification labels (Batch **182**)
- Market-data ingestion and scanner worker logic
