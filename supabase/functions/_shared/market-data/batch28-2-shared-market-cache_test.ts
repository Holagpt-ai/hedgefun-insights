import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveMarketDataClientIdentity } from "./client-identity.ts";
import {
  aggregateCacheKey,
  aggregateSourceAsOfMs,
  cacheControlMaxAgeSeconds,
  CLOSED_AGGREGATE_SERVE_MS,
  decodeEnvelope,
  describeSnapshotPayload,
  encodeEnvelope,
  etCalendarDate,
  FRESH_MAX_AGE_MS,
  freshnessLabel,
  isClosedAggregateWindow,
  LIVE_AGGREGATE_SERVE_MS,
  marketDataCacheHeaders,
  SNAPSHOT_SERVE_MS,
  snapshotCacheKey,
  snapshotSourceAsOfMs,
  type MarketCacheEnvelope,
} from "./market-cache-record.ts";
import {
  LOCAL_QUOTA,
  MemoryQuota,
  QuotaLatch,
  SHARED_QUOTA,
} from "./distributed-quota.ts";
import {
  COLD_REDIS_TRAFFIC,
  DEGRADED_REDIS_TRAFFIC,
  estimateMonthlyRedisCommands,
  FREE_TIER_MONTHLY_COMMANDS,
  INCREASED_REDIS_TRAFFIC,
  WARM_REDIS_TRAFFIC,
} from "./command-budget.ts";
import {
  consumeInstanceRequestGuard,
  OTHER_ROUTE_MAX_REQUESTS,
  resetInstanceRequestGuardForTests,
} from "./instance-request-guard.ts";
import { fetchMassive, MASSIVE_MAX_ATTEMPTS } from "./massive-fetch.ts";
import {
  marketDataMeterSnapshot,
  maybeLogMarketDataMeters,
  noteRedisCommands,
  resetMarketDataMetersForTests,
} from "./market-data-meters.ts";
import {
  MemoryMarketCache,
  resolveSharedMarketData,
  type OriginLoad,
  type SharedMarketCacheDeps,
} from "./shared-market-cache.ts";
import { readUpstashRestConfig, UpstashRestClient } from "./upstash-redis-rest.ts";
import type { MarketDataClientIdentity } from "./client-identity.ts";
import type { QuotaDecision, QuotaKind } from "./distributed-quota.ts";

const ANON: MarketDataClientIdentity = { status: "unverified", reason: "gateway_trust_unconfirmed" };

Deno.test("forwarded and cf-connecting-ip headers stay unverified", () => {
  for (const headers of [
    new Headers({ "cf-connecting-ip": "8.8.8.8" }),
    new Headers({ "cf-connecting-ip": " 8.8.8.8 ", "x-forwarded-for": "1.2.3.4" }),
    new Headers({ "x-forwarded-for": "8.8.8.8", "x-real-ip": "8.8.8.8" }),
    new Headers({ "cf-connecting-ip": "10.0.0.8" }),
    new Headers({ "cf-connecting-ip": "2606:4700:4700::1111" }),
  ]) {
    assertEquals(
      resolveMarketDataClientIdentity(new Request("https://example.test", { headers })),
      ANON,
    );
  }
});

