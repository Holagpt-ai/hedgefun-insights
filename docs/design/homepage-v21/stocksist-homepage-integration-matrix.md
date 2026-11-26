# Stocksist Homepage — Integration Matrix

**Deliverable 5 of the Stocksist FINAL Handoff Package**
**Source of truth — LATEST ONLY:** Homepage **v21** (approved 2026-11-18, Tony: "looks good") and **Catalyst Calendar v4** (Tony: "go", 2026-11-19).
**Scope:** Step 1 = homepage first, preview-approved, then Step 2 = calendar. Do not build Step 2 before Step 1 is approved.
**Tech:** React / TypeScript / Vite, Vercel, Supabase / Lovable Cloud, Fly.io workers, Massive (ex-Polygon), Anthropic, GitHub repo `Holagpt-ai/hedgefun-insights`, entry `src/pages/Index.tsx`, components in `src/components/home/`. GitHub `main` is authoritative.

---

## Global rules (apply to every component below)

- **One quote object per security.** Every component that shows a ticker must consume the same shared quote object (symbol, price, change, % change, volume, session state, as-of timestamp, delayed/live flag) — never fetch or render a second, divergent price for the same symbol on the same page.
- **Frontend never calls Massive/Polygon directly.** All market data flows through the existing Stocksist backend (Fly.io workers / Supabase / Lovable Cloud edge functions). Any direct client-side market-data call is a defect.
- **AI is cached.** No paid AI request per visitor or per refresh. AI text (Market Pulse, AI Analyst voice, catalyst summaries) is generated once, cached server-side, and served to all visitors until refreshed on schedule. If no cached AI output exists, show the non-AI fallback — never trigger a live paid call from a page view.
- **Never fabricate data.** No invented prices, percentages, volumes, catalysts, earnings dates, news items, or IPO entries. If a value is not available from a real source, show the empty / delayed / unavailable state defined for that component.
- **CONFIRMED vs PROPOSED.** Items marked **CONFIRMED** are existing Stocksist functionality per the v21 mockup approval and prior verified work. Items marked **PROPOSED — VERIFY IN REPO** require repository verification before build; do not assume the feature, API endpoint, or DB field exists.
- **No hard-coded mockup numbers in production.** All numbers in the v21 mockup (e.g. Moves percentages, index values, news items) are illustrative. Production must bind every number to live/delayed data or show the empty state.
- **No Kalshi.** Kalshi / prediction-market integration is removed. Do not reintroduce it in any component.
- **No AI Trader reopen.** Do not reopen or re-add an "AI Trader" feature.
- **No ad activation.** The AdvertisementSlot is a reserved placeholder only; do not activate real ads.
- **Delayed-data disclosure is an owner decision.** Do not silently remove delayed-data labelling. The checklist (Deliverable 6) carries this as an explicit decision item for Tony.
- **Known open defect:** Nasdaq 100 / Russell 2000 names clipped 3–9px in the index carousel (since v14). Fix only on Tony's say-so — see Deliverable 6.

---

## 1. HomepageHero

