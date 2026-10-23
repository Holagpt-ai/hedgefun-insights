# Batch 37.1 — Cache-before-quota & market-data provenance

## Root causes

1. **`resolveSharedMarketData` checked `QuotaLatch` before shared Redis `GET`**, so a tripped global latch returned `429` even when a valid cross-isolate payload existed.
2. **`X-Market-Data-Freshness` described cache serve windows only**, while consumers could treat `fresh` as real-time provider tape. Provider delay was not exposed separately from cache age.

## Behavior after fix

1. Memory L1 → shared Redis payload (on L1 miss) → quota latch → origin + `INCR`.
2. Cache hits (memory or shared) never consume provider attempts or honor latch blocks.
3. New headers: `X-Market-Data-Cache-Freshness` (alias: legacy `X-Market-Data-Freshness`), `X-Market-Data-Provider-Delay`, `X-Market-Data-Market-Session`, plus existing `X-Market-Data-Source-As-Of` and `X-Market-Data-Cache-Age-Ms`.
4. **`MARKET_DATA_ENTITLEMENT_DELAY_MINUTES`** (optional Edge secret): when set to `>0`, responses label `X-Market-Data-Provider-Delay: delayed` from entitlement (not from cache age). Unset → `unknown` unless realtime entitlement (`0`) with recent source timestamp.

## Redis / provider budget

- **No change** to `SHARED_QUOTA` (18/8) or Redis infrastructure.
- Shared `GET` may run before latch; still **no `INCR` on cache hit**.

## Deploy (post-merge)

1. Deploy **`market-data`** Edge function.
2. Optional: set **`MARKET_DATA_ENTITLEMENT_DELAY_MINUTES=15`** (or your Massive REST entitlement) so public quotes label `delayed` authoritatively.
3. Confirm CORS exposes new headers in browser devtools.

## Remaining limitations

- Market session header uses ET wall-clock bands (weekends closed; holidays not fully modeled on Edge).
- Without entitlement env, provider delay stays **`unknown`** even when source timestamps are old (by design — no 15-minute inference from cache age).
