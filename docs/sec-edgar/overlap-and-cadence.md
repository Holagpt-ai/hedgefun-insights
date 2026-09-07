# Latest Filings overlap audit and recommended cadence

Status: **do not apply cron**. V1B prepares controls only.

## Verified official source facts

Observed from official SEC Latest Filings (`https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent`) on 2026-09-07:

- The UI exposes count options: 10, 20, 40, 80, **100** entries.
- The default HTML view is **Items 1–40** and advertises an RSS/Atom feed.
- Official RSS documentation examples use `count=40` and `start=0`, which documents **start-based paging**.
- Current V1A/V1B discovery URL remains:
  `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&owner=include&count=100&output=atom`
- `owner=include` includes ownership forms (Forms 3/4/5). Those forms are **deferred** by Stocksist and discarded after fetch.
- The same official page stated: filings may be made Monday–Friday except **U.S. Federal Holidays**. That is the SEC filing calendar, not the NYSE/Nasdaq session calendar.

## Live firehose composition (same official page)

The default latest-40 list was dominated by Form 4 and Form 144 rows. No 8-K / 10-Q / 10-K appeared in that first page at the time of inspection.

Implication: with `owner=include`, a `count=100` poll can turn over almost entirely on ownership/restricted-sale noise while issuer-direct V1A forms never enter the window.

## Overlap risk of “100 filings / 5 minutes”

- Accession dedupe prevents duplicates. It does **not** recover filings that already scrolled off the latest-N window.
- Peak after-close and earnings-season bursts can accept far more than 100 EDGAR entries in five minutes, especially when Form 4/144 volume is included.
- Market-open is usually quieter for 8-Ks; the material risk is after the close and during clustered 8-K windows.
- Official paging exists (`start=`), but V1B does not implement a persistent checkpoint. Unbounded paging is out of scope.

**Conclusion:** `count=100` plus 5-minute polling plus accession dedupe is **not sufficient** for production cron. This is a material blind spot.

## Required architecture before cron

Do not schedule production polling until a later sprint adds one of:

1. Official `start=` paging until the previous high-water accession is seen, **or**
2. `owner=exclude` (official Ownership filter) plus a still-bounded page walk for issuer-direct forms, **or**
3. A persistent accession/accepted-at checkpoint with fail-closed overlap detection.

Prefer (1)+(3). Do not guess tickers for Form 3/4/5 or 13D/13G.

## Recommended cadence — documentation only

Target product window: weekdays **4:00 AM ET through 10:00 PM ET**, including filings outside regular session.

`pg_cron` is UTC. Do **not** assume server-local time.

America/New_York offset:

- EST = UTC−5 → 4:00 AM–10:00 PM ET = **09:00–03:00 UTC**
- EDT = UTC−4 → 4:00 AM–10:00 PM ET = **08:00–02:00 UTC**

A single year-round UTC cron cannot express ET without seasonal split. Recommended later (still unapplied):

- Weekday EST window: `*/5 9-23 * * 1-5` plus `*/5 0-2 * * 2-6`
- Weekday EDT window: `*/5 8-23 * * 1-5` plus `*/5 0-1 * * 2-6`
- Weekend: hourly or disabled until weekday checkpointing is proven
- Do **not** disable on NYSE/Nasdaq holidays

See `unapplied-cron.sql` for a blocked draft. Do not move it into `supabase/migrations`.

## Holiday behavior

SEC discovery must stay independent of the Stocksist market-open calendar.

- NYSE/Nasdaq closed ≠ no SEC filings
- Labor Day / weekend / federal-holiday filings can still matter for the next session
- Handler code never gates on market holidays (`shouldSkipSecDiscoveryForMarketHoliday` is always false)