| Field | Detail |
|---|---|
| **Component name** | `HomepageHero` |
| **Purpose** | First impression and entry point: headline, market-session status, hero search, trending tickers, and the free-account CTA. |
| **Required data** | Headline copy (static, CONFIRMED): "Stock Market Intelligence for Every Investor". Market-session state (pre-market / regular / after-hours / closed, plus countdown to next session change). Trending tickers: NVDA, MSFT, PLTR, HIMS (CONFIRMED as mockup trending set; production list must come from a real trending source — VERIFY IN REPO). Hero search suggestions. |
| **Expected existing Stocksist service** | Market-session / market-status service (CONFIRMED — after-hours pill exists in v21). Search/autocomplete service — PROPOSED — VERIFY IN REPO whether an existing symbol-search endpoint exists and what it returns. |
| **User interactions** | Type in hero search → suggestions → select a result → destination route. Tap a trending ticker chip → destination route. Tap "Create free account" (hero) → sign-up. Tap "Start with the basics" → destination route (education/basics — VERIFY IN REPO for the existing route). Toggle EN\|ES. Toggle moon dark/light. Tap Log In / blue Sign Up in top nav. |
| **Destination routes** | Search result / trending ticker → stock detail page (existing route — VERIFY IN REPO for exact path). "Create free account" → sign-up flow. "Start with the basics" → basics/education route — VERIFY IN REPO. Top nav: Home only, with small PRO badge on Dashboard (CONFIRMED v21). |
| **Authentication requirements** | Guest: full hero visible, search usable, trending visible. Sign-up / Log In available in top nav (blue Sign Up; no "Create free account" in top nav — CONFIRMED v21). Authenticated: hero still shown; CTA state may change to Dashboard — PROPOSED — VERIFY IN REPO. |
| **Loading state** | Headline and static copy render immediately. Session pill shows neutral placeholder (no session label) until market-status resolves; search suggestions show skeleton only after first keystroke. |
| **Empty state** | Search with no matches: "No results for '<query>'" with a suggestion to check spelling — PROPOSED. Trending list empty: hide the trending row, do not show stale tickers. |
| **Error state** | Market-status fetch fails: hide the session pill (do not show a wrong session). Search service fails: search box remains, suggestions disabled, submitting a valid ticker still attempts direct navigation — PROPOSED — VERIFY IN REPO. |
| **Delayed-data behaviour** | Hero does not itself display prices; if trending chips ever show prices, they must carry the same delayed/live flag as the shared quote object. No price without a timestamp/flag. |
| **Mobile behaviour** | 375px: hero search is the first element in the stacking order (hero search → index carousel → Moves → My Assets → Movers → Calendar → tool cards → news → IPOs). Full-width search, trending chips wrap, CTA full-width or centred per v21 mobile mockup. No horizontal overflow. |
| **Dependencies** | Market-status service; search/autocomplete service; auth (sign-up / log-in); i18n EN\|ES toggle; theme (dark/light) toggle. |
| **Potential new development requirements** | Search/autocomplete endpoint if none exists (VERIFY IN REPO first). Trending-ticker source if none exists (VERIFY IN REPO first). "Start with the basics" destination if no route exists (VERIFY IN REPO first). Countdown logic for session transitions — VERIFY IN REPO whether existing. |

---

## 2. StockIndexes

| Field | Detail |
|---|---|
| **Component name** | `StockIndexes` |
| **Purpose** | Index carousel: exactly 10 indexes across 2 pages (CONFIRMED v21), swipeable on mobile, paged on desktop. |
| **Required data** | Per index: name, value, change, % change, as-of timestamp, delayed/live flag — all from the shared quote object per index. Exactly 10 indexes / 2 pages. |
| **Expected existing Stocksist service** | Index quote feed via backend (Fly.io workers / Supabase) — CONFIRMED in principle (indexes already displayed on Stocksist); exact endpoint and the 10-index list — VERIFY IN REPO. |
| **User interactions** | Swipe (mobile) or page/arrow (desktop) between the 2 pages. Tap an index → destination route (index detail / chart — VERIFY IN REPO for exact route). |
| **Destination routes** | Index detail/chart page — VERIFY IN REPO. |
| **Authentication requirements** | Public. No auth required to view. |
| **Loading state** | Skeleton cards for all 10 slots; page dots visible but inactive until data loads. |
| **Empty state** | If the feed returns no indexes: hide the carousel section rather than showing empty cards. Partial feed: show only returned indexes and note the count — PROPOSED. |
| **Error state** | Feed failure: carousel hidden with a small inline retry — PROPOSED; never show stale index values as current. |
| **Delayed-data behaviour** | Indexes are delayed unless a live entitlement exists. Show the delayed/live indicator consistently with the rest of the page; do not present delayed values as live. Disclosure wording is an owner decision (see Deliverable 6). |
| **Mobile behaviour** | 375px: second in stacking order (after hero search). Swipe between 2 pages; cards sized to viewport with no horizontal page overflow. **Known defect:** Nasdaq 100 / Russell 2000 names clipped 3–9px — fix only on Tony's say-so. |
| **Dependencies** | Index quote feed; shared quote object; carousel/swipe handling. |
| **Potential new development requirements** | Paging/swipe implementation if not already in the codebase (VERIFY IN REPO). Confirm the canonical 10-index list with Tony if the repo list differs. |

