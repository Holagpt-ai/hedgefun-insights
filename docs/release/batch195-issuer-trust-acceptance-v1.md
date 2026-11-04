# Batch 195 — Catalyst / Watchlist / Radar issuer-trust acceptance

**Base:** GitHub `main` **`0db6063f`**. Builds on Batch **181** (PR **#180**); no ISS-006 activation, no Edge deploy, no migrations.

## Cases checked

| Case | Surface | Source-code (main + fix) | Production (2026-11-04) |
| --- | --- | --- | --- |
| NVDA-primary headline on TSLA | Hydration, Watchlist, Action Center, Radar recent-news | **PASS** — downgraded / unverified association copy | **NOT VERIFIED** (auth required) |
| SpaceX “still a buy” on TSLA | Catalyst presentation, Radar recent-news | **CONFIRMED DEFECT → fixed** — was `provider_associated` recent tier; now blocked | **NOT VERIFIED** (auth required) |
| SpaceX vs Micron comparison on TSLA | Attribution, Radar | **PASS** — `unverified`, no recent tier | **NOT VERIFIED** |
| Tesla vs SpaceX comparison on TSLA | Presentation | **PASS** — Commentary, not Direct catalyst | **NOT VERIFIED** |
| NVDA-primary headline on ORCL | Hydration, Radar | **PASS** — unverified / no recent tier | **NOT VERIFIED** |
| Oracle-primary headline on ORCL | Presentation | **PASS** — Direct catalyst when hydrated direct | **NOT VERIFIED** |
| Persisted `direct` facts vs live headline | `hydrateCatalystEventVerification` | **PASS** — live reconciliation | **NOT VERIFIED** |
| SEC EDGAR TSLA 8-K | Authoritative providers | **PASS** — direct preserved | **NOT VERIFIED** |
| Sector roundup | Attribution tier | **PASS** — sector_context | **NOT VERIFIED** |
| Historical catalyst labels | `catalystAttributionDisplayLabel` | **PASS** — historical vs verified copy | **NOT VERIFIED** |
| Market Pulse causation | Shared disclaimer module | **PASS** — unit paths; no invented causation | **NOT VERIFIED** (homepage auth/session) |
| Stock detail “Recent News” (TSLA) | `StockNews` provider feed | **NOT VERIFIED** for Batch 181 scope — raw publisher feed may list peer headlines (e.g. SpaceX) without “Direct catalyst” labeling; distinct from Catalyst workspace |

## Production observations (unauthenticated)

- `https://stocksist.com/stocks/TSLA` — **Recent News** lists SpaceX/Micron comparison headlines from publishers. This is the **stock news feed**, not the Catalyst dashboard “Direct catalyst” card. No production claim that Catalyst workspace mislabels those rows (login required for `/dashboard/catalyst`, Watchlist, Action Center, Radar desk).

## Correction (narrow)

- **`headlineQualifiesForTickerScopedNews`** — exclude market-attention/commentary titles and block `provider_associated` recent-news when the headline does not mention the row ticker or company (closes SpaceX-primary slip on TSLA Radar cells). Market-attention patterns live in `market-attention.ts` (no attribution/precedence cycle).
- Tests: `batch195-recent-news-headline-gate.test.ts`, `radar-news-display.test.ts`.

## ISS-028

- **Cannot close.** Batch **181** guards **PASS** in source + regression tests; one Radar recent-news gap **fixed** in this batch. Authenticated Catalyst / Watchlist / Action Center / Radar desk **NOT VERIFIED** on production in this session.

## Remaining blockers

- Owner authenticated walkthrough of Catalyst, Watchlist, Action Center, Radar, Market Pulse with live rows.
- Optional follow-up: scope/styling for stock-detail **Recent News** vs issuer-scoped catalyst surfaces (out of Batch 181; document only).
