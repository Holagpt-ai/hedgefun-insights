import type { AiTraderOperatingMode } from "@/lib/ai-trader/operating-mode";
import type {
  AiTraderAccountId,
  AiTraderSessionId,
  ModelAssignmentId,
  RiskConfigurationId,
  StrategyVersionId,
} from "@/lib/ai-trader/domain/ids";

export const AI_TRADER_SESSION_STATUSES = ["OPEN", "CLOSED", "ABORTED"] as const;
export type AiTraderSessionStatus = (typeof AI_TRADER_SESSION_STATUSES)[number];

/**
 * Frozen trading-day context.
 * Credentials never belong on this record.
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
