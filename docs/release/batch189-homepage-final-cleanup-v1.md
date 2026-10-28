# Batch 189 — Homepage Final Cleanup & Mobile Presentation V1

**Issues:** ISS-029, HOME-01 through HOME-03  
**Base:** `main` **`dc965d2d`** (PR **#191** Batch 188 merged)

## Scope

Homepage-only corrections: remove AI Trader promo, fix seven market clocks order and mobile scroll affordance, separate ET wall clock from session countdown on movers provenance, compact Market Pulse no-catalyst copy. No redesign, no new modules, no Edge/migrations.

## Workstreams

| # | Change |
| --- | --- |
| 1 | `Index.tsx` — remove `AiTraderLivePreview`; AI Trader route/product unchanged |
| 2 | `GlobalMarketClocks.tsx` — fixed seven exchanges (NY first); local-time card last; mobile scroll hint |
| 3 | `formatHomepageMarketSessionLine()` in `price-utils.ts`; movers provenance uses it; stock header line unchanged |
| 4 | `MarketPulse.tsx` + `market-pulse-catalyst.ts` — per-row neutral line; section-level unexplained disclosure once |

## Production dependencies

| Surface | Required |
| --- | --- |
| **Vercel** | Yes — public homepage |
| **Edge / Supabase** | No |

Batch **187** Edge activation remains **separately gated**. Batch **186** authenticated AM Inbox and Batch **188** authenticated Android Journal acceptance **pending**.

## Verification

```sh
npx vitest run src/lib/__tests__/batch189-homepage-cleanup.test.ts
npx vitest run src/lib/markets/__tests__/batch22-market-pulse.test.ts
npx vitest run src/components/home/__tests__/GlobalMarketClocks.status.test.ts
npm run typecheck
npm run build
```

Vercel preview + narrow/mobile visual check: **NOT VERIFIED** in Cursor unless PR checks report SUCCESS.

## Continuity facts (2026-10-27)

- PR **#191** merged at **`dc965d2d`** — Batch 188 implementation complete; authenticated Android acceptance **pending**.
- PR **#190** Batch 187 merged at **`d86e0c69`**; Edge deploy sequence **NOT APPLIED**.
- PR **#189** Batch 186 merged at **`d3cec11f`**; AM Inbox UI **NOT VERIFIED**.
