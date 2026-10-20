import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveMarketDataClientIdentity } from "./client-identity.ts";
import {
  aggregateCacheKey,
  aggregateSourceAsOfMs,
  CLOSED_AGGREGATE_SERVE_MS,
  decodeEnvelope,
  describeSnapshotPayload,
  encodeEnvelope,
  etCalendarDate,
  FRESH_MAX_AGE_MS,
  freshnessLabel,
  isClosedAggregateWindow,
  LIVE_SERVE_MS,
  marketDataCacheHeaders,
  snapshotCacheKey,
  snapshotSourceAsOfMs,
} from "./market-cache-record.ts";
import {
  clientQuotaKey,
  hashClientIp,
  LOCAL_QUOTA,
  MemoryQuota,
  quotaDecision,
  SHARED_QUOTA,
} from "./distributed-quota.ts";
import { estimateMonthlyRedisCommands, NORMAL_REDIS_TRAFFIC } from "./command-budget.ts";
import { MemoryMarketCache, resolveSharedMarketData, type SharedMarketCacheDeps } from "./shared-market-cache.ts";
import { QuotaLatch } from "./distributed-quota.ts";
import { readUpstashRestConfig, UpstashRestClient } from "./upstash-redis-rest.ts";
import type { MarketDataClientIdentity } from "./client-identity.ts";
import type { QuotaDecision, QuotaKind } from "./distributed-quota.ts";

const VERIFIED: MarketDataClientIdentity = { status: "verified", ip: "8.8.8.8", source: "cf-connecting-ip" };
const OTHER: MarketDataClientIdentity = { status: "verified", ip: "1.1.1.1", source: "cf-connecting-ip" };
const ANON: MarketDataClientIdentity = { status: "unverified", reason: "absent" };

Deno.test("cf-connecting-ip is the only verified client identity", () => {
  const verified = resolveMarketDataClientIdentity(new Request("https://example.test", {
    headers: { "cf-connecting-ip": " 8.8.8.8 ", "x-forwarded-for": "1.2.3.4" },
  }));
  assertEquals(verified, VERIFIED);
  assertEquals(
    resolveMarketDataClientIdentity(new Request("https://example.test", {
      headers: { "x-forwarded-for": "8.8.8.8", "x-real-ip": "8.8.8.8" },
    })),
    ANON,
  );
  assertEquals(
    resolveMarketDataClientIdentity(new Request("https://example.test", {
      headers: { "cf-connecting-ip": "10.0.0.8" },
    })).status,
    "unverified",
  );
  assertEquals(
    resolveMarketDataClientIdentity(new Request("https://example.test", {
      headers: { "cf-connecting-ip": "8.8.8.8, 1.1.1.1" },
    })).status,
    "unverified",
  );
  assertEquals(
    resolveMarketDataClientIdentity(new Request("https://example.test", {
      headers: { "cf-connecting-ip": "2606:4700:4700::1111" },
    })).status,
    "verified",
  );
  assertEquals(
    resolveMarketDataClientIdentity(new Request("https://example.test", {
      headers: { "cf-connecting-ip": "fe80::1" },
    })).status,
    "unverified",
  );
});

Deno.test("snapshot and aggregate cache keys, TTLs, source timestamps, and freshness", () => {
  assertEquals(FRESH_MAX_AGE_MS, 30_000);
  assertEquals(LIVE_SERVE_MS, 120_000);
  assertEquals(CLOSED_AGGREGATE_SERVE_MS, 6 * 60 * 60 * 1000);
  assertEquals(snapshotCacheKey("AAPL"), "mkt:v1:snap:AAPL");
  assertEquals(
    aggregateCacheKey({ ticker: "BRK.B", multiplier: "5", timespan: "minute", from: "2026-10-20", to: "2026-10-20" }),
    "mkt:v1:agg:BRK.B:5:minute:2026-10-20:2026-10-20",
  );
  assertEquals(aggregateCacheKey({ ticker: "AAPL", multiplier: "1", timespan: "tick", from: "2026-10-20", to: "2026-10-20" }), null);
  assertEquals(aggregateCacheKey({ ticker: "AAPL", multiplier: "1", timespan: "day", from: "2026-10-21", to: "2026-10-20" }), null);

  const duringSession = Date.parse("2026-10-20T14:00:00.000Z");
  const beforeSessionDate = Date.parse("2026-10-20T03:30:00.000Z");
  assertEquals(etCalendarDate(duringSession), "2026-10-20");
  assertEquals(etCalendarDate(beforeSessionDate), "2026-10-19");
  assertEquals(isClosedAggregateWindow("2026-10-19", duringSession), true);
  assertEquals(isClosedAggregateWindow("2026-10-20", duringSession), false);

  const updatedNs = 1_728_000_000_000_000_000;
  assertEquals(snapshotSourceAsOfMs({ updated: updatedNs }), 1_728_000_000_000);
  assertEquals(snapshotSourceAsOfMs({ lastTrade: { t: 1_728_000_000_000 } }), 1_728_000_000_000);
  assertEquals(aggregateSourceAsOfMs([{ t: 1000 }, { t: 5_000 }, { t: 4_000 }]), null);
  assertEquals(aggregateSourceAsOfMs([{ t: 1_728_000_000_000 }, { t: 1_728_000_060_000 }]), 1_728_000_060_000);

  const live = {
    v: 1 as const,
    payload: { ticker: "AAPL" },
    sourceAsOfMs: 1_728_000_000_000,
    cachedAtMs: 1_000,
    closed: false,
    empty: false,
  };
  assertEquals(freshnessLabel(live, 20_000), "fresh");
  assertEquals(freshnessLabel(live, 40_000), "aging");
  assertEquals(freshnessLabel({ ...live, closed: true }, 1_000), "closed");
  assertEquals(
    marketDataCacheHeaders({ freshness: "aging", cache: "shared", sourceAsOfMs: 1_728_000_000_000 })["X-Market-Data-Source-As-Of"],
    "2024-10-04T00:00:00.000Z",
  );
  assertEquals(decodeEnvelope(encodeEnvelope(live))?.payload, { ticker: "AAPL" });
  assertEquals(decodeEnvelope(JSON.stringify({ v: 2 })), null);
});

