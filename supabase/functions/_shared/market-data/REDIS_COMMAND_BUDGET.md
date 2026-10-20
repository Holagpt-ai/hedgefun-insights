# Market-data Redis command budget

Upstash database `stocksist-market-cache` (AWS us-east-1, Free): **500,000 commands / month**, 250 MB, 10 GB bandwidth.

Only `market-data` snapshot and aggregate requests use Redis. Gainers, losers, news, float, search, and the other types stay on their existing instance cache and do not spend commands.

## What costs a command

| Path | Commands |
| --- | --- |
| Warm isolate, serve window still open | 0 |
| Shared hit (memory miss, Redis hit) | 1 `GET` |
| Origin fill, no verified client IP | 1 `GET` + 1 `INCR` + 1 `SET` |
| Origin fill, verified client IP | 1 `GET` + 2 `INCR` + 1 `SET` |
| New quota key | one extra `EXPIRE` for that key only |
| Redis circuit open, or secrets absent | 0 (local fallback quota) |

`INCR` is the atomic counter. A Lua `EVAL` limiter would also bill every `redis.call` inside the script, so it is not used. Per-IP `INCR` runs only after `cf-connecting-ip` validates as a single public address. `x-forwarded-for` is not a quota key.

Live snapshots and live aggregates are served for **120 seconds**. The freshness label stays `fresh` for the first **30 seconds** and `aging` until 120 seconds. The JSON body is unchanged. Closed aggregate windows (end date before today's America/New_York session) are served for **6 hours** with freshness `closed`. Empty results are kept for **30 seconds**. Payloads over 96 KB are not written to Redis.

## Normal month

Assumptions in `NORMAL_REDIS_TRAFFIC`:

- 22 trading days, 7 market hours, plus evening traffic equal to 15% of market-hours cache commands
- 2 warm edge isolates that keep the in-process cache for the full serve window
- 8 hot snapshot symbols and 4 hot live aggregate keys
- 40 closed-aggregate refreshes per trading day
- 5 distinct verified client IPs
- verified-client command cost (the higher one)

**About 366,000 commands / month** (365,684 from `estimateMonthlyRedisCommands`). That leaves roughly 130,000 commands of headroom under the free allowance. Bandwidth for this volume is well under 10 GB. Stored keys expire with the serve window, so the 250 MB cap is not the binding limit.

## How usage grows

Cache commands scale with **unique hot keys** and **warm isolates**, not with browser refetches inside the serve window.

- Each additional hot snapshot or live aggregate key is about **26,600 commands / month**.
- Each additional warm isolate is about **5,300 commands / month per hot key**, plus one `GET` per closed-aggregate refresh. At the normal 12 hot keys and 40 closed refreshes per day, a third isolate adds about **65,000 commands / month**.
- Doubling the hot keys (16 snapshots and 8 live aggregates) is about **684,000 commands / month** and does not fit the free allowance.
- `EXPIRE` traffic depends on active minutes and distinct IPs, not on how many people refetch a cached symbol.
- A burst of uncacheable aggregate ranges is not stored. After the global window is exhausted, the isolate stops calling Redis for new keys until that window ends, so an attack cannot turn every request into a `GET`.

If edge isolates stop being reused and every request is a cold process, each snapshot or aggregate request pays a `GET`. The free allowance will not cover that. The in-process cache is what keeps normal traffic inside the budget.

## Lovable secrets

Set these on the server (Lovable Cloud / Supabase Edge secrets) before deploying `market-data`. Do not put them in `VITE_` variables, the client bundle, or git.

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Copy both from the Upstash REST console for `stocksist-market-cache`. If they are absent or rejected, the function keeps serving and enforces a smaller per-isolate quota instead of the shared one.

## Deploy

1. Merge the PR. Do not attach a database migration or a Fly change.
2. Set the two secrets above.
3. Deploy the `market-data` Edge Function so new isolates see the secrets.
4. Request `?type=snapshot&ticker=AAPL` twice. The JSON body stays the ticker object. The second response from a warm isolate should send `X-Market-Data-Cache: memory` or `shared`, and `X-Market-Data-Freshness: fresh` or `aging`.
5. Confirm the function logs `shared_cache=upstash` and never logs the token.
