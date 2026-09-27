import type { AiTraderOperatingMode } from "@/lib/ai-trader/operating-mode";
import type {
  AiTraderAccountId,
  AiTraderSessionId,
  ModelAssignmentId,
  RiskConfigurationId,
  StrategyVersionId,
} from "@/lib/ai-trader/domain/ids";

export const AI_TRADER_SESSION_STATUSES = [
  "CREATED",
  "ACTIVE",
  "PAUSED",
  "KILLED",
  "CLOSED",
  "FAILED",
] as const;

export type AiTraderSessionStatus = (typeof AI_TRADER_SESSION_STATUSES)[number];

export const AI_TRADER_TERMINAL_SESSION_STATUSES = ["KILLED", "CLOSED", "FAILED"] as const;
export type AiTraderTerminalSessionStatus = (typeof AI_TRADER_TERMINAL_SESSION_STATUSES)[number];

/**
 * Legal status transitions. Terminal states cannot reopen.
 * CREATED → ACTIVE | FAILED
 * ACTIVE → PAUSED | KILLED | CLOSED | FAILED
 * PAUSED → ACTIVE | KILLED | CLOSED | FAILED
 */
export const AI_TRADER_SESSION_TRANSITIONS: Readonly<
  Record<AiTraderSessionStatus, readonly AiTraderSessionStatus[]>
> = {
  CREATED: ["ACTIVE", "FAILED"],
  ACTIVE: ["PAUSED", "KILLED", "CLOSED", "FAILED"],
  PAUSED: ["ACTIVE", "KILLED", "CLOSED", "FAILED"],
  KILLED: [],
  CLOSED: [],
  FAILED: [],
};

export const SESSION_IDENTITY_FIELDS = [
  "sessionDate",
  "accountId",
  "strategyVersion",
  "modelAssignmentVersion",
  "riskConfigurationId",
  "startingEquity",
  "operatingMode",
] as const;

export const SESSION_LIFECYCLE_FIELDS = ["status", "startedAt", "endedAt"] as const;

/**
 * Frozen trading-day context.
 * Credentials never belong on this record.
 * Identity fields freeze after leaving CREATED. Only lifecycle fields may change after that.
 */
export interface AiTraderSession {
  sessionId: AiTraderSessionId;
  accountId: AiTraderAccountId;
  sessionDate: string;
  operatingMode: AiTraderOperatingMode;
  strategyVersion: StrategyVersionId | null;
  modelAssignmentVersion: ModelAssignmentId | null;
  riskConfigurationId: RiskConfigurationId | null;
  startingEquity: number | null;
  startedAt: string | null;
  endedAt: string | null;
  status: AiTraderSessionStatus;
}

export function isTerminalSessionStatus(status: AiTraderSessionStatus): boolean {
  return (AI_TRADER_TERMINAL_SESSION_STATUSES as readonly string[]).includes(status);
}

export function canTransitionSessionStatus(
  from: AiTraderSessionStatus,
  to: AiTraderSessionStatus,
): boolean {
  if (from === to) return true;
  return AI_TRADER_SESSION_TRANSITIONS[from].includes(to);
}

export function sessionIdentityIsFrozen(status: AiTraderSessionStatus): boolean {
  return status !== "CREATED";
}

export function sessionPatchIsLegal(
  current: AiTraderSession,
  patch: Partial<AiTraderSession>,
): boolean {
  if (isTerminalSessionStatus(current.status)) return false;
  if (patch.status !== undefined && !canTransitionSessionStatus(current.status, patch.status)) {
    return false;
  }
  if (sessionIdentityIsFrozen(current.status)) {
    for (const field of SESSION_IDENTITY_FIELDS) {
      if (field in patch && patch[field] !== current[field]) return false;
    }
  }
  if (patch.sessionId !== undefined && patch.sessionId !== current.sessionId) return false;
  return true;
}
