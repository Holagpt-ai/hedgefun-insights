# Batch 195.1 — Issuer headline attribution

**Base:** GitHub `main` `67e3418a` (Batch 191.1, PR #221). **PR:** #222, fix `a12ee112`, not merged. No migrations, no production `catalyst_events` edits, no Edge deploy, no feed-provider change.

## What the preview showed

| Case | What the code did | What it does now |
| --- | --- | --- |
| ACAD row with an RXRX or Viatris earnings headline | A shared word such as "pharmaceuticals", or a later company mention, satisfied `titleMentionsCompany` and the row was stored and ranked as ACAD's own earnings | Opening-subject match only. RXRX and Viatris stay direct for their own names. ACAD keeps the related symbol and is not labeled or ranked as the issuer |
| SpaceX Motley Fool item on GOOGM, GOOGN, and SPCX | `company_news` always mapped to display category Press Release. The Catalyst row badge is CSS-uppercase, so it read **PRESS RELEASE** | Editorial sources display as News. A row that is not the opening subject displays as Unverified association. The headline text remains |
| ORCL with an Arm earnings headline | "Oracle" anywhere in the title was enough for a direct ORCL event | Arm in the opening is the issuer event. A later Oracle mention stays related evidence |
| GlobeNewswire / Business Wire / company IR for the issuer | Same Press Release bucket as every other `company_news` row | Still Press Release when the row is that issuer's event |

## Path checked

1. Polygon ingest calls `attributeSymbol` in `supabase/functions/_shared/catalyst/attribution.ts` and writes one row per ticker that is ticker-specific or sector-related. `related_symbols` already lists the other tickers on the issuer row.
2. Persisted `facts.attribution_class` is reconciled on read by `hydrateCatalystEventVerification` for non-authoritative providers. Earnings calendar, SEC EDGAR, and company IR stay authoritative.
3. `classifyCatalystPrecedence` no longer lets a non-issuer earnings headline outrank that symbol's calendar row.
4. `catalystDisplayLabelFromEvent` is what `CatalystEventRow` and `CatalystDetailPanel` render. That label, not a second feed, produced the uppercase PRESS RELEASE badge.

## Not in this batch

- Rewriting or deleting stored catalyst rows.
- Changing Polygon, GlobeNewswire, or any other feed.
- Closing ISS-028. Authenticated production Catalyst, Watchlist, Action Center, and Radar are still not rechecked.
