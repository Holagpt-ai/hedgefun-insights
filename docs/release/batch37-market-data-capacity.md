# Batch 37 — Market data capacity & scanner regression closure

## Confirmed root causes

1. **Global upstream caps (18 snapshot / 8 aggregate attempts per 60s)** apply to **Massive/Polygon origin attempts** tracked in Upstash (`SHARED_QUOTA`), not to browser page views. `clientPerWindow: 0` — there is no per-visitor Redis quota bucket.
2. **Without Upstash**, each Edge isolate uses **`LOCAL_QUOTA` (6 snapshot / 4 aggregate per minute)**, so multi-user traffic could multiply provider pressure across cold isolates.
3. **Live quotes and intraday charts previously used `sharePayload: false`**, so only in-memory L1 (per isolate) deduped traffic. Many concurrent isolates requesting the same symbol each consumed separate origin attempts until the **global** cap tripped (`429`).
4. **Stock / ETF quotes and charts** all route through `src/lib/polygon.ts` → `market-data` (`snapshot`, `aggregates`). **ETF Compare** uses `getAggregates` (same path). **Stock compare history** uses `get-stock-history` (separate Edge function, not part of the 18/8 bucket).
5. **Radar historical >20 symbols**, **progressive enrichment**, **quiet-feed session handling**, and **publish independence from 5m historical enrichment** were verified in Batch 28.3+ tests and left unchanged (no unresolved defect found in source for Batch 37 scope).

## Files changed

- `supabase/functions/market-data/index.ts` — enable shared Redis payload for live snapshots and live aggregates.
- `supabase/functions/_shared/market-data/shared-market-cache.ts` — comment clarifying L1-miss Redis reads.
- `supabase/functions/_shared/market-data/command-budget.ts` — estimator uses hot-key refresh rate (post shared-payload dedupe), not isolate×key fan-out for INCR math.
- `supabase/functions/_shared/market-data/REDIS_COMMAND_BUDGET.md` — updated scenarios.
- `supabase/functions/_shared/market-data/batch28-2-shared-market-cache_test.ts` — cross-isolate shared hit + budget figures.
- `src/lib/market-data/client-session-cache.ts` — browser session cache + header parsing.
- `src/lib/polygon.ts` — cache-first reads, inflight dedupe, freshness metadata from Edge headers.
- `src/lib/market-data/__tests__/client-session-cache.test.ts`
- `src/lib/__tests__/batch37-market-data-capacity.test.ts`

## New behavior & capacity

- **Cache hit (memory, shared Redis, or browser session)** does not call `consumeAttempt` / Massive.
- **Cross-isolate reuse**: after one origin fill, other isolates `GET` Redis on L1 miss instead of another Massive call (within serve windows).
- **Browser session cache** reduces duplicate Edge invocations from the same client (React Query refetches, compare pages, charts).
- **Honest labeling** unchanged: `X-Market-Data-Freshness`, `X-Market-Data-Source-As-Of`, `X-Market-Data-Cache-Age-Ms`, `Cache-Control: max-age=…`.

## Provider budget protections

- **SHARED_QUOTA unchanged** (18 / 8 per minute). No provider plan upgrades in this batch.
- **Quota latch** still blocks origin storms after a deny.
- **In-flight dedupe** (`coalesceKey`) within an isolate unchanged.

## Deploy / config (no production deploy from this batch)

1. Ensure **`UPSTASH_REDIS_REST_URL`** and **`UPSTASH_REDIS_REST_TOKEN`** are set on **`market-data`** (see `REDIS_COMMAND_BUDGET.md`).
2. Deploy **`market-data`** Edge function after merge.
3. Confirm logs: `shared_cache=upstash` (not `local_fallback` in production).
4. Spot-check: two browsers, same ticker within 30s — second response should show `X-Market-Data-Cache: shared` or `memory`, not a second origin for every isolate once Redis is warm.
