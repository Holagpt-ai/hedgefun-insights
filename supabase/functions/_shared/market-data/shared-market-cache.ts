/**
 * Shared snapshot/aggregate cache.
 * Memory is checked first so a warm isolate does not call Redis.
 * Redis is the cross-isolate layer. Upstream quota runs only on a cache miss.
 */

import type { MarketDataClientIdentity } from "./client-identity.ts";
import {
  byteLength,
  cacheControlMaxAgeSeconds,
  decodeEnvelope,
  encodeEnvelope,
  envelopeServeMs,
  freshnessLabel,
  recordIsServable,
  SHARED_CACHE_MAX_BYTES,
  MEMORY_CACHE_MAX_BYTES,
  type CachePayloadFacts,
  type MarketCacheEnvelope,
  type MarketCacheFreshness,
  type MarketCacheSurface,
} from "./market-cache-record.ts";
import {
  LOCAL_QUOTA,
  MemoryQuota,
  QuotaLatch,
  SHARED_QUOTA,
  type QuotaDecision,
  type QuotaKind,
} from "./distributed-quota.ts";
import {
  noteMemoryHit,
  noteOriginFill,
  noteQuotaDeny,
  noteSharedHit,
  noteUpstreamFailure,
} from "./market-data-meters.ts";
import { readUpstashRestConfig, SharedQuota, UpstashRestClient, type EnvLookup } from "./upstash-redis-rest.ts";

export type SharedCacheStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
};

export type OriginLoad =
  | { ok: true; payload: unknown }
  | { ok: false; reason: "quota" | "upstream" };

export type SharedMarketDataResult =
  | {
    ok: true;
    data: unknown;
    freshness: MarketCacheFreshness;
    cache: "memory" | "shared" | "origin";
    sourceAsOfMs: number | null;
    cacheAgeMs: number;
    cacheControlMaxAgeSeconds: number;
  }
  | { ok: false; error: "rate_limited" | "upstream_unavailable"; retryAfterSeconds: number };

export type SharedMarketCacheDeps = {
  nowMs: () => number;
  l1: MemoryMarketCache;
  shared: SharedCacheStore | null;
  quota: {
    consume(kind: QuotaKind, identity: MarketDataClientIdentity, nowMs: number): Promise<QuotaDecision>;
  };
  latch: QuotaLatch;
  inflight: Map<string, Promise<SharedMarketDataResult>>;
};

export class MemoryMarketCache {
  private rows = new Map<string, MarketCacheEnvelope>();

  get(key: string, nowMs: number): MarketCacheEnvelope | null {
    const row = this.rows.get(key);
    if (!row) return null;
    if (!recordIsServable(row, nowMs)) {
      this.rows.delete(key);
      return null;
    }
    return row;
  }

  set(key: string, envelope: MarketCacheEnvelope): void {
    this.rows.delete(key);
    this.rows.set(key, envelope);
    while (this.rows.size > 200) {
      const oldest = this.rows.keys().next().value;
      if (oldest == null) break;
      this.rows.delete(oldest);
    }
  }
}

let singleton: SharedMarketCacheDeps | null = null;
let loggedMode = false;

export function getSharedMarketCacheDeps(env: EnvLookup = Deno.env): SharedMarketCacheDeps {
  if (singleton) return singleton;
  const config = readUpstashRestConfig(env);
  const local = new MemoryQuota();
  const remote = config ? new UpstashRestClient(config) : null;
  if (!loggedMode) {
    loggedMode = true;
    const configured = env.get("UPSTASH_REDIS_REST_URL") || env.get("UPSTASH_REDIS_REST_TOKEN");
    console.log(`[market-data] shared_cache=${remote ? "upstash" : configured ? "misconfigured" : "local_fallback"}`);
  }
  singleton = {
    nowMs: () => Date.now(),
    l1: new MemoryMarketCache(),
    shared: remote,
    quota: new SharedQuota(remote, local),
    latch: new QuotaLatch(),
    inflight: new Map(),
  };
  return singleton;
}

export function resetSharedMarketCacheDepsForTests(next: SharedMarketCacheDeps | null = null): void {
  singleton = next;
  loggedMode = false;
}

