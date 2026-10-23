import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyProviderDelay,
  marketDataProvenanceHeaders,
  readMarketDataEntitlementDelayMinutes,
  resolveUsEquityMarketSession,
} from "./market-data-provenance.ts";
import { LOCAL_QUOTA, QuotaLatch, SHARED_QUOTA, type QuotaKind } from "./distributed-quota.ts";
import { encodeEnvelope, type MarketCacheEnvelope } from "./market-cache-record.ts";
import {
  MemoryMarketCache,
  resetMarketDataEntitlementCacheForTests,
  resolveSharedMarketData,
  type OriginLoad,
  type SharedMarketCacheDeps,
} from "./shared-market-cache.ts";
import type { MarketDataClientIdentity } from "./client-identity.ts";
import type { QuotaDecision } from "./distributed-quota.ts";

const ANON: MarketDataClientIdentity = { status: "unverified", reason: "gateway_trust_unconfirmed" };

class RecordingCache {
  gets = 0;
  sets = 0;
  private values = new Map<string, string>();

  seed(key: string, value: string): void {
    this.values.set(key, value);
  }

  get(key: string): Promise<string | null> {
    this.gets += 1;
    return Promise.resolve(this.values.get(key) ?? null);
  }

  set(key: string, value: string, _ttlSeconds: number): Promise<void> {
    this.sets += 1;
    this.values.set(key, value);
    return Promise.resolve();
  }
}

function quoteEnvelope(cachedAtMs: number, sourceAsOfMs: number | null): MarketCacheEnvelope {
  return {
    v: 1,
    payload: { ticker: "AAPL", updated: 1_728_000_000_000_000_000 },
    sourceAsOfMs,
    cachedAtMs,
    closed: false,
    empty: false,
    surface: "quote",
  };
}

function depsWith(
  now: { ms: number },
  shared: RecordingCache,
  consume: (kind: QuotaKind, identity: MarketDataClientIdentity, nowMs: number) => Promise<QuotaDecision>,
  latch = new QuotaLatch(),
): SharedMarketCacheDeps {
  return {
    nowMs: () => now.ms,
    l1: new MemoryMarketCache(),
    shared,
    quota: { consume },
    latch,
    inflight: new Map(),
  };
}

function quoteInput(
  loadOrigin: (consumeAttempt: () => Promise<boolean>) => Promise<OriginLoad>,
  sharePayload = true,
) {
  return {
    kind: "snapshot" as const,
    cacheKey: "mkt:v1:snap:AAPL",
    coalesceKey: "mkt:v1:snap:AAPL",
    closed: false,
    sharePayload,
    surface: "quote" as const,
    identity: ANON,
    describe: () => ({ cacheable: true, empty: false, sourceAsOfMs: 1_700_000_000_000 }),
    loadOrigin,
  };
}

Deno.test("provider delay uses entitlement, not cache age", () => {
  resetMarketDataEntitlementCacheForTests();
  const now = Date.parse("2026-10-20T15:00:00.000Z");
  const oldSource = now - 30 * 60_000;
  assertEquals(classifyProviderDelay(15, oldSource, now), "delayed");
  assertEquals(classifyProviderDelay(null, oldSource, now), "unknown");
  assertEquals(classifyProviderDelay(0, oldSource, now), "unknown");
  assertEquals(classifyProviderDelay(0, now - 30_000, now), "realtime");
});

Deno.test("provenance headers separate cache freshness from provider delay", () => {
  const headers = marketDataProvenanceHeaders({
    cacheFreshness: "fresh",
    cache: "shared",
    sourceAsOfMs: Date.parse("2026-10-20T14:00:00.000Z"),
    cacheAgeMs: 5_000,
    cacheControlMaxAgeSeconds: 25,
    providerDelay: "delayed",
    marketSession: "market",
  });
  assertEquals(headers["X-Market-Data-Cache-Freshness"], "fresh");
  assertEquals(headers["X-Market-Data-Provider-Delay"], "delayed");
  assertEquals(headers["X-Market-Data-Cache-Age-Ms"], "5000");
});

Deno.test("shared Redis hit succeeds while global quota latch is tripped", async () => {
  resetMarketDataEntitlementCacheForTests();
  const now = { ms: 60_000 };
  const shared = new RecordingCache();
  shared.seed("mkt:v1:snap:AAPL", encodeEnvelope(quoteEnvelope(now.ms, 1_700_000_000_000)));
  const latch = new QuotaLatch();
  latch.trip("snapshot", ANON, "global", now.ms, SHARED_QUOTA);
  let origins = 0;
  const deps = depsWith(now, shared, async () => ({ allowed: true, scope: "ok", backend: "shared" }), latch);
  const result = await resolveSharedMarketData(deps, quoteInput(async (consume) => {
    if (!(await consume())) return { ok: false, reason: "quota" };
    origins += 1;
    return { ok: true, payload: { ticker: "AAPL" } };
  }));
  assert(result.ok);
  if (result.ok) {
    assertEquals(result.cache, "shared");
    assertEquals(origins, 0);
  }
});