Deno.test("quote tape is 30s and live charts age only until 60s", () => {
  assertEquals(FRESH_MAX_AGE_MS, 30_000);
  assertEquals(SNAPSHOT_SERVE_MS, 30_000);
  assertEquals(LIVE_AGGREGATE_SERVE_MS, 60_000);
  assertEquals(CLOSED_AGGREGATE_SERVE_MS, 6 * 60 * 60 * 1000);
  assertEquals(snapshotCacheKey("AAPL"), "mkt:v1:snap:AAPL");
  assertEquals(
    aggregateCacheKey({ ticker: "BRK.B", multiplier: "5", timespan: "minute", from: "2026-10-20", to: "2026-10-20" }),
    "mkt:v1:agg:BRK.B:5:minute:2026-10-20:2026-10-20",
  );
  assertEquals(aggregateCacheKey({ ticker: "AAPL", multiplier: "1", timespan: "tick", from: "2026-10-20", to: "2026-10-20" }), null);

  const duringSession = Date.parse("2026-10-20T14:00:00.000Z");
  assertEquals(etCalendarDate(duringSession), "2026-10-20");
  assertEquals(etCalendarDate(Date.parse("2026-10-20T03:30:00.000Z")), "2026-10-19");
  assertEquals(isClosedAggregateWindow("2026-10-19", duringSession), true);
  assertEquals(snapshotSourceAsOfMs({ updated: 1_728_000_000_000_000_000 }), 1_728_000_000_000);
  assertEquals(aggregateSourceAsOfMs([{ t: 1_728_000_000_000 }, { t: 1_728_000_060_000 }]), 1_728_000_060_000);

  const quote: MarketCacheEnvelope = {
    v: 1,
    payload: { ticker: "AAPL" },
    sourceAsOfMs: 1_700_000_000_000,
    cachedAtMs: 1_000,
    closed: false,
    empty: false,
    surface: "quote",
  };
  assertEquals(freshnessLabel(quote, 20_000), "fresh");
  assertEquals(cacheControlMaxAgeSeconds(quote, 20_000), 11);
  const bars: MarketCacheEnvelope = { ...quote, surface: "bars", cachedAtMs: 0 };
  assertEquals(freshnessLabel(bars, 45_000), "aging");
  assertEquals(cacheControlMaxAgeSeconds(bars, 45_000), 15);
  assert(45_000 + cacheControlMaxAgeSeconds(bars, 45_000) * 1000 <= LIVE_AGGREGATE_SERVE_MS);
  const headers = marketDataCacheHeaders({
    freshness: "aging",
    cache: "memory",
    sourceAsOfMs: 1_700_000_000_000,
    cacheAgeMs: 45_000,
    cacheControlMaxAgeSeconds: 15,
  });
  assertEquals(headers["X-Market-Data-Freshness"], "aging");
  assertEquals(headers["X-Market-Data-Cache-Age-Ms"], "45000");
  assertEquals(headers["X-Market-Data-Source-As-Of"], "2023-11-14T22:13:20.000Z");
  assertFalse(headers["X-Market-Data-Source-As-Of"] === headers["X-Market-Data-Cache-Age-Ms"]);
  assertEquals(decodeEnvelope(encodeEnvelope(quote))?.surface, "quote");
});

Deno.test("memory serves a fresh quote and does not keep it past 30s", async () => {
  const now = { ms: 1_000_000 };
  const shared = new RecordingCache();
  let origins = 0;
  const deps = depsWith(now, shared, async () => ({ allowed: true, scope: "ok", backend: "shared" }));
  const input = quoteInput(async (consume) => {
    if (!(await consume())) return { ok: false, reason: "quota" };
    origins += 1;
    return { ok: true, payload: { ticker: "AAPL", updated: 1_728_000_000_000_000_000 } };
  });
  const first = await resolveSharedMarketData(deps, input);
  assert(first.ok);
  assertEquals(first.cache, "origin");
  assertEquals(first.freshness, "fresh");
  assertEquals(first.cacheControlMaxAgeSeconds, 30);
  assertEquals(shared.gets, 0);
  assertEquals(shared.sets, 0);
  const second = await resolveSharedMarketData(deps, input);
  assert(second.ok);
  assertEquals(second.cache, "memory");
  assertEquals(origins, 1);
  now.ms += 31_000;
  const expired = await resolveSharedMarketData(deps, input);
  assert(expired.ok);
  assertEquals(expired.cache, "origin");
  assertEquals(origins, 2);
});

