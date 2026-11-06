# Batch 195.1 — Issuer headline attribution

**Base:** GitHub `main` `67e3418a` (Batch 191.1, PR #221). **PR:** #222, not merged. Opening-subject fix `a12ee112`. Polygon source-badge correction `dad9afac`. Trust-safety follow-up (wire without issuer attribution; detail panel earnings facts) — see latest head SHA on the branch. No migrations, no production `catalyst_events` edits, no Edge deploy, no Vercel deploy, no feed-provider change.

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
5. `catalystSourceBadge` is the separate source chip on `CatalystEventCard`. For `provider="polygon"` it now uses the same wire-versus-editorial rule as the category label. GlobeNewswire, Business Wire, and the other verified wire names are **PRESS RELEASE** / **Press Release** only for a direct issuer row. Motley Fool, Zacks, and the other editorial publishers stay **NEWS** / **News**. A related or unverified association stays **Unverified association** (or the sector context label) and its source chip stays **NEWS**.
6. **Trust-safety:** For generic news providers (`polygon`, `news`, `news_pr`, `NEWS_PR`), a wire-style **source_name** alone does not imply Press Release when `attribution_class` and `ticker_specific` are both unknown. Direct issuer rows with stored attribution still map wire items to Press Release. Authoritative **company IR** remains Press Release without relying on headline attribution. `CatalystDetailPanel` omits the Market Facts block (EPS, surprise) when `isRelatedIssuerAssociation` is true, while headline and Source line stay visible.

## Where this runs

**Vercel frontend correction.** The label and badge change is in the web app: `src/lib/catalyst/presentation.ts` (`catalystSourceBadge`, `isIssuerWireRelease`), `src/lib/catalyst/catalyst-event-visuals.ts` (`catalystDisplayLabelFromEvent`), and `src/components/catalyst/CatalystEventCard.tsx`. Client read-path hydration and ranking (`src/lib/catalyst/attribution.ts`, `src/lib/catalyst/precedence.ts`) ship in the same frontend bundle. Nothing in this PR deploys Vercel. The correction is inactive on `https://stocksist.com` until a later frontend release.

**Backend activation is separate and is not done here.** The Deno copies of the attribution rules are not live until Lovable Cloud redeploys the Edge Functions that import them. No Edge deploy, migration, cron change, or production row edit is part of this PR.

Edge Functions that import `supabase/functions/_shared/catalyst/attribution.ts` and execute `attributeSymbol`:

| Function | Import |
| --- | --- |
| `sync-catalyst-events` | direct |
| `generate-daily-brief` | direct, and `canonicalUrl` / headline helpers via `_shared/pre-market/headlines.ts` |
| `get-pre-market-workspace` | direct, and the same headline helpers |
| `analyze-watchlist-tickers-v2` | direct, and again via `_shared/watchlist-v2/events.ts` |

Edge Functions that import `supabase/functions/_shared/catalyst/precedence.ts` (`classifyCatalystPrecedence` / `compareCatalystPrecedence`, including the related-headline demotion):

| Function | Import |
| --- | --- |
| `get-pre-market-workspace` | direct `compareCatalystPrecedence` |
| `generate-daily-brief` | `_shared/briefs/am-evidence.ts` |
| `chat` | `_shared/ai-analyst/catalyst-fallback-enrich.ts` → `catalyst-selection.ts` |

Edge Functions that import `supabase/functions/_shared/catalyst-intelligence/attribution-index.ts` (generic token `pharmaceuticals` on the intelligence name index):

| Function | Import |
| --- | --- |
| `sync-catalyst-news` | `serve-bot.ts` → `http.ts` → `run-bot.ts` |
| `sync-catalyst-ir` | same |
| `sync-catalyst-company-events` | same |
| `sync-catalyst-sec` | same |
| `sync-catalyst-reactions` | same |
| `sync-catalyst-attribution-correction` | `attribution-correction-http.ts` → `attribution-correction.ts` |

`analyze-watchlist-tickers-v2` also imports `_shared/ai/evidence.ts`, which takes the `AttributionClass` type and `NO_VERIFIED_CATALYST` from `attribution.ts`. Those two exports did not change. The function is already listed because it calls `attributeSymbol`.

## Not in this batch

- Rewriting or deleting stored catalyst rows.
- Changing Polygon, GlobeNewswire, or any other feed.
- Closing ISS-028. Authenticated production Catalyst, Watchlist, Action Center, and Radar are still not rechecked.
