import type { ContextSnapshotId } from "@/lib/ai-trader/domain/ids";
import type { PositionDecisionAction } from "@/lib/ai-trader/domain/decisions";
import { positionActionIncreasesUnauthorizedRisk } from "@/lib/ai-trader/domain/decisions";
import type { RankedMemory } from "@/lib/ai-trader/memory/retrieval-ranking";

export const CRITIC_VERDICTS = [
  "APPROVE",
  "CHALLENGE",
  "REJECT_RECOMMENDATION",
  "INSUFFICIENT_EVIDENCE",
] as const;
export type TradeCriticVerdict = (typeof CRITIC_VERDICTS)[number];

export interface TradeCriticFinding {
  code: string;
  severity: "info" | "warning" | "blocking";
  evidenceIds: readonly string[];
}

export interface TradeCriticInput {
  contextSnapshotId: ContextSnapshotId | null;
  retrievedMemories: readonly RankedMemory[];
  proposedAction: string;
  orderCapabilityRejected: boolean;
}

export interface TradeCriticResult {
  verdict: TradeCriticVerdict;
  findings: readonly TradeCriticFinding[];
}

export function criticResultAuthorizesExecution(_result: TradeCriticResult): false {
  return false;
}

export function evaluateDeterministicCriticGates(input: TradeCriticInput): TradeCriticResult {
  const findings: TradeCriticFinding[] = [];

  if (input.contextSnapshotId === null) {
    findings.push({ code: "missing_context_snapshot", severity: "blocking", evidenceIds: [] });
    return { verdict: "INSUFFICIENT_EVIDENCE", findings };
  }

  if (input.orderCapabilityRejected) {
    findings.push({ code: "unsupported_order_structure", severity: "blocking", evidenceIds: [] });
    return { verdict: "REJECT_RECOMMENDATION", findings };
  }

  if (positionActionIncreasesUnauthorizedRisk(input.proposedAction)) {
    findings.push({ code: "unauthorized_risk_increase", severity: "blocking", evidenceIds: [] });
    return { verdict: "REJECT_RECOMMENDATION", findings };
  }

  if (input.retrievedMemories.some((memory) => memory.stale)) {
    findings.push({
      code: "stale_memory",
      severity: "warning",
      evidenceIds: input.retrievedMemories.filter((memory) => memory.stale).map((memory) => memory.memoryId),
    });
    return { verdict: "CHALLENGE", findings };
  }

  return { verdict: "APPROVE", findings };
}

export function isAllowedPositionProposal(action: PositionDecisionAction): boolean {
  return !positionActionIncreasesUnauthorizedRisk(action);
}
