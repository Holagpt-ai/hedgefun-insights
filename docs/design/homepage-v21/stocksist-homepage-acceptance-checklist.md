# Stocksist Homepage — Acceptance Checklist

**Deliverable 6 of the Stocksist FINAL Handoff Package**
**Source of truth — LATEST ONLY:** Homepage **v21** (approved 2026-11-18, Tony: "looks good") and **Catalyst Calendar v4** (Tony: "go", 2026-11-19).
**Scope:** Step 1 = homepage first, preview-approved, then Step 2 = calendar.
**How to use:** Check an item only when verified against the live preview (desktop + mobile tap-test by Tony). "Verified" means seen working in the preview, not assumed from code. Items marked **[OWNER DECISION]** need Tony's explicit call before the build is signed off.

---

## 1. Visual fidelity (vs v21 mockup)

- [ ] Headline reads exactly "Stock Market Intelligence for Every Investor"
- [ ] Hero search present with trending chips NVDA / MSFT / PLTR / HIMS (production trending source confirmed — mockup tickers are illustrative, not hard-coded)
- [ ] "Start with the basics" link present in hero
- [ ] Hero "Create free account" CTA present
- [ ] Top nav: EN|ES toggle present and working
- [ ] Top nav: moon dark/light toggle present and working
- [ ] Top nav: Log In present
- [ ] Top nav: blue Sign Up present
- [ ] Top nav: NO "Create free account" in the top nav (hero only)
- [ ] After-hours pill present and showing the correct session state
- [ ] Nav is Home-only with a small PRO badge on Dashboard (no extra nav items added)
- [ ] Quiet Pro tile present (quiet, not a hard-sell banner)
- [ ] Moves: exactly 3 cards, each with volume shown
- [ ] Moves cards show "Catalyst found" / "No catalyst linked yet" correctly per card
- [ ] Index carousel: exactly 10 indexes across exactly 2 pages
- [ ] ONE tabbed Calendar only (Catalyst / Earnings / Economic) — no second calendar widget on the page
- [ ] Calendar top sits ~20px below My Assets (desktop)
- [ ] Calendar bottom is flush with Movers bottom (desktop)
- [ ] Catalyst tab "Today — Mon Nov 16" shows 8 bulletins in the mockup; production shows the real count for today (mockup count is illustrative)
- [ ] Market Movers: 10 rows per tab
- [ ] 6 tool cards present: Watchlist, Stock Screener, Market Movers, Calendars, Trending, Stocksist Pro
- [ ] Market News: hero story + Google 2-col layout
- [ ] Trending Now section present
- [ ] Ad slot present as a 336×280 reserved placeholder only (no real ad)
- [ ] IPOs section present
- [ ] Footer present; hidden clocks remain hidden (not rendered visibly)
- [ ] Overall look matches v21 (premium WHITE, Stocksist blue) — Tony's visual QA on his phone is the final grade

## 2. Responsive behaviour

- [ ] 375px: stacking order is hero search → index carousel (swipe) → Moves 1-by-1 → My Assets → Movers table → Calendar → tool cards → news → IPOs
- [ ] 375px: no horizontal overflow anywhere on the page
- [ ] 390px: no horizontal overflow anywhere on the page
- [ ] 768px: layout adapts cleanly, no horizontal overflow, no clipped text
- [ ] 1024px: layout adapts cleanly, no horizontal overflow, no clipped text
- [ ] 1440px: layout adapts cleanly, no horizontal overflow, no clipped text
- [ ] 1920px: layout adapts cleanly, no horizontal overflow, no clipped text
- [ ] Index carousel swipes on mobile (375px/390px) and pages correctly on desktop
- [ ] Moves cards stack 1-by-1 on mobile (not a horizontal scroll trap)
- [ ] Movers table reflows on mobile without causing page-level horizontal overflow
- [ ] Calendar tabs are full-width and tappable on mobile
- [ ] Tool cards stack cleanly on mobile
- [ ] News hero stacks above the list on mobile; list becomes single-column
- [ ] 336×280 ad placeholder fits without overflow on 375px
- [ ] Footer stacks cleanly on mobile
- [ ] No text clipped at any tested width except the known Nasdaq 100 / Russell 2000 item below

## 3. Functional navigation

