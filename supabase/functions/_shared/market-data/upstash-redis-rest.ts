/**
 * Upstash Redis REST adapter. The only module that reads Redis credentials.
 * Credentials are server env vars. They are never returned or logged.
 */

import type { MarketDataClientIdentity } from "./client-identity.ts";
import {
  clientQuotaKey,
  globalQuotaKey,
  hashClientIp,
  LOCAL_QUOTA,
  MemoryQuota,
  quotaDecision,
  SHARED_QUOTA,
  windowIdFor,
  type QuotaDecision,
  type QuotaKind,
  type QuotaLimits,
} from "./distributed-quota.ts";

export type EnvLookup = { get(name: string): string | undefined };

const REST_ORIGIN = /^https:\/\/[a-z0-9][a-z0-9-]{0,80}\.upstash\.io$/;

export function readUpstashRestConfig(env: EnvLookup): { url: string; token: string } | null {
  const url = env.get("UPSTASH_REDIS_REST_URL")?.trim() ?? "";
  const token = env.get("UPSTASH_REDIS_REST_TOKEN")?.trim() ?? "";
  if (!REST_ORIGIN.test(url)) return null;
  if (token.length < 20 || token.length > 500 || /\s/.test(token)) return null;
  return { url, token };
}

type FetchImpl = (input: string, init: RequestInit) => Promise<Response>;

export class UpstashRestClient {
  private failures = 0;
  private openUntilMs = 0;

  constructor(private opts: {
    url: string;
    token: string;
    fetchImpl?: FetchImpl;
    timeoutMs?: number;
    circuitFailures?: number;
    circuitOpenMs?: number;
    nowMs?: () => number;
  }) {}

  get circuitOpen(): boolean {
    return this.now() < this.openUntilMs;
  }

  private now(): number {
    return this.opts.nowMs?.() ?? Date.now();
  }

  async get(key: string): Promise<string | null> {
    const [result] = await this.command([["GET", key]], false);
    return typeof result === "string" ? result : null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.command([["SET", key, value, "EX", String(ttlSeconds)]], false);
  }

  /**
   * Atomic per-key INCR. Global and client counters share one pipeline
   * round trip. EXPIRE runs only when a counter is created.
   */
  async increment(input: {
    globalKey: string;
    clientKey: string | null;
    globalExpireSeconds: number;
    clientExpireSeconds: number;
  }): Promise<{ globalCount: number; clientCount: number | null }> {
    const commands: string[][] = [["INCR", input.globalKey]];
    if (input.clientKey) commands.push(["INCR", input.clientKey]);
    const results = await this.command(commands, commands.length > 1);
    const globalCount = asCount(results[0]);
    const clientCount = input.clientKey ? asCount(results[1]) : null;
    if (globalCount === 1) {
      await this.expireQuietly(input.globalKey, input.globalExpireSeconds);
    }
    if (input.clientKey && clientCount === 1) {
      await this.expireQuietly(input.clientKey, input.clientExpireSeconds);
    }
    return { globalCount, clientCount };
  }

  private async expireQuietly(key: string, ttlSeconds: number): Promise<void> {
    try {
      await this.command([["EXPIRE", key, String(ttlSeconds)]], false, false);
    } catch {
      // The window id is part of the key. A missed EXPIRE leaks one small key.
    }
  }

  private async command(commands: string[][], pipeline: boolean, recordFailure = true): Promise<unknown[]> {
    const now = this.now();
    if (now < this.openUntilMs) throw new Error("redis_unavailable");
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const timeoutMs = this.opts.timeoutMs ?? 250;
    const endpoint = pipeline ? `${this.opts.url}/pipeline` : this.opts.url;
    const body = pipeline ? JSON.stringify(commands) : JSON.stringify(commands[0]);
    try {
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.opts.token}`,
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error("redis_unavailable");
      const payload = await res.json().catch(() => null);
      const results = unwrap(payload, pipeline);
      this.failures = 0;
      return results;
    } catch (error) {
      if (recordFailure) {
        this.failures += 1;
        const limit = this.opts.circuitFailures ?? 3;
        if (this.failures >= limit) {
          this.openUntilMs = now + (this.opts.circuitOpenMs ?? 30_000);
          this.failures = 0;
        }
      }
      if (error instanceof Error && error.message === "redis_unavailable") throw error;
      throw new Error("redis_unavailable");
    }
  }
}

function asCount(value: unknown): number {
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(count) || count < 1) throw new Error("redis_unavailable");
  return count;
}

function unwrap(payload: unknown, pipeline: boolean): unknown[] {
  if (pipeline) {
    if (!Array.isArray(payload)) throw new Error("redis_unavailable");
    return payload.map((item) => {
      if (!item || typeof item !== "object") throw new Error("redis_unavailable");
      const row = item as { result?: unknown; error?: string };
      if (row.error) throw new Error("redis_unavailable");
      return row.result ?? null;
    });
  }
  if (!payload || typeof payload !== "object") throw new Error("redis_unavailable");
  const row = payload as { result?: unknown; error?: string };
  if (row.error) throw new Error("redis_unavailable");
  return [row.result ?? null];
}

export class SharedQuota {
  constructor(
    private remote: UpstashRestClient | null,
    private local: MemoryQuota,
    private sharedLimits: QuotaLimits = SHARED_QUOTA,
    private localLimits: QuotaLimits = LOCAL_QUOTA,
  ) {}

  async consume(kind: QuotaKind, identity: MarketDataClientIdentity, nowMs: number): Promise<QuotaDecision> {
    if (!this.remote || this.remote.circuitOpen) {
      return this.local.consume(kind, identity, nowMs, this.localLimits);
    }
    try {
      const globalWindow = windowIdFor(nowMs, this.sharedLimits.windowSeconds);
      const clientWindow = windowIdFor(nowMs, this.sharedLimits.clientWindowSeconds);
      const clientKey = identity.status === "verified"
        ? clientQuotaKey(kind, clientWindow, await hashClientIp(identity.ip))
        : null;
      const counts = await this.remote.increment({
        globalKey: globalQuotaKey(kind, globalWindow),
        clientKey,
        globalExpireSeconds: this.sharedLimits.expireSeconds,
        clientExpireSeconds: this.sharedLimits.clientExpireSeconds,
      });
      const globalLimit = kind === "snapshot" ? this.sharedLimits.snapshotPerWindow : this.sharedLimits.aggregatesPerWindow;
      const decision = quotaDecision(counts.globalCount, globalLimit, counts.clientCount, this.sharedLimits.clientPerWindow);
      return { ...decision, backend: "shared" };
    } catch {
      return this.local.consume(kind, identity, nowMs, this.localLimits);
    }
  }
}
