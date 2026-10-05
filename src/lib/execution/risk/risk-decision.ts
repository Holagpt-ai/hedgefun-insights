import type { RiskReasonCode } from "@/lib/execution/risk/reason-codes";

export interface RiskDecision {
  id: string;
  tradeIntentId: string;
  approved: boolean;
  reasonCodes: readonly RiskReasonCode[];
  approvedQuantity: number | null;
  approvedNotional: number | null;
  approvedStopPrice: number | null;
  evaluatedAt: string;
}

export function riskDecisionApproved(decision: RiskDecision): boolean {
  return decision.approved && decision.reasonCodes.includes("APPROVED");
}

/** No caller may override a rejection — enforced by router accepting only approved decisions. */
export function assertRiskDecisionApproved(decision: RiskDecision): void {
  if (!riskDecisionApproved(decision)) {
    throw new Error(
      `Risk decision ${decision.id} not approved: ${decision.reasonCodes.join(", ")}`,
    );
  }
}
