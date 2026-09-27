import type { DecisionId, ReflectionId, RewardAssessmentId, TradeId } from "@/lib/ai-trader/domain/ids";
import type { ProcessQuality } from "@/lib/ai-trader/domain/reflections";

export const REWARD_DIMENSIONS = [
  "NET_PNL",
  "RISK_ADJUSTED_RETURN",
  "PROCESS_ADHERENCE",
  "EXECUTION_QUALITY",
  "FAVORABLE_EXCURSION_CAPTURE",
  "APPROPRIATE_PATIENCE",
  "CORRECT_PASS",
  "DRAWDOWN",
  "SLIPPAGE",
  "UNNECESSARY_EXPOSURE",
  "EXCESSIVE_RISK",
  "RULE_VIOLATION",
  "UNPROTECTED_DURATION",
  "EXCESSIVE_TURNOVER",
  "POOR_EXECUTION",
  "STALE_DATA_USE",
  "STRATEGY_DEVIATION",
  "KILL_SWITCH_VIOLATION_ATTEMPT",
] as const;

export type RewardDimension = (typeof REWARD_DIMENSIONS)[number];

/** Research artifact. The Risk Governor does not read this record. */
export interface AiTraderRewardAssessment {
  id: RewardAssessmentId;
  tradeId: TradeId | null;
  decisionId: DecisionId | null;
  reflectionId: ReflectionId | null;
  processQuality: ProcessQuality;
  dimensions: Readonly<Partial<Record<RewardDimension, number | null>>>;
  notes: string | null;
  createdAt: string;
}

export function rewardIsNotProcessQuality(assessment: AiTraderRewardAssessment): boolean {
  const net = assessment.dimensions.NET_PNL;
  if (net === null || net === undefined) return true;
  if (net > 0 && assessment.processQuality.startsWith("BAD_PROCESS")) return true;
  if (net <= 0 && assessment.processQuality.startsWith("GOOD_PROCESS")) return true;
  return assessment.processQuality !== "GOOD_PROCESS_GOOD_OUTCOME" || net > 0;
}