---

## 3. SignificantMarketMoves

| Field | Detail |
|---|---|
| **Component name** | `SignificantMarketMoves` ("Moves") |
| **Purpose** | "Moves" — 3 cards highlighting the day's significant movers, with volume and catalyst linkage. |
| **Required data** | Per card: symbol, company name, % change, price, volume, catalyst status ("Catalyst found" / "No catalyst linked yet"), as-of timestamp, delayed/live flag. Mockup values are illustrative only: TTD +13.79% Vol 8.42M, AVGO +13.67% Vol 3.18M, ABR −20.50% Vol 6.10M (CONFIRMED as mockup content; production values must be live/delayed data, never these numbers). |
| **Expected existing Stocksist service** | Market-movers computation (top gainers/losers) — CONFIRMED in principle (Market Movers exists); the 3-card "Moves" selection rule and the catalyst-linkage lookup — PROPOSED — VERIFY IN REPO. Catalyst data source: Catalyst Calendar feed (see Deliverable 7). |
| **User interactions** | Tap a card → stock detail / chart. Tap "Catalyst found" → catalyst detail / calendar event — PROPOSED — VERIFY IN REPO for the destination. |
| **Destination routes** | Stock detail page; catalyst/event detail (calendar) — VERIFY IN REPO. |
| **Authentication requirements** | Public to view. |
| **Loading state** | 3 skeleton cards. |
| **Empty state** | No significant movers (e.g. market closed, no data): show a neutral "No significant moves yet today" state — PROPOSED; do not show yesterday's movers as today's. |
| **Error state** | Movers feed fails: section shows inline error + retry, cards hidden. Catalyst lookup fails for a card: show "No catalyst linked yet" only if genuinely none is linked; if the lookup itself failed, show neither label — PROPOSED — VERIFY IN REPO. |
| **Delayed-data behaviour** | Same delayed/live flag as the shared quote object. Volume and % change carry the same as-of timestamp. |
| **Mobile behaviour** | 375px: third in stacking order. Cards stack 1-by-1 (not a horizontal scroll trap), full-width, no overflow. |
| **Dependencies** | Movers feed; catalyst-linkage service; shared quote object; Catalyst Calendar event feed. |
| **Potential new development requirements** | "Top 3 significant moves" selection rule (thresholds, session-aware) if not already defined — VERIFY IN REPO. Catalyst-linkage lookup if not already built — VERIFY IN REPO. |

---

## 4. MyAssets

| Field | Detail |
|---|---|
| **Component name** | `MyAssets` |
| **Purpose** | Authenticated user's own holdings / assets summary (CONFIRMED v21 placement: directly above the Calendar; Calendar top sits ~20px below My Assets). |
| **Required data** | User's assets: holdings, values, day change — from the user's existing portfolio/watchlist data. Exact fields — VERIFY IN REPO (existing Dashboard / portfolio data model). |
| **Expected existing Stocksist service** | Existing portfolio/assets service (Dashboard) — CONFIRMED in principle; whether a homepage-safe summary endpoint exists — VERIFY IN REPO. |
| **User interactions** | Tap an asset → stock detail / portfolio view. Tap to expand / manage — PROPOSED — VERIFY IN REPO. Guest interaction: see guest state (below). |
| **Destination routes** | Dashboard / portfolio page; stock detail — VERIFY IN REPO for exact paths. |
| **Authentication requirements** | Authenticated only for personal data. **Guest state (CONFIRMED pattern):** guests see a non-personal placeholder / sign-up prompt, never another user's data and never fabricated holdings. |
| **Loading state** | Skeleton rows until the user's assets resolve (authenticated only). |
| **Empty state** | Authenticated with no assets: "You haven't added any assets yet" + CTA to add/watch — PROPOSED. Guest: sign-up prompt, no fake numbers. |
| **Error state** | Assets fetch fails: inline error + retry; do not fall back to cached values presented as current without a timestamp. |
| **Delayed-data behaviour** | Asset values use the shared quote object (same delayed/live flag and as-of timestamp as elsewhere on the page). |
| **Mobile behaviour** | 375px: fourth in stacking order (after Moves, before Movers table). Full-width, no overflow. |
| **Dependencies** | Auth; portfolio/assets service; shared quote object. |
| **Potential new development requirements** | Homepage summary endpoint/view if the Dashboard portfolio cannot be reused directly — VERIFY IN REPO. Guest placeholder design — PROPOSED. |

