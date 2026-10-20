import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  AGGREGATES_CACHE_TTL_MS,
  consumePublicMarketDataRateLimit,
  dedupePublicMarketDataInflight,
  getPublicMarketDataCached,
  PUBLIC_MARKET_DATA_MAX_REQUESTS,
  resetPublicMarketDataGuardForTests,
  setPublicMarketDataCached,
  SNAPSHOT_CACHE_TTL_MS,
} from "./public-request-guard.ts";

Deno.test("snapshot/aggregates cache TTLs are 30s", () => {
  assertEquals(SNAPSHOT_CACHE_TTL_MS, 30_000);
  assertEquals(AGGREGATES_CACHE_TTL_MS, 30_000);
});

Deno.test("public market-data cache hits within TTL and misses after", () => {
  resetPublicMarketDataGuardForTests();
  setPublicMarketDataCached("snapshot:AAA", { ticker: "AAA" }, 1_000);
  assertEquals(getPublicMarketDataCached("snapshot:AAA", 30_000, 20_000), { ticker: "AAA" });
  assertEquals(getPublicMarketDataCached("snapshot:AAA", 30_000, 32_000), null);
});

Deno.test("identical inflight market-data work runs once", async () => {
  resetPublicMarketDataGuardForTests();
  let runs = 0;
  const work = () => {
    runs += 1;
    return new Promise<string>((resolve) => setTimeout(() => resolve("ok"), 15));
  };
  const [a, b] = await Promise.all([
    dedupePublicMarketDataInflight("aggs:AAA", work),
    dedupePublicMarketDataInflight("aggs:AAA", work),
  ]);
  assertEquals(a, "ok");
  assertEquals(b, "ok");
  assertEquals(runs, 1);
});

Deno.test("public market-data rate limit allows a burst then rejects", () => {
  resetPublicMarketDataGuardForTests();
  const now = 1_000;
  for (let i = 0; i < PUBLIC_MARKET_DATA_MAX_REQUESTS; i++) {
    assertEquals(consumePublicMarketDataRateLimit("1.1.1.1", now), true);
  }
  assertEquals(consumePublicMarketDataRateLimit("1.1.1.1", now), false);
  assertEquals(consumePublicMarketDataRateLimit("2.2.2.2", now), true);
  assertEquals(consumePublicMarketDataRateLimit("1.1.1.1", now + 60_000), true);
});