- [ ] Every top-nav item navigates to the correct destination
- [ ] Dashboard link carries the small PRO badge and goes to Dashboard
- [ ] Every tool card navigates to its correct tool (Watchlist, Screener, Movers, Calendars, Trending, Pro)
- [ ] Every Moves card navigates to the correct stock detail
- [ ] Every Movers row navigates to the correct stock detail
- [ ] Every index navigates to the correct index detail/chart
- [ ] Every news story navigates to the correct article/source
- [ ] Every IPO navigates to the correct detail
- [ ] Every footer link navigates to the correct destination
- [ ] "View full calendar" navigates to the full Catalyst Calendar v4 with date/tab/filter carried forward
- [ ] No dead links anywhere on the homepage
- [ ] No link navigates to a mockup, placeholder, or wrong page
- [ ] Back-button behaviour works from every destination back to the homepage

## 4. Search

- [ ] Hero search accepts a ticker or company name
- [ ] Search suggestions appear as the user types
- [ ] Selecting a suggestion navigates to the correct stock detail
- [ ] Search with no matches shows a clear "no results" state (no crash, no stale results)
- [ ] Search works on mobile (375px) with the on-screen keyboard
- [ ] Search does not call Massive/Polygon directly from the frontend
- [ ] Trending chips (NVDA/MSFT/PLTR/HIMS or the production trending set) each navigate correctly

## 5. Market-session accuracy

- [ ] Pre-market: session pill shows pre-market, prices flagged accordingly
- [ ] Regular session: session pill shows regular/market open
- [ ] After-hours: session pill shows after-hours (as in v21)
- [ ] Market closed: session pill shows closed (not a stale session)
- [ ] Weekends: session shows closed; no intraday data presented as today's
- [ ] Holidays: session shows closed on a market holiday
- [ ] Early close: session and countdown reflect the early close (not the normal close)
- [ ] Countdown to next session change is accurate (open / close / pre-market / after-hours)
- [ ] Countdown updates without a page refresh
- [ ] Session state is consistent across the hero pill, Moves, Movers, and indexes (one session source, not per-component guesses)

## 6. Live vs delayed data transparency