---

## 5. HomepageTradingCalendar

| Field | Detail |
|---|---|
| **Component name** | `HomepageTradingCalendar` |
| **Purpose** | ONE tabbed calendar widget on the homepage: Catalyst / Earnings / Economic tabs. Catalyst tab shows "Today — Mon Nov 16" with 8 bulletins in the mockup (illustrative). This widget is the homepage front door to the full Catalyst Calendar v4 — it is not a second calendar engine. |
| **Required data** | Events for the selected day/tab from the shared event feed (see Deliverable 7): catalyst bulletins, earnings events, economic events; per event: title, symbol(s), time, impact, source. Shared quote data for event symbols. |
| **Expected existing Stocksist service** | Catalyst Calendar event feed — CONFIRMED as the v4 feed (658 catalysts, 37 high impact). Homepage widget consumes the same feed; whether a "today only / tab-filtered" query already exists — VERIFY IN REPO. |
| **User interactions** | Switch tabs (Catalyst / Earnings / Economic). Select a date (carries forward to the full calendar). Tap an event → event detail / full calendar at that date. Tap "View full calendar" → full Catalyst Calendar v4. Hover a symbol (desktop) → sparkline preview (SPCX pattern, see Deliverable 7). |
| **Destination routes** | Full Catalyst Calendar v4 page (Step 2) with the selected date/tab/filter carried forward in the URL/state — CONFIRMED requirement (see Deliverable 7). Event detail — VERIFY IN REPO. |
| **Authentication requirements** | Public to view the calendar. Personalised actions (Watchlist add, Journal entry) require auth/entitlement and preserve existing access controls (see Deliverable 7). |
| **Loading state** | Skeleton event rows per tab; tab switching shows skeleton, not the previous tab's events. |
| **Empty state** | No events for the selected day/tab: "No [catalysts/earnings/economic events] on this day" — PROPOSED; do not show another day's events. |
| **Error state** | Feed failure: inline error + retry per tab; widget hidden only if all tabs fail. Never show stale events as today's. |
| **Delayed-data behaviour** | Event times are scheduled times, not prices; any price shown beside an event uses the shared quote object with its delayed/live flag. |
| **Mobile behaviour** | 375px: sixth in stacking order (after Movers table, before tool cards). Tabs full-width and tappable; event rows stack; no overflow. Layout: Calendar top ~20px below My Assets, bottom flush with Movers bottom (desktop, CONFIRMED v21). |
| **Dependencies** | Shared event feed (Deliverable 7); shared quote object; full-calendar page (Step 2); Watchlist/Journal services for personalised actions. |
| **Potential new development requirements** | "Today + tab" feed query if not already available — VERIFY IN REPO. Date/tab carry-forward to the full calendar — CONFIRMED requirement, implementation VERIFY IN REPO. **Do NOT create two independent calendar engines** — one shared feed, one shared taxonomy. |

---

## 6. MarketMovers