Deno.test("memory hit skips Redis and origin; shared hit skips origin; inflight collapses", async () => {
  const now = { ms: 1_000_000 };
  const shared = new RecordingCache();
  let originRuns = 0;
  let quotaRuns = 0;
  const deps = depsWith(now, shared, async () => {
    quotaRuns += 1;
    return { allowed: true, scope: "ok", backend: "shared" };
  });
  const input = {
    kind: "snapshot" as const,
    cacheKey: "mkt:v1:snap:AAPL",
    coalesceKey: "mkt:v1:snap:AAPL",
    closed: false,
    identity: VERIFIED,
    describe: describeSnapshotPayload,
    loadOrigin: async () => {
      originRuns += 1;
      await new Promise((resolve) => setTimeout(resolve, 15));
      return { ticker: "AAPL", updated: 1_728_000_000_000_000_000 };
    },
  };
  const [first, second] = await Promise.all([
    resolveSharedMarketData(deps, input),
    resolveSharedMarketData(deps, input),
  ]);
  assert(first.ok && second.ok);
  assertEquals(first.data, { ticker: "AAPL", updated: 1_728_000_000_000_000_000 });
  assertEquals(originRuns, 1);
  assertEquals(quotaRuns, 1);
  assertEquals(shared.sets, 1);
  assertEquals(first.cache, "origin");
  assertEquals(first.freshness, "fresh");

  const memoryHit = await resolveSharedMarketData(deps, input);
  assert(memoryHit.ok);
  assertEquals(memoryHit.cache, "memory");
  assertEquals(shared.gets, 1);
  assertEquals(originRuns, 1);

  now.ms += 31_000;
  const aging = await resolveSharedMarketData(deps, input);
  assert(aging.ok);
  assertEquals(aging.freshness, "aging");
  assertEquals(aging.cache, "memory");
  assertEquals(originRuns, 1);

  const otherIsolate = depsWith(now, shared, async () => {
    quotaRuns += 1;
    return { allowed: true, scope: "ok", backend: "shared" };
  });
  const sharedHit = await resolveSharedMarketData(otherIsolate, input);
  assert(sharedHit.ok);
  assertEquals(sharedHit.cache, "shared");
  assertEquals(sharedHit.freshness, "aging");
  assertEquals(sharedHit.sourceAsOfMs, 1_728_000_000_000);
  assertEquals(originRuns, 1);
  assertEquals(quotaRuns, 1);
});

Deno.test("closed aggregates use a long TTL and empty snapshots stay short", async () => {
  const now = { ms: Date.parse("2026-10-20T15:00:00.000Z") };
  const shared = new RecordingCache();
  const deps = depsWith(now, shared, async () => ({ allowed: true, scope: "ok", backend: "shared" }));
  const closed = await resolveSharedMarketData(deps, {
    kind: "aggregates",
    cacheKey: "mkt:v1:agg:AAPL:1:day:2026-01-01:2026-01-31",
    coalesceKey: "closed",
    closed: true,
    identity: ANON,
    describe: (payload) => ({ cacheable: true, empty: false, sourceAsOfMs: aggregateSourceAsOfMs(payload) }),
    loadOrigin: async () => [{ t: 1_735_689_600_000, c: 10 }],
  });
  assert(closed.ok);
  assertEquals(closed.freshness, "closed");
  assertEquals(closed.data, [{ t: 1_735_689_600_000, c: 10 }]);
  assertEquals(shared.ttls[0], 6 * 60 * 60);

  const empty = await resolveSharedMarketData(deps, {
    kind: "snapshot",
    cacheKey: "mkt:v1:snap:ZZZ",
    coalesceKey: "empty",
    closed: false,
    identity: ANON,
    describe: describeSnapshotPayload,
    loadOrigin: async () => null,
  });
  assert(empty.ok);
  assertEquals(empty.data, null);
  assertEquals(shared.ttls[1], 30);
});

