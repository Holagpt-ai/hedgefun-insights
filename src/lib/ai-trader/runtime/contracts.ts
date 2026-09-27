import type { AiTraderOperatingMode } from "@/lib/ai-trader/operating-mode";

export const AI_TRADER_MARKET_SESSIONS = [
  "PREMARKET",
  "REGULAR",
  "AFTER_HOURS",
  "CLOSED",
  "HOLIDAY",
  "EARLY_CLOSE",
  "UNKNOWN",
] as const;

export type AiTraderMarketSession = (typeof AI_TRADER_MARKET_SESSIONS)[number];

export const CLOSED_MARKET_SESSIONS = ["CLOSED", "HOLIDAY", "EARLY_CLOSE"] as const;

export function isClosedMarketSession(session: AiTraderMarketSession): boolean {
  return (CLOSED_MARKET_SESSIONS as readonly string[]).includes(session);
}

export interface ShadowCycleInput {
  now: string;
  mode: AiTraderOperatingMode;
  session: AiTraderMarketSession;
  surveillanceDate: string | null;
}

export interface ShadowCycleError {
  scope: "SYSTEMIC" | "CANDIDATE";
  symbol?: string;
  code: string;
  message: string;
}

export interface ShadowCycleResult {
  status: "COMPLETED" | "SKIPPED" | "FAILED";
  reason?: string;
  cycleId: string;
  observedCandidateCount: number;
  eligibleCandidateCount: number;
  discoveredCount: number;
  transitionedCount: number;
  removedCount: number;
  contextSnapshotsWritten: number;
  observationsWritten: number;
  errors: readonly ShadowCycleError[];
}

export interface ShadowHeartbeat {
  workerId: string;
  lastCycleStart: string | null;
  lastCycleCompletion: string | null;
  lastSuccess: string | null;
  lastError: string | null;
  mode: AiTraderOperatingMode | null;
  session: AiTraderMarketSession | null;
}

export type ShadowReadinessStatus = "READY" | "NOT_READY";

export interface ShadowReadinessResult {
  status: ShadowReadinessStatus;
  reasons: readonly string[];
}