| Field | Detail |
|---|---|
| **Component name** | `MarketMovers` |
| **Purpose** | Market Movers table: 10 rows per tab (CONFIRMED v21). Tabs — VERIFY IN REPO for the exact tab set (e.g. Gainers / Losers / Most Active — PROPOSED, not confirmed by the mockup). |
| **Required data** | Per row: symbol, company name, price, change, % change, volume, as-of timestamp, delayed/live flag — all from the shared quote object. 10 rows per tab. |
| **Expected existing Stocksist service** | Existing Market Movers service — CONFIRMED (Market Movers is an existing Stocksist tool). Exact endpoint, tab definitions, and row limit — VERIFY IN REPO. |
| **User interactions** | Switch tabs. Tap a row → stock detail / chart. Sort — PROPOSED — VERIFY IN REPO whether sorting exists. |
| **Destination routes** | Stock detail page; "View all movers" → full Market Movers tool page — VERIFY IN REPO. |
| **Authentication requirements** | Public to view. |
| **Loading state** | Skeleton table (10 rows). Tab switch shows skeleton, not stale rows from the previous tab. |
| **Empty state** | No movers for a tab (e.g. pre-market with no data): neutral empty message per tab — PROPOSED. |
| **Error state** | Feed failure: inline error + retry; table hidden. Never show a previous session's movers as current. |
| **Delayed-data behaviour** | Delayed/live flag and as-of timestamp shown consistently with the rest of the page; same quote object as Moves and My Assets. |
| **Mobile behaviour** | 375px: fifth in stacking order (after My Assets, before Calendar). Table must reflow/scroll internally without causing page-level horizontal overflow; key columns (symbol, % change) always visible. |
| **Dependencies** | Movers feed; shared quote object. |
| **Potential new development requirements** | None expected if the existing Movers tool is reused — VERIFY IN REPO. Tab definitions if they differ from the existing tool — confirm with Tony. |

---

## 7. FeatureGrid

| Field | Detail |
|---|---|
| **Component name** | `FeatureGrid` |
| **Purpose** | 6 tool cards linking to Stocksist's core tools (CONFIRMED v21): Watchlist, Stock Screener, Market Movers, Calendars, Trending, Stocksist Pro. Plus the quiet Pro tile (CONFIRMED v21 — quiet, not a hard sell). |
| **Required data** | Card titles, descriptions, icons (static, CONFIRMED). Optional live counts/badges per card — PROPOSED — VERIFY IN REPO whether any card shows live data. |
| **Expected existing Stocksist service** | Each card links to an existing tool/route — CONFIRMED in principle; verify each route exists in the repo (VERIFY IN REPO per card). |
| **User interactions** | Tap a card → its tool page. Stocksist Pro card → Pro page / pricing — VERIFY IN REPO. |
| **Destination routes** | Watchlist → Watchlist page; Stock Screener → Screener; Market Movers → Movers tool; Calendars → Catalyst Calendar v4 (Step 2); Trending → Trending page; Stocksist Pro → Pro page. Exact paths — VERIFY IN REPO. |
| **Authentication requirements** | Public to view cards. Individual tools preserve their existing auth/entitlement rules (e.g. Pro-gated features stay Pro-gated; do not use the homepage to bypass them). |
| **Loading state** | Static cards render immediately; no loading state needed unless a card shows live data. |
| **Empty state** | Not applicable (static navigation). |
| **Error state** | Not applicable (static navigation); if a card's live badge fails, hide the badge only. |
| **Delayed-data behaviour** | Not applicable unless a card shows prices — if it does, shared quote object rules apply. |
| **Mobile behaviour** | 375px: seventh in stacking order (after Calendar, before news). Cards stack in a single column or 2-col grid per the mobile mockup; no overflow. |
| **Dependencies** | Routing only; auth/entitlement checks on destination tools. |
| **Potential new development requirements** | None expected — reuse existing routes. If any of the 6 destinations does not exist, that is new work — VERIFY IN REPO and confirm with Tony before building. |

---

## 8. MarketNews

