/**
 * Distributed upstream quota. Redis INCR is the atomic counter.
 * Allow/deny policy lives here so a future Valkey client can reuse it.
 *
 * Upstash bills every redis.call inside EVAL, so the limiter is INCR
 * (and a one-time EXPIRE) rather than a Lua script.
 */

import type { MarketDataClientIdentity } from "./client-identity.ts";

export type QuotaKind = "snapshot" | "aggregates";

export type QuotaDecision = {
  allowed: boolean;
  scope: "ok" | "global" | "client";
  backend: "shared" | "local-fallback";
};

/** Shared attempt caps. Sized so a saturated month stays under the Redis free tier. */
export const SHARED_QUOTA = {
  snapshotPerWindow: 18,
  aggregatesPerWindow: 8,
  clientPerWindow: 0,
  windowSeconds: 60,
  clientWindowSeconds: 60,
  expireSeconds: 120,
  clientExpireSeconds: 120,
} as const;

export const LOCAL_QUOTA = {
  snapshotPerWindow: 6,
  aggregatesPerWindow: 4,
  clientPerWindow: 0,
  windowSeconds: 60,
  clientWindowSeconds: 60,
  expireSeconds: 120,
  clientExpireSeconds: 120,
} as const;

export type QuotaLimits = {
  snapshotPerWindow: number;
  aggregatesPerWindow: number;
  clientPerWindow: number;
  windowSeconds: number;
  clientWindowSeconds: number;
  expireSeconds: number;
  clientExpireSeconds: number;
};

export function quotaDecision(
  globalCount: number,
  globalLimit: number,
  clientCount: number | null,
  clientLimit: number,
): Pick<QuotaDecision, "allowed" | "scope"> {
  if (globalCount > globalLimit) return { allowed: false, scope: "global" };
  if (clientCount != null && clientCount > clientLimit) return { allowed: false, scope: "client" };
  return { allowed: true, scope: "ok" };
}

export function globalQuotaKey(kind: QuotaKind, windowId: number): string {
  return `mkt:v1:{q:${kind}:${windowId}}`;
}

export function clientQuotaKey(kind: QuotaKind, windowId: number, ipHash: string): string {
  return `mkt:v1:{q:${kind}:${windowId}}:ip:${ipHash}`;
}

export function windowIdFor(nowMs: number, windowSeconds: number): number {
  return Math.floor(nowMs / 1000 / windowSeconds);
}

const hashCache = new Map<string, string>();

export async function hashClientIp(ip: string): Promise<string> {
  const cached = hashCache.get(ip);
  if (cached) return cached;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`stocksist-mkt-v1:${ip}`),
  );
  const hex = [...new Uint8Array(digest)].slice(0, 10)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (hashCache.size > 500) hashCache.clear();
  hashCache.set(ip, hex);
  return hex;
}

export class MemoryQuota {
  private counts = new Map<string, number>();

  consume(
    kind: QuotaKind,
    identity: MarketDataClientIdentity,
    nowMs: number,
    limits: QuotaLimits = LOCAL_QUOTA,
  ): QuotaDecision {
    this.prune(nowMs, limits);
    const globalWindow = windowIdFor(nowMs, limits.windowSeconds);
    const globalKey = globalQuotaKey(kind, globalWindow);
    const globalCount = (this.counts.get(globalKey) ?? 0) + 1;
    this.counts.set(globalKey, globalCount);
    const globalLimit = kind === "snapshot" ? limits.snapshotPerWindow : limits.aggregatesPerWindow;
    // Identity is unverified, so every caller shares this global window.
    void identity;
    const decision = quotaDecision(globalCount, globalLimit, null, limits.clientPerWindow);
    return { ...decision, backend: "local-fallback" };
  }

  private prune(nowMs: number, limits: QuotaLimits): void {
    if (this.counts.size < 400) return;
    const globalWindow = windowIdFor(nowMs, limits.windowSeconds);
    const clientWindow = windowIdFor(nowMs, limits.clientWindowSeconds);
    for (const key of this.counts.keys()) {
      const id = Number(key.slice(key.lastIndexOf(":") + 1));
      if (!Number.isFinite(id)) continue;
      if (id < globalWindow - 2 && id < clientWindow - 2) this.counts.delete(key);
    }
  }
}

export class QuotaLatch {
  private globalUntil = new Map<QuotaKind, number>();

  blocked(kind: QuotaKind, _identity: MarketDataClientIdentity, nowMs: number): boolean {
    return nowMs < (this.globalUntil.get(kind) ?? 0);
  }

  trip(
    kind: QuotaKind,
    _identity: MarketDataClientIdentity,
    scope: "global" | "client",
    nowMs: number,
    limits: QuotaLimits,
  ): void {
    if (scope !== "global") return;
    this.globalUntil.set(kind, windowEndMs(nowMs, limits.windowSeconds));
  }
}

function windowEndMs(nowMs: number, windowSeconds: number): number {
  const windowMs = windowSeconds * 1000;
  return Math.floor(nowMs / windowMs) * windowMs + windowMs;
}