Deno.test("live charts can be aging and closed charts use the shared payload cache", async () => {
  const now = { ms: Date.parse("2026-10-20T15:00:00.000Z") };
  const shared = new RecordingCache();
  const deps = depsWith(now, shared, async () => ({ allowed: true, scope: "ok", backend: "shared" }));
  const live = await resolveSharedMarketData(deps, {
    ...quoteInput(async (consume) => {
      if (!(await consume())) return { ok: false, reason: "quota" };
      return { ok: true, payload: [{ t: 1_728_000_000_000, c: 1 }] };
    }),
    kind: "aggregates",
    cacheKey: "mkt:v1:agg:AAPL:1:minute:2026-10-20:2026-10-20",
    coalesceKey: "live",
    surface: "bars",
    sharePayload: false,
    describe: () => ({ cacheable: true, empty: false, sourceAsOfMs: 1_728_000_000_000 }),
  });
  assert(live.ok);
  assertEquals(live.freshness, "fresh");
  assertEquals(shared.sets, 0);
  now.ms += 45_000;
  const aging = await resolveSharedMarketData(deps, {
    ...quoteInput(async () => ({ ok: true, payload: [] })),
    kind: "aggregates",
    cacheKey: "mkt:v1:agg:AAPL:1:minute:2026-10-20:2026-10-20",
    coalesceKey: "live",
    surface: "bars",
    sharePayload: false,
    describe: () => ({ cacheable: true, empty: false, sourceAsOfMs: null }),
  });
  assert(aging.ok);
  assertEquals(aging.cache, "memory");
  assertEquals(aging.freshness, "aging");
  assertEquals(aging.cacheControlMaxAgeSeconds, 15);

  const closed = await resolveSharedMarketData(deps, {
    kind: "aggregates",
    cacheKey: "mkt:v1:agg:AAPL:1:day:2026-01-01:2026-01-31",
    coalesceKey: "closed",
    closed: true,
    sharePayload: true,
    surface: "bars",
    identity: ANON,
    describe: (payload) => ({ cacheable: true, empty: false, sourceAsOfMs: aggregateSourceAsOfMs(payload) }),
    loadOrigin: async (consume) => {
      if (!(await consume())) return { ok: false, reason: "quota" };
      return { ok: true, payload: [{ t: 1_735_689_600_000, c: 10 }] };
    },
  });
  assert(closed.ok);
  assertEquals(closed.freshness, "closed");
  assertEquals(closed.data, [{ t: 1_735_689_600_000, c: 10 }]);
  assertEquals(shared.ttls[0], 6 * 60 * 60);
});

Deno.test("provider failures are not cached as empty quotes", async () => {
  const now = { ms: 5_000 };
  const shared = new RecordingCache();
  let calls = 0;
  const deps = depsWith(now, shared, async () => ({ allowed: true, scope: "ok", backend: "shared" }));
  const failed = await resolveSharedMarketData(deps, quoteInput(async (consume) => {
    if (!(await consume())) return { ok: false, reason: "quota" };
    calls += 1;
    return { ok: false, reason: "upstream" };
  }));
  assertEquals(failed.ok, false);
  if (!failed.ok) assertEquals(failed.error, "upstream_unavailable");
  const again = await resolveSharedMarketData(deps, quoteInput(async (consume) => {
    if (!(await consume())) return { ok: false, reason: "quota" };
    calls += 1;
    return { ok: true, payload: { ticker: "AAPL" } };
  }));
  assert(again.ok);
  assertEquals(again.data, { ticker: "AAPL" });
  assertEquals(calls, 2);
});

Deno.test("each Massive retry consumes quota and a failed body is not success", async () => {
  let fetches = 0;
  let permits = 0;
  const result = await fetchMassive("https://api.polygon.io/v2/snapshot", {
    delayMs: 0,
    sleep: () => Promise.resolve(),
    beforeAttempt: () => {
      permits += 1;
      return permits <= 2;
    },
    fetchImpl: () => {
      fetches += 1;
      return Promise.resolve(new Response("nope", { status: 500 }));
    },
  });
  assertEquals(MASSIVE_MAX_ATTEMPTS, 3);
  assertEquals(fetches, 2);
  assertEquals(result.kind, "response");
  if (result.kind === "response") assertEquals(result.response.ok, false);

  const blocked = await fetchMassive("https://api.polygon.io/v2/aggs", {
    delayMs: 0,
    sleep: () => Promise.resolve(),
    beforeAttempt: () => false,
    fetchImpl: () => Promise.resolve(new Response("[]", { status: 200 })),
  });
  assertEquals(blocked.kind, "quota");
});

Deno.test("other public routes keep an in-memory cap and do not use Redis", () => {
  resetInstanceRequestGuardForTests();
  for (let i = 0; i < OTHER_ROUTE_MAX_REQUESTS; i++) {
    assertEquals(consumeInstanceRequestGuard(1_000), true);
  }
  assertEquals(consumeInstanceRequestGuard(1_000), false);
  assertEquals(consumeInstanceRequestGuard(1_000 + 60_000), true);
});

