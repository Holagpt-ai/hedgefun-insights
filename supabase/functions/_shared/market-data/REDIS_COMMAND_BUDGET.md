# Market-data Redis command budget

Upstash database `stocksist-market-cache` (AWS us-east-1, Free): **500,000 commands / month**, 250 MB.

Live quotes and live charts are **memory-first** (quotes 30 seconds, live charts 60 seconds). On an **L1 miss**, the Edge function may `GET` a shared Redis payload before spending an upstream attempt; after a successful origin fill it `SET`s the envelope with the same TTL window. A warm isolate never hits Redis on every frontend request. Redis also runs an atomic `INCR` per actual Massive attempt, plus one `EXPIRE` when that minute's counter is created. Per-IP keys are not written.

The browser `polygon.ts` helper adds a session cache keyed by URL and honors `Cache-Control` / `X-Market-Data-*` headers so repeat visitors do not re-invoke Edge for the same symbol inside the serve window.

The shared caps are **18 snapshot attempts/minute** and **8 aggregate attempts/minute**, including 429 and 5xx retries. Traffic above the cap is rejected. It does not keep spending commands.

## Scenarios

Active window: 22 trading days, 7 market hours, plus evening traffic equal to 15% of that window.

| Scenario | What changes | Monthly commands | Headroom |
| --- | --- | --- | --- |
| Warm | 8 hot quote keys, 4 live charts, shared payload on L1 miss, 5% retries | 246,598 | 253,402 |
| Cold | warm traffic plus higher timeout noise | 258,544 | 241,456 |
| Increased tickers and charts | 24 quote symbols, 12 live charts, 120 closed refreshes/day | 304,568 | 195,432 |
| Redis timeouts | cold traffic plus 400 timed-out commands/day before the circuit opens | 276,210 | 223,790 |

Exact figures come from `estimateMonthlyRedisCommands`. Each of these stays under **400,000** commands, leaving more than **100,000** commands of headroom. The cold and increased rows are capped: the uncapped attempt count is higher, and the extra attempts become `429` responses instead of Redis commands.

A 120-second warm-isolate model is not the operating assumption. Quote responses are served for at most 30 seconds and labeled `fresh` only inside that window. Live charts are `fresh` for 30 seconds and `aging` until 60 seconds. `Cache-Control: max-age` is the time left in that window, so an aging chart is not given another full 30 seconds.

## Other routes

Gainers, losers, reference data, news, float, and search use an in-memory cap of 300 requests per minute per isolate. That cap does not call Redis. Snapshot and aggregate origin calls stay on the shared caps above.

## Lovable secrets

Set these on the server before deploying `market-data`. Do not put them in `VITE_` variables, the client bundle, or git.

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

If they are absent, the function still serves and uses the smaller per-isolate attempt caps.

## Deploy

1. Merge the PR. Do not attach a migration or a Fly change.
2. Set the two secrets above.
3. Deploy the `market-data` Edge Function.
4. Request `?type=snapshot&ticker=AAPL`. The JSON body stays the ticker object. `X-Market-Data-Freshness` is `fresh`, and `X-Market-Data-Cache-Age-Ms` is separate from `X-Market-Data-Source-As-Of`.
5. Confirm logs show `shared_cache=upstash` and a `meters` line. The token is not logged.
