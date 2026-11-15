# Batch 202 — Public website & launch readiness (Group 4)

**Issues:** **ISS-038** (primary), launch matrix (**Batch 202**)  
**Base:** GitHub `main` **`87759b67f1a0a3fe944d628b7011132afe45f3e2`**  
**Scope:** Public marketing copy, homepage positioning, conversion telemetry, mobile grid overflow guard. **No** redesign, **no** overnight/Penny/AI Trader/billing, **no** scanner/Radar worker changes.

## Changes

| Area | Fix |
| --- | --- |
| **ISS-038** | `public-market-copy.ts`; hero i18n; FAQ/Download/About/Methodology; stock list CTAs; ETF SEO; chart SEO title; index sparkline **Regular** (not **Live**) |
| **23×5 positioning** | `PUBLIC_EXTENDED_HOURS_POSITIONING` on homepage — premarket/RTH/AH; **overnight scanning not active** |
| **Conversion** | `trackAuthHandoff` on header/footer Sign Up & Log In (ToolGrid unchanged) |
| **Mobile** | `min-w-0` on homepage dual-column grids (gainers/losers, IPO tables) |
| **Preserved** | Market Pulse, clocks, movers provenance, Batch **189** architecture |

## Verification (local)

```sh
npm run typecheck
npm run test -- src/lib/__tests__/batch202-public-launch-readiness.test.ts src/lib/__tests__/batch189-homepage-cleanup.test.ts src/config/__tests__/seo.test.ts src/lib/__tests__/batch179-public-conversion.test.ts src/lib/markets/__tests__/batch21-market-movers-public-integrity.test.ts
npm run build
npm run integrity
```

## Production acceptance still required

1. **Vercel production** deploy identity vs merged PR SHA.
2. **Visual:** homepage desktop/mobile (clocks scroll, Market Pulse, hero, tool grid).
3. **ISS-038:** no remaining misleading **real-time** on public surfaces in prod bundle.
4. **Auth:** header/footer signup opens modal; analytics `auth_handoff` events (if sink configured).
5. **Group 3** (ISS-025–048) — separate authenticated dashboard pass; not closed by this batch.

## Deploy

**Vercel frontend only** when owner approves. No Edge/SQL/Fly/cron.