Deno.test("unverified callers share one global quota bucket", () => {
  const quota = new MemoryQuota();
  const limits = { ...LOCAL_QUOTA, snapshotPerWindow: 1 };
  assertEquals(quota.consume("snapshot", ANON, 1_000, limits).allowed, true);
  assertEquals(quota.consume("snapshot", ANON, 1_000, limits).scope, "global");
  assertEquals(SHARED_QUOTA.snapshotPerWindow, 18);
  assertEquals(SHARED_QUOTA.aggregatesPerWindow, 8);
  assert(LOCAL_QUOTA.snapshotPerWindow < SHARED_QUOTA.snapshotPerWindow);
});

Deno.test("a quota deny latches further origin calls", async () => {
  const now = { ms: 60_000 };
  const shared = new RecordingCache();
  let origins = 0;
  const local = new MemoryQuota();
  const deps: SharedMarketCacheDeps = {
    nowMs: () => now.ms,
    l1: new MemoryMarketCache(),
    shared,
    quota: {
      consume: (kind, identity, at) => Promise.resolve(local.consume(kind, identity, at, {
        ...LOCAL_QUOTA,
        snapshotPerWindow: 1,
      })),
    },
    latch: new QuotaLatch(),
    inflight: new Map(),
  };
  const call = (key: string) => resolveSharedMarketData(deps, {
    ...quoteInput(async (consume) => {
      if (!(await consume())) return { ok: false, reason: "quota" };
      origins += 1;
      return { ok: true, payload: { ticker: key } };
    }),
    cacheKey: key,
    coalesceKey: key,
  });
  assert((await call("mkt:v1:snap:AAA")).ok);
  assertEquals((await call("mkt:v1:snap:BBB")).ok, false);
  const gets = shared.gets;
  assertEquals((await call("mkt:v1:snap:CCC")).ok, false);
  assertEquals(shared.gets, gets);
  assertEquals(origins, 1);
});

Deno.test("Upstash REST sends one global INCR and opens the circuit without more commands", async () => {
  resetMarketDataMetersForTests();
  const token = "A".repeat(32);
  const calls: Array<{ url: string; body: string; authorization: string }> = [];
  const client = new UpstashRestClient({
    url: "https://stocksist-market-cache.upstash.io",
    token,
    nowMs: () => 5_000,
    fetchImpl: async (url, init) => {
      const headers = init.headers as Record<string, string>;
      const body = String(init.body);
      calls.push({ url, body, authorization: headers.Authorization });
      assertFalse(url.includes(token));
      assertFalse(body.includes(token));
      const parsed = JSON.parse(body);
      if (parsed[0] === "EXPIRE") return jsonResponse({ result: 1 });
      return jsonResponse({ result: 1 });
    },
  });
  const first = await client.increment({
    globalKey: "mkt:v1:{q:snapshot:1}",
    clientKey: null,
    globalExpireSeconds: 120,
    clientExpireSeconds: 120,
  });
  assertEquals(first.globalCount, 1);
  assertEquals(first.clientCount, null);
  assertEquals(calls[0].url, "https://stocksist-market-cache.upstash.io");
  assert(calls[0].body.includes("INCR"));
  assertEquals(calls.filter((call) => call.body.includes("EXPIRE")).length, 1);
  assert(marketDataMeterSnapshot().redisCommands >= 2);

  let fetchCalls = 0;
  const failing = new UpstashRestClient({
    url: "https://stocksist-market-cache.upstash.io",
    token,
    nowMs: () => 5_000,
    fetchImpl: () => {
      fetchCalls += 1;
      return Promise.reject(new Error("timeout"));
    },
  });
  for (let i = 0; i < 3; i++) await failing.get("k").catch(() => undefined);
  assert(failing.circuitOpen);
  await failing.get("k").catch(() => undefined);
  assertEquals(fetchCalls, 3);
  assert(marketDataMeterSnapshot().circuitSkips >= 1);
});

