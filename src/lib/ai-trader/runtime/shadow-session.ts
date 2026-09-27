import type { AiTraderOperatingMode } from "@/lib/ai-trader/operating-mode";
import type { AiTraderSessionStatus } from "@/lib/ai-trader/domain/sessions";

/** Draft only. Sprint 3C never persists a production session. */
export function buildShadowSessionDraft(
  tradingDate: string,
  startedAt: string,
): {
  accountId: null;
  sessionDate: string;
  operatingMode: Extract<AiTraderOperatingMode, "SHADOW">;
  strategyVersion: null;
  modelAssignmentVersion: null;
  riskConfigurationId: null;
  startingEquity: null;
  startedAt: string;
  endedAt: null;
  status: Extract<AiTraderSessionStatus, "ACTIVE">;
} {
  return {
    accountId: null,
    sessionDate: tradingDate,
    operatingMode: "SHADOW",
    strategyVersion: null,
    modelAssignmentVersion: null,
    riskConfigurationId: null,
    startingEquity: null,
    startedAt,
    endedAt: null,
    status: "ACTIVE",
  };
}