Deno.test("oversized payloads are not written to Redis", async () => {
  const now = { ms: 5_000 };
  const shared = new RecordingCache();
  const deps = depsWith(now, shared, async () => ({ allowed: true, scope: "ok", backend: "shared" }));
  const bulky = "x".repeat(100_000);
  const result = await resolveSharedMarketData(deps, {
    kind: "aggregates",
    cacheKey: "mkt:v1:agg:AAPL:1:minute:2026-10-20:2026-10-20",
    coalesceKey: "bulky",
    closed: false,
    identity: ANON,
    describe: () => ({ cacheable: true, empty: false, sourceAsOfMs: null }),
    loadOrigin: async () => ({ bars: bulky }),
  });
  assert(result.ok);
  assertEquals(result.data, { bars: bulky });
  assertEquals(shared.sets, 0);
  const again = await resolveSharedMarketData(deps, {
    kind: "aggregates",
    cacheKey: "mkt:v1:agg:AAPL:1:minute:2026-10-20:2026-10-20",
    coalesceKey: "bulky",
    closed: false,
    identity: ANON,
    describe: () => ({ cacheable: true, empty: false, sourceAsOfMs: null }),
    loadOrigin: async () => ({ bars: "should-not-run" }),
  });
  assert(again.ok);
  assertEquals(again.cache, "memory");
});

Deno.test("Redis failure uses the local quota and a deny latch stops further Redis reads", async () => {
  const now = { ms: 60_000 };
  const shared = new RecordingCache();
  shared.failGets = true;
  const local = new MemoryQuota();
  let originRuns = 0;
  const deps: SharedMarketCacheDeps = {
    nowMs: () => now.ms,
    l1: new MemoryMarketCache(),
    shared,
    quota: {
      consume: (kind, identity, at) => Promise.resolve(local.consume(kind, identity, at, {
        ...LOCAL_QUOTA,
        snapshotPerWindow: 1,
        clientPerWindow: 1,
      })),
    },
    latch: new QuotaLatch(),
    inflight: new Map(),
  };
  const call = (key: string) => resolveSharedMarketData(deps, {
    kind: "snapshot",
    cacheKey: key,
    coalesceKey: key,
    closed: false,
    identity: ANON,
    describe: describeSnapshotPayload,
    loadOrigin: async () => {
      originRuns += 1;
      return { ticker: key };
    },
  });
  const first = await call("mkt:v1:snap:AAA");
  assert(first.ok);
  assertEquals(originRuns, 1);
  const denied = await call("mkt:v1:snap:BBB");
  assertEquals(denied.ok, false);
  const getsAfterDeny = shared.gets;
  const latched = await call("mkt:v1:snap:CCC");
  assertEquals(latched.ok, false);
  assertEquals(shared.gets, getsAfterDeny);
  assertEquals(originRuns, 1);
});

Deno.test("a client deny does not block a different verified client or hide the global cap", () => {
  assertEquals(quotaDecision(61, 60, 1, 100), { allowed: false, scope: "global" });
  assertEquals(quotaDecision(10, 60, 101, 100), { allowed: false, scope: "client" });
  assertEquals(quotaDecision(10, 60, null, 100), { allowed: true, scope: "ok" });

  const quota = new MemoryQuota();
  const limits = { ...LOCAL_QUOTA, snapshotPerWindow: 20, clientPerWindow: 1 };
  assertEquals(quota.consume("snapshot", VERIFIED, 1_000, limits).allowed, true);
  assertEquals(quota.consume("snapshot", VERIFIED, 1_000, limits).scope, "client");
  assertEquals(quota.consume("snapshot", OTHER, 1_000, limits).allowed, true);
  const global = new MemoryQuota();
  const tight = { ...LOCAL_QUOTA, snapshotPerWindow: 1, clientPerWindow: 10 };
  assert(global.consume("snapshot", ANON, 1_000, tight).allowed);
  assertEquals(global.consume("snapshot", ANON, 1_000, tight).scope, "global");
});

