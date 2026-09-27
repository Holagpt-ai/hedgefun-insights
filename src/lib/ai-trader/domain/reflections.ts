import type {
  CounterfactualId,
  DecisionId,
  ReflectionId,
  StrategyCandidateId,
  TradeId,
} from "@/lib/ai-trader/domain/ids";

export const PROCESS_QUALITY = [
  "BAD_PROCESS_GOOD_OUTCOME",
  "GOOD_PROCESS_BAD_OUTCOME",
  "GOOD_PROCESS_GOOD_OUTCOME",
  "BAD_PROCESS_BAD_OUTCOME",
] as const;

export type ProcessQuality = (typeof PROCESS_QUALITY)[number];

export const REFLECTION_TYPES = [
  "TRADE",
  "PASS",
  "WAIT",
  "RISK_REJECTION",
  "WATCHLIST",
] as const;
export type ReflectionType = (typeof REFLECTION_TYPES)[number];

export interface AiTraderReflection {
  id: ReflectionId;
  tradeId: TradeId | null;
  decisionId: DecisionId | null;
  reflectionType: ReflectionType;
  processQuality: ProcessQuality;
  modelProvider: string | null;
  modelVersion: string | null;
  promptVersion: string | null;
  schemaVersion: string;
  summary: string;
  whatWorked: readonly string[];
  whatFailed: readonly string[];
  earliestFailureSignal: string | null;
  lessons: readonly string[];
  confidence: number | null;
  createdAt: string;
}

export interface AiTraderCounterfactual {
  id: CounterfactualId;
  tradeId: TradeId | null;
  decisionId: DecisionId | null;
  alternativeAction: string;
  alternativeEntry: number | null;
  alternativeStop: number | null;
  alternativeExit: number | null;
  estimatedOutcome: Record<string, unknown>;
  methodology: string;
  limitations: string;
  createdAt: string;
}

export const STRATEGY_CANDIDATE_STATUSES = [
  "PROPOSED",
  "BACKTESTING",
  "REJECTED",
  "SHADOW",
  "PAPER",
  "APPROVED_CONTROLLED_LIVE",
  "RETIRED",
] as const;
export type StrategyCandidateStatus = (typeof STRATEGY_CANDIDATE_STATUSES)[number];

export interface AiTraderStrategyCandidate {
  id: StrategyCandidateId;
  parentStrategyVersion: string | null;
  candidateVersion: string;
  hypothesis: string;
  sourceReflectionIds: readonly ReflectionId[];
  status: StrategyCandidateStatus;
  createdAt: string;
}

export function processQualityFrom(processFollowed: boolean, outcomeFavorable: boolean): ProcessQuality {
  if (processFollowed && outcomeFavorable) return "GOOD_PROCESS_GOOD_OUTCOME";
  if (processFollowed && !outcomeFavorable) return "GOOD_PROCESS_BAD_OUTCOME";
  if (!processFollowed && outcomeFavorable) return "BAD_PROCESS_GOOD_OUTCOME";
  return "BAD_PROCESS_BAD_OUTCOME";
}

export function canAiWriteCandidateStatus(status: StrategyCandidateStatus): boolean {
  return status === "PROPOSED";
}