Deno.test("Redis credentials stay server-side", async () => {
  assertEquals(readUpstashRestConfig({
    get: (name) => name === "UPSTASH_REDIS_REST_URL"
      ? "https://stocksist-market-cache.upstash.io"
      : name === "UPSTASH_REDIS_REST_TOKEN"
      ? "B".repeat(40)
      : undefined,
  })?.url, "https://stocksist-market-cache.upstash.io");
  assertEquals(readUpstashRestConfig({
    get: (name) => name === "VITE_UPSTASH_REDIS_REST_URL" ? "https://stocksist-market-cache.upstash.io" : "secret",
  }), null);
  const index = await Deno.readTextFile(new URL("../../market-data/index.ts", import.meta.url));
  const rest = await Deno.readTextFile(new URL("./upstash-redis-rest.ts", import.meta.url));
  const client = await Deno.readTextFile(new URL("../../../../src/lib/polygon.ts", import.meta.url));
  assertFalse(index.includes("x-forwarded-for"));
  assertFalse(index.includes("VITE_UPSTASH"));
  assertFalse(index.includes("UPSTASH_REDIS_REST_TOKEN"));
  assert(index.includes("consumeInstanceRequestGuard"));
  assert(index.includes("sharePayload: false"));
  assert(index.includes("sharePayload: closed"));
  assertFalse(rest.includes("VITE_"));
  assertFalse(client.includes("UPSTASH"));
});

Deno.test("warm, cold, increased, and degraded Redis budgets keep free-tier headroom", () => {
  for (const scenario of [WARM_REDIS_TRAFFIC, COLD_REDIS_TRAFFIC, INCREASED_REDIS_TRAFFIC, DEGRADED_REDIS_TRAFFIC]) {
    const estimate = estimateMonthlyRedisCommands(scenario);
    assert(estimate.monthlyCommands < 400_000, scenario.name);
    assert(estimate.headroomCommands > 100_000, scenario.name);
    assert(estimate.monthlyCommands < FREE_TIER_MONTHLY_COMMANDS);
  }
  const warm = estimateMonthlyRedisCommands(WARM_REDIS_TRAFFIC);
  const cold = estimateMonthlyRedisCommands(COLD_REDIS_TRAFFIC);
  assert(cold.capped);
  assert(cold.uncappedAttemptCommands > cold.monthlyCommands);
  assertEquals(estimateMonthlyRedisCommands(WARM_REDIS_TRAFFIC).monthlyCommands, 299_728);
  assertEquals(estimateMonthlyRedisCommands(COLD_REDIS_TRAFFIC).monthlyCommands, 301_048);
  assertEquals(estimateMonthlyRedisCommands(INCREASED_REDIS_TRAFFIC).monthlyCommands, 304_568);
  assertEquals(estimateMonthlyRedisCommands(DEGRADED_REDIS_TRAFFIC).monthlyCommands, 308_088);
});

Deno.test("meter log is bounded to one line per minute", () => {
  resetMarketDataMetersForTests();
  noteRedisCommands(4);
  assertEquals(maybeLogMarketDataMeters(10_000), true);
  assertEquals(marketDataMeterSnapshot().redisCommands, 0);
  noteRedisCommands(2);
  assertEquals(maybeLogMarketDataMeters(20_000), false);
  assertEquals(marketDataMeterSnapshot().redisCommands, 2);
  assertEquals(maybeLogMarketDataMeters(80_000), true);
  assertEquals(marketDataMeterSnapshot().redisCommands, 0);
});

class RecordingCache {
  gets = 0;
  sets = 0;
  ttls: number[] = [];
  private values = new Map<string, string>();

  get(key: string): Promise<string | null> {
    this.gets += 1;
    return Promise.resolve(this.values.get(key) ?? null);
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.sets += 1;
    this.ttls.push(ttlSeconds);
    this.values.set(key, value);
    return Promise.resolve();
  }
}

function quoteInput(
  loadOrigin: (consumeAttempt: () => Promise<boolean>) => Promise<OriginLoad>,
) {
  return {
    kind: "snapshot" as const,
    cacheKey: "mkt:v1:snap:AAPL",
    coalesceKey: "mkt:v1:snap:AAPL",
    closed: false,
    sharePayload: false,
    surface: "quote" as const,
    identity: ANON,
    describe: describeSnapshotPayload,
    loadOrigin,
  };
}

function depsWith(
  now: { ms: number },
  shared: RecordingCache,
  consume: (kind: QuotaKind, identity: MarketDataClientIdentity, nowMs: number) => Promise<QuotaDecision>,
): SharedMarketCacheDeps {
  return {
    nowMs: () => now.ms,
    l1: new MemoryMarketCache(),
    shared,
    quota: { consume },
    latch: new QuotaLatch(),
    inflight: new Map(),
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}
