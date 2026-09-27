import type { AiTraderStrategyCandidate } from "@/lib/ai-trader/domain/reflections";
import { canAiWriteCandidateStatus } from "@/lib/ai-trader/domain/reflections";

export interface StrategyResearchEngine {
  proposeStrategyCandidate(hypothesis: string, sourceReflectionIds: readonly string[]): Promise<AiTraderStrategyCandidate>;
  evaluateStrategyCandidate(candidate: AiTraderStrategyCandidate): Promise<AiTraderStrategyCandidate>;
}

export function proposedCandidateDraft(
  hypothesis: string,
  sourceReflectionIds: readonly string[],
  createdAt: string,
): Omit<AiTraderStrategyCandidate, "id"> {
  return {
    parentStrategyVersion: null,
    candidateVersion: "proposed",
    hypothesis,
    sourceReflectionIds,
    status: "PROPOSED",
    createdAt,
  };
}

export function researchMaySetStatus(status: AiTraderStrategyCandidate["status"]): boolean {
  return canAiWriteCandidateStatus(status);
}
