# Stocksist Homepage — Calendar Integration Blueprint

**Deliverable 7 of the Stocksist FINAL Handoff Package**
**Source of truth — LATEST ONLY:** Homepage **v21** (approved 2026-11-18, Tony: "looks good") and **Catalyst Calendar v4** (Tony: "go", 2026-11-19).
**Scope:** Step 1 = homepage first, preview-approved, then Step 2 = calendar. This blueprint defines exactly how the two connect so Step 2 can be built without rework.
**Tech:** React / TypeScript / Vite, Vercel, Supabase / Lovable Cloud, Fly.io workers, Massive (ex-Polygon), Anthropic, GitHub repo `Holagpt-ai/hedgefun-insights`, entry `src/pages/Index.tsx`, components in `src/components/home/`. GitHub `main` is authoritative.

---

## 0. The one rule this blueprint exists to enforce

**Do NOT create two independent calendar engines.** There is ONE shared event feed, ONE shared event taxonomy, ONE shared quote object, and ONE AI Analyst voice. The homepage `HomepageTradingCalendar` widget and the full Catalyst Calendar v4 page are two views of the same system — a compact "today + tab" view and a full Month/List view. If a piece of calendar logic exists in two places with two sources of truth, that is a defect, not a feature.

**No Kalshi.** Kalshi / prediction-market integration is removed from the Catalyst Calendar and must not be added to the homepage widget, the full calendar, or any shared feed. Do not reintroduce it.

**Homepage Step 1, calendar Step 2.** The homepage widget is built in Step 1 as a consumer of the shared feed contract defined here; the full calendar page is built in Step 2. The feed contract below must be agreed before Step 1 build starts, so the widget does not have to be rebuilt for Step 2.

---

## 1. Shared event feed

### 1.1 What it is

A single backend event feed that serves both the homepage widget and the full calendar. Both views query the same endpoint(s) with different parameters (date range, tab filter, limit) — they never maintain separate event stores.

- **Source of events:** the existing Catalyst Calendar data pipeline (658 catalysts, 37 high impact — v4 figures; production counts come from the live feed, never hard-coded).
- **Delivery:** backend only (Fly.io workers / Supabase / Lovable Cloud edge functions). The frontend never calls Massive/Polygon or any event vendor directly.
- **Freshness:** events are scheduled data; the feed must carry a `fetched_at` / `updated_at` so both views can show the same freshness. Never show a stale event list as today's without a timestamp.
- **Deduplication:** one event = one ID. If the same catalyst appears in the homepage widget and the full calendar, it is the same record with the same ID, title, time, and impact.

### 1.2 Feed contract (to be confirmed against the repo — VERIFY IN REPO)

| Field | Notes |
|---|---|
| `event_id` | Stable, unique. Same ID in both views. |
| `type` | `catalyst` \| `earnings` \| `economic` — matches the shared taxonomy (§2). |
| `title` | Display title. |
| `symbols[]` | Affected tickers (may be empty for macro economic events). |
| `event_date` / `event_time` | Scheduled date/time, with timezone. Both views use the same timezone handling. |
| `impact` | `high` \| `medium` \| `low` (37 high-impact in v4 — production value from the feed). |
| `source` | Where the event came from (e.g. company, exchange, wire). |
| `detail_url` / `detail_id` | Where event detail lives (§6). |
| `ai_summary_id` | Link to the cached AI Analyst output for this event, if any (§8). Never generate AI live per view. |

> **VERIFY IN REPO:** whether this feed/endpoint already exists, its exact shape, and what has to be added. Do not assume any field exists until confirmed. Fields that do not exist yet are new development — list them explicitly in the build plan and confirm with Tony before building.

### 1.3 Queries each view makes

| View | Query |
|---|---|
| Homepage widget, Catalyst tab | Events for the selected day, `type=catalyst`, ordered by time/impact. Mockup shows "Today — Mon Nov 16" with 8 bulletins (illustrative count). |
| Homepage widget, Earnings tab | Events for the selected day, `type=earnings`. |
| Homepage widget, Economic tab | Events for the selected day, `type=economic`. |
| Full calendar, Month view | Events for the visible month, all types (filterable). |
| Full calendar, List view | Events for the visible range, all types (filterable), agenda-ordered. Default list range: Mon Nov 16 → Fri Nov 27 (v4). |

Both views must return the same event for the same day/type — if the widget and the full calendar disagree on an event, the feed (not the view) is wrong.

---

## 2. Shared event taxonomy

One taxonomy, used identically in both views. No view invents its own categories.

