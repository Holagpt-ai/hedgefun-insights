# Vercel middleware runtime (ISS-018) — 2026-10-24

## Current implementation

- Root `middleware.ts` uses **`@vercel/functions`** (`import { next } from "@vercel/functions"`).
- Matcher covers SEO/crawler paths; private routes get `noindex` HTML shells; stock/ETF paths fetch Supabase `ticker_search` for titles.
- Canonical redirects and `X-Robots-Tag` for dashboard routes remain in **`vercel.json`** (not middleware).

## Investigation result

The October deployment **deprecated Edge middleware runtime** warning refers to legacy Edge Middleware APIs. This project already uses the **`@vercel/functions` middleware helper** recommended for Vercel’s current routing stack.

**No code change applied** — migrating to a different runtime (e.g. full Node middleware) would touch SEO HTML generation, asset manifest fetching, and crawler contracts without a confirmed breakage on the current deploy.

## Deferred

- Re-check Vercel project dashboard after next production deploy for runtime warnings.
- If Vercel documents a required `middleware` config flag, apply the minimal config-only change in an ops-approved batch.

**Status:** **Partially mitigated / deferred** — architecture already on `@vercel/functions`; deprecation notice not reproduced locally.
