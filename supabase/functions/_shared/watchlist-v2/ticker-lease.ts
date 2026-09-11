// Ticker-level analysis lease. Persistence is a row on watchlist_analysis_requests
// (lease_expires_at). This module is the in-process claim algorithm + wait helper.
// The lease row — not a short RPC transaction — is what serializes Claude calls.

import {
  isStillValid,
  isUsablePrior,
  type ClaudeDecision,
  type PriorAnalysis,
} from "./cost-control.ts";
import type { SessionType } from "./contract.ts";

export const TICKER_LEASE_SECONDS = 90;
export const IN_FLIGHT_WAIT_MS = 8_000;
export const IN_FLIGHT_POLL_MS = 2_000;

export interface TickerLeaseKey {
  ticker: string;
  sessionDate: string;
  sessionType: SessionType;
}

export interface TickerLeaseClaim {
  acquired: boolean;
  holderRequestId: string | null;
  leaseExpiresAt: string | null;
  reason?: string;
}

export interface TickerLeaseStore {
  claim(
    key: TickerLeaseKey,
    requestId: string,
    leaseSeconds: number,
    now: Date,
  ): Promise<TickerLeaseClaim>;
  release(requestId: string, now?: Date): Promise<void>;
}

export function createRpcTickerLeaseStore(supabase: {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}): TickerLeaseStore {
  return {
    async claim(key, requestId, leaseSeconds) {
      const { data, error } = await supabase.rpc("claim_watchlist_v2_ticker_lease", {
        p_request_id: requestId,
        p_ticker: key.ticker,
        p_session_date: key.sessionDate,
        p_session_type: key.sessionType,
        p_lease_seconds: leaseSeconds,
      });
      if (error || !data || typeof data !== "object") {
        return {
          acquired: false,
          holderRequestId: null,
          leaseExpiresAt: null,
          reason: "claim_failed",
        };
      }
      const d = data as Record<string, unknown>;
      return {
        acquired: d.acquired === true,
        holderRequestId: typeof d.holder_request_id === "string" ? d.holder_request_id : null,
        leaseExpiresAt: typeof d.lease_expires_at === "string" ? d.lease_expires_at : null,
        reason: typeof d.reason === "string" ? d.reason : undefined,
      };
    },
    async release(requestId) {
      await supabase.rpc("release_watchlist_v2_ticker_lease", { p_request_id: requestId });
    },
  };
}

export function leaseKeyString(key: TickerLeaseKey): string {
  return `${key.ticker}|${key.sessionDate}|${key.sessionType}`;
}

interface MemoryLeaseRow {
  requestId: string;
  expiresAtMs: number;
}

/** In-memory store used by tests and as the claim algorithm reference. */
export class MemoryTickerLeaseStore implements TickerLeaseStore {
  private readonly byKey = new Map<string, MemoryLeaseRow>();
  private readonly byRequest = new Map<string, string>();

  claim(
    key: TickerLeaseKey,
    requestId: string,
    leaseSeconds: number,
    now: Date,
  ): Promise<TickerLeaseClaim> {
    const k = leaseKeyString(key);
    const existing = this.byKey.get(k);
    if (existing && existing.expiresAtMs > now.getTime()) {
      if (existing.requestId === requestId) {
        const expiresAt = new Date(existing.expiresAtMs).toISOString();
        return Promise.resolve({
          acquired: true,
          holderRequestId: requestId,
          leaseExpiresAt: expiresAt,
        });
      }
      return Promise.resolve({
        acquired: false,
        holderRequestId: existing.requestId,
        leaseExpiresAt: new Date(existing.expiresAtMs).toISOString(),
      });
    }
    if (existing) {
      this.byRequest.delete(existing.requestId);
      this.byKey.delete(k);
    }
    const expiresAtMs = now.getTime() + leaseSeconds * 1000;
    this.byKey.set(k, { requestId, expiresAtMs });
    this.byRequest.set(requestId, k);
    return Promise.resolve({
      acquired: true,
      holderRequestId: requestId,
      leaseExpiresAt: new Date(expiresAtMs).toISOString(),
    });
  }

