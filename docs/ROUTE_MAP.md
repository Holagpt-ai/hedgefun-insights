# Route map

Routes are declared in `src/App.tsx`. Navigation targets checked by `npm run integrity` are the public sidebar, footer, mobile tabs, header account menu, dashboard sidebar, Action Center cards, and `src/journal/nav.ts`.

Dynamic segments (`:ticker`, `:slug`, `:symbol`, `:type`, journal ids) are real routes. A one-segment ticker under `/stocks/` is not used for reserved words in `seo-boundaries.ts` (`compare`, `lists`, `analysts`, `exchanges`, `industry`, `top-stocks`, `corporate-actions`).

## Public

| Path | Page |
| --- | --- |
| `/` | Home |
| `/stocks`, `/stocks/:ticker` | Stock list, stock detail |
| `/stocks/exchanges`, `/stocks/compare`, `/stocks/industry`, `/stocks/lists`, `/stocks/lists/:slug` | Stock research |
| `/stocks/analysts`, `/stocks/analysts/:slug`, `/stocks/top-stocks`, `/stocks/corporate-actions` | Analysts, lists, actions |
| `/screener` | Public screener |
| `/movers`, `/movers/:type` | Movers |
| `/markets/gainers`, `/markets/losers`, `/markets/active`, `/markets/premarket`, `/markets/after-hours`, `/markets/heatmap` | Market boards |
| `/ipos`, `/ipos/recent`, `/ipos/calendar`, `/ipos/upcoming`, `/ipos/statistics`, `/ipos/news`, `/ipos/screener`, `/ipos/spac` | IPO section |
| `/earnings` | Earnings |
| `/news` | News |
| `/trending` | Trending |
| `/articles`, `/articles/:slug` | Articles |
| `/etfs`, `/etfs/:symbol`, `/etfs/screener`, `/etfs/top` | ETF section |
| `/etf/:symbol`, `/etf/compare`, `/etf/list/new`, `/etf/provider` | ETF detail and tools |
| `/etf/screener` | Redirect to `/etfs/screener` |
| `/etfs/compare` | Stub comparison page |
| `/chart`, `/chart/:ticker` | Chart landing and standalone chart |
| `/tools`, `/tools/cagr-calculator`, `/tools/dividend-calculator`, `/tools/symbol-lookup` | Tools |
| `/dividends`, `/splits` | Corporate actions |
| `/pro` | Pro |
| `/watchlist` | Public watchlist shell |
| `/newsletter`, `/unsubscribe` | Newsletter |
| `/login`, `/signup` | Auth |
| `/register`, `/sign-up` | Redirect to `/signup` |
| `/reset-password` | Password reset |
| `/about`, `/contact`, `/faq`, `/methodology`, `/advertise`, `/download` | Company |
| `/terms`, `/privacy`, `/disclaimer`, `/affiliates`, `/sitemap` | Legal and map |
| `/privacy-policy` | Redirect to `/privacy` |
| `/terms-of-service`, `/terms-and-conditions` | Redirect to `/terms` |
| `/support` | Support (smart layout) |
| `/.lovable/oauth/consent` | Lovable OAuth consent |

## Dashboard

| Path | Page |
| --- | --- |
| `/dashboard` | Home |
| `/dashboard/pre-market` | Pre-market inbox |
| `/dashboard/after-hours` | After-hours inbox |
| `/dashboard/am`, `/dashboard/pm` | Redirects to the inbox paths above |
| `/dashboard/screeners` | Scanner / Radar workspace |
| `/dashboard/catalyst` | Catalyst |
| `/dashboard/watchlist` | Watchlist |
| `/dashboard/ai` | AI Analyst |
| `/dashboard/action-center` | Action Center |
| `/dashboard/journal` and nested journal paths | Trading journal |
| `/dashboard/alerts` | Price alerts |
| `/dashboard/news` | Dashboard news |
| `/dashboard/community` | Community waitlist |
| `/dashboard/ai-trader` | AI Trader (operating mode OFF) |
| `/dashboard/game` | Redirect to `/dashboard/ai-trader` |

Journal children under `/dashboard/journal`: `onboarding`, `calendar`, `daily-review`, `daily-review/:date`, `trades`, `trades/new`, `trades/:tradeId`, `notebook`, `notebook/new`, `notebook/:entryId`, `playbooks`, `playbooks/:playbookId`, `reports`, `reports/new`, `reports/:reportId`, `reports/:reportId/schedule`, `analytics`, `analytics/:analysisId`, `coach`, `settings`.

`/journal` redirects into the dashboard journal.

## Account and admin

| Path | Page |
| --- | --- |
| `/account`, `/account/billing` | Account and billing |
| `/admin` | Admin home |
| `/admin/users`, `/admin/subscriptions`, `/admin/analytics`, `/admin/news`, `/admin/market`, `/admin/seo`, `/admin/alerts`, `/admin/settings` | Admin sections |

Unknown paths render `NotFound`.

## Sitemap

The indexable main-page list is duplicated on purpose:

- Edge: `supabase/functions/_shared/seo/sitemap-main-pages.ts`
- App: `STATIC_SITEMAP_PATHS` in `src/config/seo.ts`

`npm run integrity` fails if those lists diverge or if a listed path is not a route. Public routes left off the sitemap are reported as info, not failures. On 2026-10-24 that info list had 27 paths (utility pages, redirects, ETF aliases, and `/support`). `/etfs/screener` is the sitemap URL; `/etf/screener` only redirects.

Dashboard, admin, account, auth, journal, and watchlist prefixes are noindex via `seo-boundaries.ts` and `vercel.json` headers.