export async function resolveSharedMarketData(
  deps: SharedMarketCacheDeps,
  input: {
    kind: QuotaKind;
    cacheKey: string | null;
    coalesceKey: string;
    closed: boolean;
    /** Redis payload cache on L1 miss only (warm isolates still serve memory without a GET). */
    sharePayload: boolean;
    surface: MarketCacheSurface;
    identity: MarketDataClientIdentity;
    loadOrigin: (consumeAttempt: () => Promise<boolean>) => Promise<OriginLoad>;
    describe: (payload: unknown) => CachePayloadFacts;
  },
): Promise<SharedMarketDataResult> {
  const nowMs = deps.nowMs();
  if (input.cacheKey) {
    const memory = deps.l1.get(input.cacheKey, nowMs);
    if (memory) {
      noteMemoryHit();
      return serve(memory, "memory", nowMs);
    }
  }
  if (deps.latch.blocked(input.kind, input.identity, nowMs)) {
    noteQuotaDeny();
    return limited();
  }
  const existing = deps.inflight.get(input.coalesceKey);
  if (existing) return existing;
  const pending = resolveMiss(deps, input).finally(() => {
    deps.inflight.delete(input.coalesceKey);
  });
  deps.inflight.set(input.coalesceKey, pending);
  return pending;
}

async function resolveMiss(
  deps: SharedMarketCacheDeps,
  input: {
    kind: QuotaKind;
    cacheKey: string | null;
    closed: boolean;
    sharePayload: boolean;
    surface: MarketCacheSurface;
    identity: MarketDataClientIdentity;
    loadOrigin: (consumeAttempt: () => Promise<boolean>) => Promise<OriginLoad>;
    describe: (payload: unknown) => CachePayloadFacts;
  },
): Promise<SharedMarketDataResult> {
  const nowMs = deps.nowMs();
  if (input.sharePayload && input.cacheKey && deps.shared) {
    try {
      const raw = await deps.shared.get(input.cacheKey);
      const envelope = raw ? decodeEnvelope(raw) : null;
      if (envelope && recordIsServable(envelope, nowMs)) {
        deps.l1.set(input.cacheKey, envelope);
        noteSharedHit();
        return serve(envelope, "shared", nowMs);
      }
    } catch {
      // Shared cache is optional. Origin remains bounded by local quota.
    }
  }

  const loaded = await input.loadOrigin(async () => {
    const decision = await deps.quota.consume(input.kind, input.identity, deps.nowMs());
    if (!decision.allowed) {
      noteQuotaDeny();
      const limits = decision.backend === "shared" ? SHARED_QUOTA : LOCAL_QUOTA;
      if (decision.scope === "global" || decision.scope === "client") {
        deps.latch.trip(input.kind, input.identity, decision.scope, deps.nowMs(), limits);
      }
      return false;
    }
    return true;
  });
  if (!loaded.ok) {
    if (loaded.reason === "quota") return limited();
    noteUpstreamFailure();
    return { ok: false, error: "upstream_unavailable", retryAfterSeconds: 0 };
  }

  const payload = loaded.payload;
  const facts = input.describe(payload);
  const envelope: MarketCacheEnvelope = {
    v: 1,
    payload,
    sourceAsOfMs: facts.sourceAsOfMs,
    cachedAtMs: nowMs,
    closed: input.closed && !facts.empty,
    empty: facts.empty,
    surface: input.surface,
  };
  if (facts.cacheable && input.cacheKey) {
    const encoded = encodeEnvelope(envelope);
    const bytes = byteLength(encoded);
    if (bytes <= MEMORY_CACHE_MAX_BYTES) deps.l1.set(input.cacheKey, envelope);
    if (input.sharePayload && bytes <= SHARED_CACHE_MAX_BYTES && deps.shared) {
      const ttlSeconds = Math.ceil(envelopeServeMs(envelope) / 1000);
      try {
        await deps.shared.set(input.cacheKey, encoded, ttlSeconds);
      } catch {
        // Origin result is still returned. The next miss can refill Redis.
      }
    }
  }
  noteOriginFill();
  return serve(envelope, "origin", nowMs);
}

function serve(
  envelope: MarketCacheEnvelope,
  cache: "memory" | "shared" | "origin",
  nowMs: number,
): SharedMarketDataResult {
  const cacheAgeMs = Math.max(0, nowMs - envelope.cachedAtMs);
  return {
    ok: true,
    data: envelope.payload,
    freshness: freshnessLabel(envelope, nowMs),
    cache,
    sourceAsOfMs: envelope.sourceAsOfMs,
    cacheAgeMs,
    cacheControlMaxAgeSeconds: cacheControlMaxAgeSeconds(envelope, nowMs),
  };
}

function limited(): SharedMarketDataResult {
  return { ok: false, error: "rate_limited", retryAfterSeconds: 60 };
}
