import type { PersistenceV2View } from "./persist_v2.ts";
import type { PublishRadarResult } from "./persist_v2.ts";
import { isRadarV2PublishCommitted } from "./persist_v2.ts";

/** Matches V2 persist failure cooldown; park retries must not bypass this every 5s eval. */
export const RADAR_V2_PARK_RETRY_INTERVAL_MS = 15_000;

export type ClosedParkStage = "flush" | "closed";

/**
 * Stable two-stage park operation identity. Generation ids and synced_at values
 * are fixed at first park attempt so retries are idempotent and cannot reopen
 * a session with newer flush timestamps after closed already committed.
 */
export type ClosedParkRecovery = {
  tradingDate: string;
  stage: ClosedParkStage;
  flushGenerationId: string;
  flushSyncedAt: string;
  closedGenerationId: string;
  closedSyncedAt: string;
  lastRpcAttemptMs: number;
  v1Published: boolean;
};

export type ClosedParkBackoffResult = {
  ok: true;
  applied: false;
  reason: "park_backoff";
};

export function isParkBackoffResult(
  v: PublishRadarResult | "skipped" | ClosedParkBackoffResult,
): v is ClosedParkBackoffResult {
  return typeof v === "object" && v !== null && "reason" in v &&
    v.reason === "park_backoff";
}

export function createClosedParkRecovery(opts: {
  tradingDate: string;
  flushGenerationId: string;
  flushSyncedAt: string;
  closedGenerationId: string;
  closedSyncedAt: string;
}): ClosedParkRecovery {
  return {
    tradingDate: opts.tradingDate,
    stage: "flush",
    flushGenerationId: opts.flushGenerationId,
    flushSyncedAt: opts.flushSyncedAt,
    closedGenerationId: opts.closedGenerationId,
    closedSyncedAt: opts.closedSyncedAt,
    lastRpcAttemptMs: 0,
    v1Published: false,
  };
}

export function shouldAttemptParkRpc(
  recovery: ClosedParkRecovery,
  wallNowMs: number,
  intervalMs: number = RADAR_V2_PARK_RETRY_INTERVAL_MS,
): boolean {
  if (recovery.lastRpcAttemptMs === 0) return true;
  return wallNowMs - recovery.lastRpcAttemptMs >= intervalMs;
}

export function parkBackoffResult(): ClosedParkBackoffResult {
  return { ok: true, applied: false, reason: "park_backoff" };
}

/** Full park committed: flush (if any) + empty closed both durable. */
export function isClosedParkFullyCommitted(
  v: PublishRadarResult | "skipped" | ClosedParkBackoffResult,
  recovery: ClosedParkRecovery | null,
  preParkFlush: PersistenceV2View | null,
): boolean {
  if (isParkBackoffResult(v) || v === "skipped") return false;
  if (!isRadarV2PublishCommitted(v)) return false;
  const flushCount = preParkFlush?.candidates.length ?? 0;
  if (flushCount > 0) {
    return recovery !== null && recovery.stage === "closed";
  }
  return true;
}

export function advanceParkStageAfterFlush(
  recovery: ClosedParkRecovery,
  flushCommitted: boolean,
): void {
  if (flushCommitted) recovery.stage = "closed";
}

export function markParkRpcAttempt(recovery: ClosedParkRecovery, wallNowMs: number): void {
  recovery.lastRpcAttemptMs = wallNowMs;
}