  release(requestId: string): Promise<void> {
    const k = this.byRequest.get(requestId);
    if (k) {
      const row = this.byKey.get(k);
      if (row && row.requestId === requestId) this.byKey.delete(k);
      this.byRequest.delete(requestId);
    }
    return Promise.resolve();
  }

  /** Test helper: expire the active lease for a key without releasing it. */
  expire(key: TickerLeaseKey, now: Date): void {
    const k = leaseKeyString(key);
    const row = this.byKey.get(k);
    if (row) row.expiresAtMs = now.getTime() - 1;
  }

  holder(key: TickerLeaseKey): string | null {
    return this.byKey.get(leaseKeyString(key))?.requestId ?? null;
  }
}

export async function waitForPeerAnalysis(input: {
  prior: PriorAnalysis | null;
  recheckPrior: () => Promise<PriorAnalysis | null>;
  now: Date;
  sessionDate: string;
  sessionType: SessionType;
  waitMs?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<PriorAnalysis | null> {
  const waitMs = input.waitMs ?? IN_FLIGHT_WAIT_MS;
  const pollMs = input.pollMs ?? IN_FLIGHT_POLL_MS;
  const sleep = input.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const deadline = input.now.getTime() + waitMs;
  let latest = input.prior;
  while (Date.now() < deadline) {
    latest = await input.recheckPrior();
    if (latest && isStillValid(latest, new Date(), input.sessionDate, input.sessionType)) {
      return latest;
    }
    await sleep(pollMs);
  }
  latest = await input.recheckPrior();
  if (latest && isUsablePrior(latest)) return latest;
  return latest ?? input.prior;
}

export async function runExclusiveClaudeCall<T>(input: {
  store: TickerLeaseStore;
  key: TickerLeaseKey;
  requestId: string;
  forceRefresh: boolean;
  intendedDecision: "claude_called_new" | "claude_called_expired_changed" | "claude_called_manual";
  now: Date;
  prior: PriorAnalysis | null;
  recheckPrior: () => Promise<PriorAnalysis | null>;
  callClaude: () => Promise<T>;
  leaseSeconds?: number;
  waitMs?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<{
  decision: ClaudeDecision;
  value: T | null;
  claudeCalls: number;
  reused: PriorAnalysis | null;
}> {
  const leaseSeconds = input.leaseSeconds ?? TICKER_LEASE_SECONDS;
  const claim = await input.store.claim(input.key, input.requestId, leaseSeconds, input.now);
  if (!claim.acquired) {
    if (claim.reason === "claim_failed") {
      return { decision: "error", value: null, claudeCalls: 0, reused: input.prior };
    }
    const reused = await waitForPeerAnalysis({
      prior: input.prior,
      recheckPrior: input.recheckPrior,
      now: input.now,
      sessionDate: input.key.sessionDate,
      sessionType: input.key.sessionType,
      waitMs: input.waitMs,
      pollMs: input.pollMs,
      sleep: input.sleep,
    });
    return { decision: "skipped_in_flight", value: null, claudeCalls: 0, reused };
  }

  try {
    const latest = await input.recheckPrior();
    if (
      !input.forceRefresh
      && latest
      && isStillValid(latest, input.now, input.key.sessionDate, input.key.sessionType)
    ) {
      await input.store.release(input.requestId);
      return {
        decision: "skipped_still_valid",
        value: null,
        claudeCalls: 0,
        reused: latest,
      };
    }
    const value = await input.callClaude();
    // Keep the lease until persist/fail. Releasing here would reopen a
    // Claude window before finalize writes the new valid_through.
    return {
      decision: input.intendedDecision,
      value,
      claudeCalls: 1,
      reused: null,
    };
  } catch (err) {
    await input.store.release(input.requestId);
    throw err;
  }
}