| Field | Detail |
|---|---|
| **Component name** | `MarketNews` |
| **Purpose** | Market News section: hero story + Google 2-column layout (CONFIRMED v21). |
| **Required data** | Hero story (title, source, time, image, summary) + list stories in Google 2-col layout. All from the existing news wire feed — CONFIRMED in principle; exact feed and fields — VERIFY IN REPO. |
| **Expected existing Stocksist service** | Existing news service (news wires) — CONFIRMED. Hero-story selection rule — PROPOSED — VERIFY IN REPO. |
| **User interactions** | Tap a story → article page / external source (per existing behaviour — VERIFY IN REPO). "View more news" → news page — VERIFY IN REPO. |
| **Destination routes** | Article page / source link; news listing page — VERIFY IN REPO. |
| **Authentication requirements** | Public. |
| **Loading state** | Skeleton hero + skeleton list rows. |
| **Empty state** | No news returned: hide the section or show a neutral "No news right now" — PROPOSED; never show mockup stories as real news. |
| **Error state** | Feed failure: section hidden with inline retry — PROPOSED; never show stale-dated stories as current. |
| **Delayed-data behaviour** | News timestamps are publication times; show them as published. Any price shown beside a story uses the shared quote object. |
| **Mobile behaviour** | 375px: eighth in stacking order (after tool cards, before IPOs). Hero stacks above the 2-col list, which becomes a single column; images scale, no overflow. |
| **Dependencies** | News wire feed; routing. |
| **Potential new development requirements** | Hero-story selection rule if not already defined — VERIFY IN REPO. |

---

## 9. TrendingNow

| Field | Detail |
|---|---|
| **Component name** | `TrendingNow` |
| **Purpose** | Trending Now section: trending tickers/topics (CONFIRMED v21). Distinct from the hero trending chips — verify whether these are the same source or two views of one source. |
| **Required data** | Trending items: symbol/topic, change, volume/mentions — VERIFY IN REPO for the exact source and fields. |
| **Expected existing Stocksist service** | Trending service — PROPOSED — VERIFY IN REPO whether an existing trending feed exists, or whether this reuses the hero trending source. |
| **User interactions** | Tap an item → stock detail / topic page — VERIFY IN REPO. |
| **Destination routes** | Stock detail / trending topic page — VERIFY IN REPO. |
| **Authentication requirements** | Public. |
| **Loading state** | Skeleton rows/chips. |
| **Empty state** | No trending items: hide the section — PROPOSED; do not show stale trending items. |
| **Error state** | Feed failure: section hidden — PROPOSED. |
| **Delayed-data behaviour** | Any price shown uses the shared quote object with its delayed/live flag. |
| **Mobile behaviour** | 375px: part of the news/IPOs flow in the stacking order (after Market News, before/around IPOs per the mobile mockup — confirm exact order against the v21 mobile mockup at build time). No overflow. |
| **Dependencies** | Trending feed; shared quote object. |
| **Potential new development requirements** | Trending feed if none exists — VERIFY IN REPO first. Deduplication rule if hero chips and TrendingNow share a source — PROPOSED. |

---

## 10. AdvertisementSlot

| Field | Detail |
|---|---|
| **Component name** | `AdvertisementSlot` |
| **Purpose** | Reserved ad placement, 336×280 (CONFIRMED v21). Placeholder only. |
| **Required data** | None (no live data). Slot dimensions 336×280. |
| **Expected existing Stocksist service** | None. No ad service is to be connected in this build. |
| **User interactions** | None in this build. (If a placeholder is shown, it is non-interactive.) |
| **Destination routes** | None. |
| **Authentication requirements** | None. |
| **Loading state** | None — placeholder renders as a static reserved block. |
| **Empty state** | The placeholder itself is the state: a neutral reserved block, clearly not a real ad. |
| **Error state** | Not applicable — no ad call is made, so no ad failure can occur. |
| **Delayed-data behaviour** | Not applicable. |
| **Mobile behaviour** | 375px: within the news/IPOs flow per the mobile mockup; 336×280 must fit without causing horizontal overflow (scale/centre on narrow screens — confirm against the v21 mobile mockup). |
| **Dependencies** | None. |
| **Potential new development requirements** | **None in this build. Do NOT activate ads.** Ad activation is a separate owner decision and is explicitly out of scope. |

---

## 11. IpoOverview