| Type | Meaning | Homepage tab | Full-calendar filter |
|---|---|---|---|
| `catalyst` | Company/market catalysts (earnings-adjacent news, FDA, guidance, contracts, etc. — per the existing Catalyst Calendar definition) | Catalyst | Catalyst |
| `earnings` | Scheduled earnings reports | Earnings | Earnings |
| `economic` | Economic releases (CPI, jobs, Fed, etc.) | Economic | Economic |

- **Impact levels:** `high` / `medium` / `low`, shared. The 37 high-impact figure (v4) is a feed count, not a hard-coded badge.
- **Status:** scheduled / released / cancelled (or the existing statuses — VERIFY IN REPO). Both views show the same status for the same event.
- **No Kalshi type.** There is no `prediction` / `kalshi` / `market` event type in the taxonomy. Do not add one.
- **Extensibility (§12):** new types are added to this taxonomy once, in the backend, and both views inherit them. A new type must not be added to one view only.

---

## 3. Date selection

- **Homepage widget:** shows the selected day (default: today). The user can move to another day (previous/next day control — per the v21 widget design; exact control VERIFY IN REPO / confirm against the v21 mockup at build time).
- **Full calendar:** Month view (month grid) and List view (agenda Mon Nov 16 → Fri Nov 27 by default in v4) both support date selection.
- **Carry-forward (CONFIRMED requirement):** the selected date in the homepage widget is carried forward when the user opens the full calendar. The full calendar opens on that date (Month view shows that month with that day highlighted; List view scrolls/starts at that date). The mechanism (URL query param and/or shared state) is an implementation choice — VERIFY IN REPO for the existing routing pattern — but the behaviour is mandatory: the user must never land on "today" in the full calendar after picking a different date on the homepage.
- **Single source of date truth:** the selected date lives in one place (URL param preferred so it is shareable/refresh-safe — PROPOSED, confirm in repo). Both views read it; neither view keeps a private copy that can drift.
- **Timezone:** one timezone rule for both views (event timezone as stored; display in the user's timezone where the existing site already does so — VERIFY IN REPO). Do not let the widget and the full calendar display different times for the same event.

---

## 4. Month and List views (full calendar, Step 2)

### 4.1 Month view

- Month grid showing event markers per day, filterable by type (Catalyst / Earnings / Economic).
- Selecting a day shows that day's events (same event records as the homepage widget for that day).
- Opening the Month view from the homepage lands on the carried-forward date's month, with that day highlighted (§3).

### 4.2 List view

- Agenda list, default range Mon Nov 16 → Fri Nov 27 (v4). Chronological, grouped by day.
- Same events, same order rules, same filters as Month view — switching Month ↔ List never changes which events exist, only how they are laid out.
- **Month | List toggle (CONFIRMED v4):** a single toggle switches views; the selected date and active filters persist across the toggle. Toggling must not reset the date or filters.

### 4.3 View state that persists

Across Month ↔ List, and across homepage → full calendar: selected date, active type filter(s), and (where applicable) impact filter. Losing any of these on navigation is a defect.

---

## 5. Catalyst / Earnings / Economic filters

- **Homepage widget:** three tabs — Catalyst / Earnings / Economic. Exactly one active at a time. Tab state is the filter.
- **Full calendar:** the same three filters (as filter controls, not necessarily tabs — per the v4 design). Selecting a filter shows only that type.
- **Carry-forward (CONFIRMED requirement):** the active tab/filter on the homepage is carried forward when opening the full calendar. If the user is on the Earnings tab on the homepage, the full calendar opens with the Earnings filter active.
- **Filter + date together:** date and filter carry forward as a pair. Opening the full calendar with "Earnings, Fri Nov 20" must show Earnings on Fri Nov 20 — not Earnings on today, and not all types on Fri Nov 20.
- **"All" state:** the full calendar may offer an "All" filter (PROPOSED — confirm against v4). The homepage has no "All" tab. If "All" exists in the full calendar, it is a full-calendar-only affordance and does not change the homepage tabs.

---

## 6. Event detail navigation

- **From the homepage widget:** tapping an event navigates to the event detail. Detail lives in the full calendar (event detail view / day view at that event's date) — PROPOSED, confirm the exact destination against v4 at build time. Do not build a separate homepage-only event-detail page.
- **From the full calendar:** tapping an event in Month or List opens the same event detail (same `event_id`, same content).
- **Deep-linkable:** event detail must be reachable by URL (so a shared link opens the same event) — PROPOSED, confirm in repo.
- **Consistency:** the title, time, symbols, impact, and source shown in the widget, in Month, in List, and in detail must all match — they are the same record (§1).

---

## 7. Shared quote data

- **One quote object per security** (§1 of Deliverable 5). Any price shown beside a calendar event — in the widget, in Month/List, in event detail, in a chart preview — comes from the same shared quote object.
- **No second price source.** The calendar must not fetch its own quotes. If the quote service is down, event prices show the unavailable state; events themselves (titles, times) still display.
- **Delayed/live flag:** prices beside events carry the same delayed/live flag and as-of timestamp as the rest of the homepage. Do not present a delayed price beside an event as live.
- **SPCX hover / sparkline (§8 of Deliverable 5 pattern):** hovering a symbol in the calendar (desktop) shows a sparkline preview per the SPCX pattern — CONFIRMED v4 behaviour. The sparkline uses the shared quote/history data, not a separate feed. On mobile there is no hover: tapping the symbol goes to the chart/stock detail instead.

---

## 8. Chart previews

- **Hover sparkline (desktop):** small sparkline on symbol hover, from shared quote/history data (see §7). Same data as the stock detail chart's underlying series — not a separately computed series.
- **Separate full chart pop-up (CONFIRMED v4):** clicking through to a full chart opens a **separate large pop-up** (not an inline expansion, not the same pop-up as the sparkline). Default timeframe **1D**. The pop-up chart uses the same shared quote/history data as the stock detail chart.
- **No chart duplication:** the pop-up is a view of the existing chart component/data, not a second chart implementation. Reuse the existing chart — VERIFY IN REPO which chart component the site uses.

---

## 9. AI Analyst

- **SPCX AI trader voice (CONFIRMED v4):** the AI Analyst voice for calendar events follows the SPCX pattern:
  - Catalyst first (the event is the lead, not the price).
  - Prev close vs current vs VWAP.
  - Key levels.
  - Timestamped (when the analysis was generated).
  - One explicit stance: **WAIT / LONG BIAS / AVOID / NO TRADE**.
- **Cached only:** AI output is generated once, cached server-side, and served to all viewers. **No paid AI request per visitor or per refresh.** If no cached output exists for an event, show the non-AI event detail (no stance, no fabricated analysis) — never trigger a live paid call from a page view and never invent a stance.
- **Same output in both views:** the homepage widget and the full calendar show the same cached AI text/stance for the same event (linked by `ai_summary_id`, §1.2). The widget may show a shortened version; the shortening must not change the stance or the key levels.
- **No AI Trader reopen:** this is the AI Analyst voice only. Do not add, reopen, or rename any "AI Trader" feature.

---

## 10. Watchlist

- **Shared Watchlist:** adding a symbol to the Watchlist from a calendar event (widget or full calendar) adds it to the same Watchlist the Dashboard and homepage use. One Watchlist, not a calendar-specific one.
- **State sync:** if a symbol is already on the Watchlist, both views show it as already-added. Adding from the widget must be reflected if the user then opens the full calendar (and vice versa) without a refresh — or, at minimum, after a refresh with no contradiction.
- **Auth required:** Watchlist add is an authenticated action (see §11). Guests are prompted to sign in; the action is not silently dropped and not performed anonymously.
- **VERIFY IN REPO:** whether Watchlist-add already exists from calendar/event contexts, or whether it is new development.

---

## 11. Trading Journal

- **Existing Dashboard Trading Journal:** journal entries from calendar events go to the **existing** Dashboard Trading Journal. Do not build a second journal, a calendar-only journal, or a separate journal store.
- **Linking:** a journal entry created from an event links back to that event (`event_id`) so the entry, the event, and the symbol stay connected — PROPOSED, confirm the existing Journal data model in the repo (VERIFY IN REPO).
- **Auth required:** journal actions are authenticated (see §12). Guests are prompted to sign in.
- **VERIFY IN REPO:** the existing Journal's entry-creation path and whether event-linking is already supported.

---

## 12. Guest vs authenticated behaviour

| Capability | Guest | Authenticated |
|---|---|---|
| View homepage calendar widget (all 3 tabs) | Yes | Yes |
| View full calendar Month / List | Yes | Yes |
| View event detail | Yes | Yes |
| View AI Analyst output (cached) | Yes | Yes |
| View chart previews / full chart pop-up | Yes (per existing chart access rules — VERIFY IN REPO) | Yes |
| Add to Watchlist | No — sign-in prompt | Yes |
| Add Journal entry | No — sign-in prompt | Yes |
| Personalised calendar (e.g. watchlist-filtered agenda) | No | Yes, if offered — PROPOSED, confirm against v4 (watchlist-filtered Dashboard agenda was discussed for the calendar; confirm scope with Tony before building) |

- **Calendar publicly accessible (CONFIRMED):** viewing the calendar — widget and full page — does not require sign-in.
- **Personalised actions preserve auth/entitlement:** Watchlist, Journal, and any Pro-gated feature keep their existing access controls. The homepage widget must not bypass them, and the full calendar must not bypass them either.
- **No guest data leakage:** guests never see another user's Watchlist, Journal, or My Assets.

---

## 13. Existing access controls

- **Preserve, don't rebuild:** the calendar integration reuses the site's existing auth and entitlement checks (Supabase auth, Pro entitlement) — it does not invent new ones.
- **Pro gating:** if any calendar capability is Pro-gated in the existing product, it stays Pro-gated in both views. The homepage widget must not expose a Pro-gated capability to free users, and the full calendar must not either.
- **VERIFY IN REPO:** which (if any) calendar capabilities are currently gated, and where the entitlement check lives, so both views call the same check.

---

## 14. Shared caching

| Cached item | Rule |
|---|---|
| Event feed | Cached server-side; both views read the same cache. A refresh updates both views, not one. |
| Quote data | Shared quote object cache (see Deliverable 5). One cache per security. |
| AI Analyst output | Generated once, cached server-side, served to all viewers until refreshed on schedule (see §9). Never per-visitor, never per-refresh. |
| Chart/history data for sparklines & pop-up | Same cache as the stock detail chart. |

- **Invalidation:** when the event feed refreshes, both views must reflect the refresh. A user must never see the widget showing yesterday's events while the full calendar shows today's (or vice versa).
- **No client-side caching divergence:** do not let the widget and the full calendar keep separate client caches of the same feed with different TTLs.

---

## 15. Future extensibility

- **New event types:** add once to the shared taxonomy (§2) in the backend; both views inherit them. Never add a type to one view only.
- **New filters:** add to the shared filter set; the homepage tabs and the full-calendar filters stay in sync (a filter that exists in one view and not the other must be an explicit, Tony-approved difference).
- **New AI voices / stances:** the stance set (WAIT / LONG BIAS / AVOID / NO TRADE) changes only as a deliberate product decision, in one place, for both views.
- **Watchlist-filtered agenda:** if built later (see §12), it is a filter on the shared feed, not a separate feed.
- **No prediction markets:** extensibility does not include Kalshi or any prediction-market type. That door stays closed unless Tony explicitly reopens it as a new decision — it is not part of this blueprint.

---

## 16. Build sequence (gating)

1. **Before Step 1:** confirm the feed contract (§1.2) against the repo — VERIFY IN REPO. List any missing fields/endpoints as new development and confirm with Tony.
2. **Step 1 — Homepage:** build `HomepageTradingCalendar` as a consumer of the shared feed, with date/tab carry-forward wired to the full-calendar route (even though the full page is not built yet — the route and params must exist as a contract).
3. **Step 2 — Calendar:** build Catalyst Calendar v4 (Month | List, List agenda Mon Nov 16 → Fri Nov 27, 658 catalysts / 37 high impact from the live feed, SPCX hover/sparkline, separate full chart pop-up 1D default, AI Analyst voice, Watchlist/Journal links) on the same feed.
4. **Verification pass:** after Step 2, check every item in §1–§15 in the live preview: same event in both views, date+filter carry-forward, same quote, same AI stance, no Kalshi, no second engine.

---

## 17. Verification checklist (for the Step 2 sign-off)

- [ ] Homepage widget and full calendar show the same events for the same day/type
- [ ] Date selected on the homepage carries forward to the full calendar
- [ ] Tab/filter selected on the homepage carries forward to the full calendar
- [ ] Month ↔ List toggle preserves date and filters
- [ ] List view default range is Mon Nov 16 → Fri Nov 27 (v4) unless the carried-forward date changes it
- [ ] Event detail is the same record from widget, Month, List, and detail view
- [ ] Prices beside events match the shared quote object (same value, same delayed/live flag)
- [ ] Hover sparkline (desktop) works; tap goes to chart on mobile
- [ ] Full chart opens in a separate large pop-up, 1D default
- [ ] AI Analyst shows catalyst first, prev close vs current vs VWAP, key levels, timestamp, and one of WAIT / LONG BIAS / AVOID / NO TRADE
- [ ] No paid AI call per visitor/refresh (cached only)
- [ ] Watchlist add from either view lands in the same Watchlist
- [ ] Journal entry from either view lands in the existing Dashboard Trading Journal
- [ ] Guests can view the calendar; Watchlist/Journal prompt sign-in
- [ ] Existing access controls / Pro gating preserved in both views
- [ ] No Kalshi / prediction-market content anywhere
- [ ] No second calendar engine (one feed, one taxonomy, one quote object)
- [ ] No hard-coded event counts or mockup bulletins in production