Deno.test("cache miss with quota available fills origin", async () => {
  resetMarketDataEntitlementCacheForTests();
  const now = { ms: 1_000_000 };
  const shared = new RecordingCache();
  let origins = 0;
  const deps = depsWith(now, shared, async () => ({ allowed: true, scope: "ok", backend: "shared" }));
  const result = await resolveSharedMarketData(deps, quoteInput(async (consume) => {
    if (!(await consume())) return { ok: false, reason: "quota" };
    origins += 1;
    return { ok: true, payload: { ticker: "AAPL" } };
  }, false));
  assert(result.ok);
  assertEquals(origins, 1);
});

Deno.test("cache miss with exhausted quota returns rate limited", async () => {
  resetMarketDataEntitlementCacheForTests();
  const now = { ms: 60_000 };
  const shared = new RecordingCache();
  const latch = new QuotaLatch();
  latch.trip("snapshot", ANON, "global", now.ms, SHARED_QUOTA);
  const deps = depsWith(now, shared, async () => ({ allowed: false, scope: "global", backend: "shared" }), latch);
  const result = await resolveSharedMarketData(deps, quoteInput(async () => ({ ok: true, payload: {} }), false));
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error, "rate_limited");
});

Deno.test("expired shared payload does not bypass quota latch", async () => {
  resetMarketDataEntitlementCacheForTests();
  const now = { ms: 100_000 };
  const shared = new RecordingCache();
  shared.seed("mkt:v1:snap:AAPL", encodeEnvelope(quoteEnvelope(now.ms - 60_000, 1_700_000_000_000)));
  const latch = new QuotaLatch();
  latch.trip("snapshot", ANON, "global", now.ms, SHARED_QUOTA);
  const deps = depsWith(now, shared, async () => ({ allowed: false, scope: "global", backend: "shared" }), latch);
  const result = await resolveSharedMarketData(deps, quoteInput(async () => ({ ok: true, payload: {} })));
  assertEquals(result.ok, false);
});

Deno.test("redis unavailable falls back to origin when quota allows", async () => {
  resetMarketDataEntitlementCacheForTests();
  const now = { ms: 1_000_000 };
  const broken: SharedMarketCacheDeps = {
    nowMs: () => now.ms,
    l1: new MemoryMarketCache(),
    shared: {
      get: () => Promise.reject(new Error("redis down")),
      set: () => Promise.reject(new Error("redis down")),
    },
    quota: { consume: async () => ({ allowed: true, scope: "ok", backend: "shared" }) },
    latch: new QuotaLatch(),
    inflight: new Map(),
  };
  let origins = 0;
  const result = await resolveSharedMarketData(broken, quoteInput(async (consume) => {
    if (!(await consume())) return { ok: false, reason: "quota" };
    origins += 1;
    return { ok: true, payload: { ticker: "AAPL" } };
  }));
  assert(result.ok);
  assertEquals(origins, 1);
});

Deno.test("concurrent identical misses coalesce to one origin", async () => {
  resetMarketDataEntitlementCacheForTests();
  const now = { ms: 2_000_000 };
  const shared = new RecordingCache();
  let origins = 0;
  const deps = depsWith(now, shared, async () => ({ allowed: true, scope: "ok", backend: "shared" }));
  const input = quoteInput(async (consume) => {
    if (!(await consume())) return { ok: false, reason: "quota" };
    await new Promise((r) => setTimeout(r, 20));
    origins += 1;
    return { ok: true, payload: { ticker: "AAPL" } };
  }, false);
  const [a, b] = await Promise.all([
    resolveSharedMarketData(deps, input),
    resolveSharedMarketData(deps, input),
  ]);
  assert(a.ok && b.ok);
  assertEquals(origins, 1);
});

Deno.test("shared quota caps remain 18 snapshot and 8 aggregate", () => {
  assertEquals(SHARED_QUOTA.snapshotPerWindow, 18);
  assertEquals(SHARED_QUOTA.aggregatesPerWindow, 8);
});

Deno.test("entitlement env parses optional delay minutes", () => {
  assertEquals(readMarketDataEntitlementDelayMinutes({ get: () => undefined }), null);
  assertEquals(readMarketDataEntitlementDelayMinutes({ get: (n) => n === "MARKET_DATA_ENTITLEMENT_DELAY_MINUTES" ? "15" : undefined }), 15);
});

Deno.test("market session resolves from wall clock", () => {
  const rth = Date.parse("2026-10-20T15:00:00.000Z");
  assertEquals(resolveUsEquityMarketSession(rth), "market");
});