- [ ] Every price on the page carries a delayed/live indicator consistent with the shared quote object
- [ ] Every price carries an as-of timestamp (or the section carries one timestamp covering its prices)
- [ ] Delayed data is never presented as live
- [ ] Stale data is never presented as current (no previous-session values shown as today's)
- [ ] **[OWNER DECISION]** Delayed-data disclosure decision: Tony decides the exact disclosure wording/placement — do NOT silently remove delayed-data labelling. Record Tony's decision here before sign-off: _______________
- [ ] One quote object per security: the same ticker shows the same price/%/volume in Hero, Moves, My Assets, Movers, Calendar, and TrendingNow
- [ ] Frontend makes no direct Massive/Polygon calls (verify in repo / network check)
- [ ] No hard-coded mockup numbers in production (TTD +13.79% / AVGO +13.67% / ABR −20.50% and all other mockup values must be live/delayed data or the empty state — verify none remain)

## 7. Market Pulse

- [ ] Market Pulse section present (if in v21 scope — confirm against the v21 mockup at build time)
- [ ] Market Pulse text is cached AI output, not a live paid AI call per visitor/refresh
- [ ] Market Pulse shows a timestamp / as-of for its AI summary
- [ ] Market Pulse falls back gracefully when no cached AI output exists (no error, no fabricated summary)
- [ ] Market Pulse content is accurate to the market data it summarises (spot-check against live data)

## 8. Market Movers

- [ ] 10 rows per tab, exactly
- [ ] Tab switching shows the correct tab's rows (no stale rows from the previous tab)
- [ ] Every row's price/change/volume matches the shared quote object
- [ ] Loading state shows skeletons, not old data
- [ ] Empty state (no movers for a tab) is neutral and correct
- [ ] Error state (feed failure) shows inline error + retry, not stale movers
- [ ] Moves (3 cards) and Market Movers (table) agree with each other for any shared ticker

## 9. My Assets

- [ ] Authenticated user sees their own assets (values match Dashboard/portfolio)
- [ ] Guest sees a non-personal placeholder / sign-up prompt — never another user's data, never fabricated holdings
- [ ] Authenticated user with no assets sees a correct empty state + add/watch CTA
- [ ] Asset values match the shared quote object (same delayed/live flag and timestamp)
- [ ] Assets fetch failure shows inline error + retry (no cached values presented as current without a timestamp)
- [ ] My Assets sits directly above the Calendar with ~20px gap (desktop)

## 10. Calendar integration

- [ ] ONE tabbed Calendar on the homepage (Catalyst / Earnings / Economic)
- [ ] Tab switching shows the correct tab's events (no stale events from the previous tab)
- [ ] Catalyst tab shows today's bulletins (mockup: 8 on Mon Nov 16 — production shows the real count)
- [ ] Date selection works and carries forward when opening the full calendar
- [ ] Tab/filter selection carries forward when opening the full calendar
- [ ] Event tap navigates to event detail / full calendar at that date
- [ ] Calendar is publicly accessible (guests can view events)
- [ ] Personalised actions (Watchlist add, Journal entry) require auth and preserve existing access controls
- [ ] Calendar does NOT contain Kalshi / prediction-market content (see §19)
- [ ] Calendar does NOT create a second, independent calendar engine (one shared feed — see Deliverable 7)
- [ ] Homepage Step 1 is approved before calendar Step 2 is built

## 11. News

- [ ] Hero story displays correctly (title, source, time, image, summary)
- [ ] Google 2-col list displays correctly on desktop, single-column on mobile
- [ ] All stories are real feed items with correct timestamps (no mockup stories in production)
- [ ] Story links go to the correct article/source
- [ ] Empty state (no news) is neutral; error state shows retry, not stale stories
- [ ] No story is shown with a wrong or missing date

## 12. Trending

- [ ] Trending Now items are real (from the production trending source)
- [ ] Every TrendingNow item navigates correctly
- [ ] TrendingNow and hero trending chips do not contradict each other for a shared ticker (same quote object)
- [ ] Empty/error states hide the section cleanly (no stale trending items)

## 13. IPOs

- [ ] IPO entries are real (from the production IPO source) with correct expected dates
- [ ] Past IPOs are not shown as upcoming
- [ ] Expected price ranges are labelled as expected/scheduled, not live prices
- [ ] IPO links navigate correctly
- [ ] Empty state ("No upcoming IPOs scheduled") is correct when there are none

## 14. Authentication

- [ ] Log In works from the top nav
- [ ] Blue Sign Up works from the top nav
- [ ] Hero "Create free account" works
- [ ] Authenticated state is reflected correctly (no sign-up CTA shown to a signed-in user where v21 says otherwise — confirm against v21)
- [ ] Guest cannot reach authenticated-only data (My Assets personal data, Watchlist/Journal actions) without signing in
- [ ] Sign-in/sign-up does not break the homepage layout or session pill
- [ ] EN|ES toggle works and persists as expected
- [ ] Dark/light (moon) toggle works and persists as expected

## 15. Watchlist integration

- [ ] Watchlist tool card navigates to the Watchlist
- [ ] Adding a ticker to the Watchlist from the homepage (if offered) works and is reflected in the Watchlist
- [ ] Watchlist actions require auth (guests are prompted, not silently failed)
- [ ] Watchlist data shown anywhere on the homepage matches the Dashboard Watchlist (same quote object)
- [ ] Removing/adding from the homepage does not corrupt the existing Watchlist

## 16. AI integration

- [ ] No paid AI request is triggered per visitor or per page refresh (cached AI only — verify)
- [ ] AI Analyst voice (calendar) follows the SPCX pattern: catalyst first, prev close vs current vs VWAP, key levels, timestamped, WAIT / LONG BIAS / AVOID / NO TRADE (see Deliverable 7)
- [ ] AI output is never fabricated: no invented catalysts, drivers, or numbers
- [ ] AI fallback states are correct when cached AI output is unavailable
- [ ] **No AI Trader reopen:** no "AI Trader" feature appears anywhere on the homepage or calendar

## 17. SEO

- [ ] Page title and meta description are correct for the homepage
- [ ] Headline "Stock Market Intelligence for Every Investor" is a proper heading (not an image or div-only text)
- [ ] Content is server-rendered / crawlable (no empty shell for crawlers — confirm per the Vite/Vercel setup)
- [ ] Canonical URL is correct
- [ ] Open Graph / social tags are present and correct
- [ ] No mockup/placeholder text is indexed

## 18. Accessibility

- [ ] All interactive elements are keyboard-reachable and focus-visible
- [ ] Tabs (Calendar, Movers) are keyboard-operable with correct ARIA roles
- [ ] Search box has a proper label
- [ ] Colour contrast meets standard for text, including % changes and session pill
- [ ] Dark/light toggle preserves contrast in both themes
- [ ] Images have alt text; decorative images are hidden from assistive tech
- [ ] No content relies on colour alone (e.g. gains/losses also have +/- signs)

## 19. Performance

- [ ] Homepage loads fast on mobile (375px) — measure and record: _______________
- [ ] No per-visitor paid AI calls (see §16)
- [ ] Market data is fetched via the backend, not per-component direct calls
- [ ] Images are appropriately sized (no oversized hero/news images)
- [ ] No render-blocking or layout-shift issues on load (hero, carousel, calendar stable)
- [ ] Page works acceptably on a low-end phone (per Tony's mobile-first bar)

## 20. Data consistency

- [ ] Same ticker = same price everywhere on the page (one quote object per security)
- [ ] Same ticker = same % change and volume everywhere on the page
- [ ] Index values agree between the carousel and any other index display
- [ ] News timestamps agree with the feed; no story shown with another story's date
- [ ] Calendar event dates agree between the homepage widget and the full calendar (see Deliverable 7)
- [ ] No number on the page is hard-coded from the mockup (spot-check TTD/AVGO/ABR, index values, news items, IPO entries)

## 21. Existing functionality preservation

- [ ] No existing Stocksist route is broken by the homepage rebuild
- [ ] Dashboard still works (including the existing Dashboard Trading Journal)
- [ ] Watchlist still works as before
- [ ] Stock Screener still works as before
- [ ] Market Movers tool still works as before
- [ ] Existing footer links and legal/disclosure copy are unchanged (or changed only with Tony's approval)
- [ ] No existing auth/entitlement rule is bypassed by the homepage (Pro-gated features stay Pro-gated)
- [ ] GitHub `main` remains authoritative; the build is deployed from the repo, not from a detached copy
- [ ] Entry point is `src/pages/Index.tsx`, components in `src/components/home/` (confirm in repo)

## 22. Production safety

- [ ] No mockup data, placeholder text, or lorem ipsum in production
- [ ] No real ads activated (Ad slot is a placeholder only)
- [ ] **No Kalshi:** no Kalshi / prediction-market integration anywhere on the homepage or calendar — verify by search in repo and in the live preview
- [ ] **No AI Trader reopen:** no AI Trader feature anywhere — verify by search in repo and in the live preview
- [ ] No credentials, API keys, or secrets in the frontend code or repo
- [ ] No direct Massive/Polygon calls from the frontend
- [ ] Preview is approved by Tony before publish (Step 1 gate)
- [ ] Rollback plan exists if the publish breaks the live homepage: _______________

## 23. Known conflicts / open items (must be resolved or explicitly deferred by Tony)

- [ ] **[OWNER DECISION]** Delayed-data disclosure: Tony's decision recorded (§6) — do not silently remove delayed-data labelling
- [ ] **[DEFERRED — TONY'S SAY-SO ONLY]** Nasdaq 100 / Russell 2000 names clipped 3–9px in the index carousel (since v14): fix only when Tony says so. Status: _______________
- [ ] No hard-coded mockup numbers in production (see §6, §20)
- [ ] No Kalshi (see §10, §22)
- [ ] No AI Trader reopen (see §16, §22)
- [ ] No ad activation (see §1, §22)
- [ ] Mobile tap-test by Tony on v21 desktop + mobile mockup: completed / pending — Status: _______________
- [ ] Mobile audit was at 390px, not 375px; swipe not touch-tested; Movers Change column partly cut at first view — re-check all three at sign-off

---

## Sign-off

| Role | Name | Date | Signature / confirmation |
|---|---|---|---|
| Owner | Tony | | |
| Builder | | | |

**Sign-off requires:** all checked items verified in the live preview, all **[OWNER DECISION]** items decided by Tony, and the Step 1 (homepage) gate passed before any Step 2 (calendar) build begins.