| Field | Detail |
|---|---|
| **Component name** | `IpoOverview` ("IPOs") |
| **Purpose** | IPOs section (CONFIRMED v21): upcoming / recent IPOs. |
| **Required data** | Per IPO: company, symbol (if listed), expected date, price range, status — from the existing IPO data source. Exact fields — VERIFY IN REPO. |
| **Expected existing Stocksist service** | Existing IPO data — CONFIRMED in principle (IPOs already appear on Stocksist); exact endpoint — VERIFY IN REPO. |
| **User interactions** | Tap an IPO → IPO detail / stock detail (if listed) — VERIFY IN REPO. |
| **Destination routes** | IPO detail / stock detail — VERIFY IN REPO. |
| **Authentication requirements** | Public. |
| **Loading state** | Skeleton rows. |
| **Empty state** | No upcoming IPOs: "No upcoming IPOs scheduled" — PROPOSED; do not show past IPOs as upcoming. |
| **Error state** | Feed failure: section hidden with inline retry — PROPOSED. |
| **Delayed-data behaviour** | IPO dates/prices are scheduled/expected values, not live quotes; label them as expected/scheduled. Any live price for a listed IPO uses the shared quote object. |
| **Mobile behaviour** | 375px: last in the stacking order (after news). Full-width rows, no overflow. |
| **Dependencies** | IPO feed. |
| **Potential new development requirements** | None expected if the existing IPO source is reused — VERIFY IN REPO. |

---

## 12. HomepageFooter

| Field | Detail |
|---|---|
| **Component name** | `HomepageFooter` |
| **Purpose** | Footer (CONFIRMED v21): navigation, legal, social, and disclosure links. Hidden clocks: the footer area contains hidden clock elements in the mockup — these are NOT to be rendered visibly (CONFIRMED v21 note). |
| **Required data** | Link lists (static, CONFIRMED as structure; exact links — VERIFY IN REPO against the existing site footer). Disclaimers / disclosure copy — VERIFY IN REPO for the current approved wording; do not invent legal copy. |
| **Expected existing Stocksist service** | Existing site footer content — CONFIRMED in principle; reuse, do not rewrite. |
| **User interactions** | Tap links → their destinations. Language toggle (EN\|ES) if present in footer as well as top nav — VERIFY IN REPO. |
| **Destination routes** | Per existing footer links — VERIFY IN REPO. |
| **Authentication requirements** | Public. |
| **Loading state** | Static; renders immediately. |
| **Empty state** | Not applicable. |
| **Error state** | Not applicable. |
| **Delayed-data behaviour** | Not applicable. **Hidden clocks must stay hidden** — do not surface them as visible clocks. |
| **Mobile behaviour** | 375px: footer stacks; link groups collapse/stack per the mobile mockup; no overflow. |
| **Dependencies** | Routing; existing footer content. |
| **Potential new development requirements** | None expected — reuse the existing footer. If footer links differ from the rest of the site, align them — confirm with Tony. |

---

## Cross-component dependency summary

| Dependency | Used by |
|---|---|
| Shared quote object (one per security) | StockIndexes, SignificantMarketMoves, MyAssets, HomepageTradingCalendar, MarketMovers, TrendingNow |
| Market-status / session service | HomepageHero (session pill, countdown) |
| Search/autocomplete service | HomepageHero — VERIFY IN REPO |
| Movers feed | SignificantMarketMoves, MarketMovers |
| Catalyst Calendar shared event feed | SignificantMarketMoves ("Catalyst found"), HomepageTradingCalendar |
| News wire feed | MarketNews |
| Trending feed | HomepageHero, TrendingNow — VERIFY IN REPO whether one source or two |
| IPO feed | IpoOverview |
| Portfolio/assets service | MyAssets |
| Auth + entitlements | HomepageHero, MyAssets, HomepageTradingCalendar (personalised actions), FeatureGrid destinations |
| Cached AI (no per-visitor paid calls) | Market Pulse / AI Analyst voice via the calendar (see Deliverable 7) |
| Routing | All components |

## Build order (per Tony's gating)

1. **Step 1 — Homepage:** build the 12 components above from `src/pages/Index.tsx` + `src/components/home/`, preview, Tony approves.
2. **Step 2 — Calendar:** build Catalyst Calendar v4 (see Deliverable 7) only after Step 1 approval.
3. **Verify in repo first:** every item marked **VERIFY IN REPO** must be confirmed against `Holagpt-ai/hedgefun-insights` `main` before it is built — do not build on assumption.
