# Batch 178 — Scanner session integrity V1

**Date observed:** 2026-10-26, about 1:12 p.m. ET (regular session).  
**Git baseline before this change:** `origin/main` `d4095c86` (PR **#178** / Batch 180).  
**Scope:** Public premarket mover tab versus the regular-session snapshot. No Edge deploy, migration, Fly change, or worker redeploy.

## What production showed

Read-only load of `https://stocksist.com/markets/premarket` while the clock said **MARKET OPEN**:

- The Premarket tab listed gainers and losers (examples: AZTR, RCT, SGRY, BRZL, XP).
- Observation window on the page: **Oct 26, 12:33 p.m. through 12:56 p.m. ET**. That is regular session, not 4:00–9:30 a.m. ET.
- Copy still said dedicated premarket feeds are not enabled, and quotes are about 15 minutes delayed.
- Volume was present because the regular-session day bar had accumulated. That is the afternoon fill of a tab that the premarket window does not own.

Production asset manifest at the same check: `index-CkKMF7mN.js` / `index-CqYGeua4.css`. The manifest has no git SHA. It is newer than the 2026-10-24 hash `index-Drz78K0e.js` recorded in older deploy notes. It does not prove the Vercel build is `d4095c86`.

Batch **174** (PR **#174**) remains the pre-session checklist. It was not merged, it conflicts with `main`, and this afternoon check is not a full 4:00 a.m.–8:00 p.m. ET acceptance pass.

## Root cause

`fetchPremarketGainersRows` and `fetchPremarketLosersRows` map the provider top-gainers and top-losers snapshot with session `premarket` regardless of the observation clock. A regular-session last trade versus the prior close is a valid price pair, so the afternoon snapshot populated the premarket tab.

`polygonSnapshotVolume` still treats Polygon `day.v = 0` as missing for regular lists (ISS-020). Extended rows were copying that same helper, so a premarket print could not use positive minute accumulation while `day.v` was 0, and could show regular day volume once the regular bar existed.

Radar V2 candidate mapping still leaves daily `rvol` null when it is not persisted. 5-minute RVOL stays on `rvol_5m` and is labeled unavailable when the baseline or the regular-session window is missing (`assessRvol5mAvailability`). This batch does not fabricate those fields. Public mover tables do not have RVOL or catalyst columns.

Dashboard Day Trade Radar was not opened. It requires an authenticated session. Desktop tab restructuring stays a later batch.

## Fix

- Extended-session rows with a timestamp are kept only when `resolveMarketSessionAt` matches premarket or after-hours.
- The same regular-session ticker remains eligible on the regular gainers and losers lists.
- Premarket and after-hours volume uses positive minute accumulation (`min.av`, then `min.v`). `day.v = 0` is not shown as zero and is not copied from the regular day bar.
- When the clock is outside premarket, the premarket tab says the session has ended and that regular-session snapshots are not listed there.

## Not changed

- Fly `stocksist-radar-v22-worker` (last read-only note: release **v45**). Not queried again this session.
- Lovable Cloud Edge revisions, including `chat` (**ISS-015** blocked).
- Catalyst distribution activation (**ISS-006**).
- AI Trader, broker integration, billing, real-time feed upgrades.