Deno.test("Upstash REST uses bearer auth, atomic INCR, and a circuit breaker", async () => {
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
      if (!Array.isArray(parsed[0])) {
        if (parsed[0] === "EXPIRE") return jsonResponse({ result: 1 });
        if (parsed[0] === "GET") return jsonResponse({ result: null });
      }
      return jsonResponse([{ result: 1 }, { result: 1 }]);
    },
  });
  const hash = await hashClientIp("8.8.8.8");
  const clientKey = clientQuotaKey("snapshot", 1, hash);
  assertFalse(clientKey.includes("8.8.8.8"));
  const first = await client.increment({
    globalKey: "mkt:v1:{q:snapshot:1}",
    clientKey,
    globalExpireSeconds: 120,
    clientExpireSeconds: 600,
  });
  assertEquals(first, { globalCount: 1, clientCount: 1 });
  assertEquals(calls[0].url, "https://stocksist-market-cache.upstash.io/pipeline");
  assertEquals(calls[0].authorization, `Bearer ${token}`);
  assert(calls[0].body.includes("INCR"));
  assertEquals(calls.filter((call) => call.body.includes("EXPIRE")).length, 2);

  let fetchCalls = 0;
  const failing = new UpstashRestClient({
    url: "https://stocksist-market-cache.upstash.io",
    token,
    nowMs: () => 5_000,
    circuitOpenMs: 30_000,
    fetchImpl: () => {
      fetchCalls += 1;
      return Promise.reject(new Error("timeout"));
    },
  });
  for (let i = 0; i < 3; i++) {
    await failing.get("mkt:v1:snap:AAPL").catch(() => undefined);
  }
  assert(failing.circuitOpen);
  await failing.get("mkt:v1:snap:AAPL").catch(() => undefined);
  assertEquals(fetchCalls, 3);
});

Deno.test("Redis credentials stay server-side and untrusted headers stay out of market-data", async () => {
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
  assertEquals(readUpstashRestConfig({
    get: (name) => name === "UPSTASH_REDIS_REST_URL" ? "http://stocksist-market-cache.upstash.io" : "B".repeat(40),
  }), null);

  const index = await Deno.readTextFile(new URL("../../market-data/index.ts", import.meta.url));
  const rest = await Deno.readTextFile(new URL("./upstash-redis-rest.ts", import.meta.url));
  const client = await Deno.readTextFile(new URL("../../../../src/lib/polygon.ts", import.meta.url));
  assertFalse(index.includes("x-forwarded-for"));
  assertFalse(index.includes("VITE_UPSTASH"));
  assertFalse(index.includes("public-request-guard"));
  assertFalse(index.includes("UPSTASH_REDIS_REST_TOKEN"));
  assert(index.includes("resolveSharedMarketData"));
  assertFalse(rest.includes("VITE_"));
  assert(rest.includes("UPSTASH_REDIS_REST_URL"));
  assert(rest.includes("UPSTASH_REDIS_REST_TOKEN"));
  assertFalse(client.includes("UPSTASH"));
  assertEquals(SHARED_QUOTA.snapshotPerWindow, 60);
  assertEquals(LOCAL_QUOTA.snapshotPerWindow < SHARED_QUOTA.snapshotPerWindow, true);
});

Deno.test("normal Redis command budget fits the free allowance and grows with keys and isolates", () => {
  const normal = estimateMonthlyRedisCommands(NORMAL_REDIS_TRAFFIC);
  assertEquals(normal.monthlyCommands, 365_684);
  assertEquals(normal.commandsPerExtraHotKey, 26_565);
  assertEquals(normal.commandsPerExtraIsolatePerHotKey, 5_313);
  assert(normal.monthlyCommands < 450_000);
  const doubledKeys = estimateMonthlyRedisCommands({
    ...NORMAL_REDIS_TRAFFIC,
    hotSnapshotKeys: 16,
    hotLiveAggregateKeys: 8,
  });
  assert(doubledKeys.monthlyCommands > 500_000);
  const extraIsolate = estimateMonthlyRedisCommands({ ...NORMAL_REDIS_TRAFFIC, warmIsolates: 3 });
  const hotKeys = NORMAL_REDIS_TRAFFIC.hotSnapshotKeys + NORMAL_REDIS_TRAFFIC.hotLiveAggregateKeys;
  assertEquals(
    extraIsolate.monthlyCommands - normal.monthlyCommands,
    normal.commandsPerExtraIsolatePerHotKey * hotKeys
      + NORMAL_REDIS_TRAFFIC.closedAggregateRefreshesPerDay * NORMAL_REDIS_TRAFFIC.tradingDays,
  );
});

class RecordingCache {
  gets = 0;
  sets = 0;
  failGets = false;
  ttls: number[] = [];
  private values = new Map<string, string>();

  get(key: string): Promise<string | null> {
    this.gets += 1;
    if (this.failGets) return Promise.reject(new Error("redis_unavailable"));
    return Promise.resolve(this.values.get(key) ?? null);
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.sets += 1;
    this.ttls.push(ttlSeconds);
    this.values.set(key, value);
    return Promise.resolve();
  }
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
