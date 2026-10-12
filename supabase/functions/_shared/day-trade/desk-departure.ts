/**
 * Desk departure reasons — distinct from Five Pillars expiration labels.
 */

import type { DayTradePillarPhase } from "./qualification-lifecycle.ts";

export type DeskDepartureReason =
  | "PILLAR_EXPIRED"
  | "PILLARS_IN_GRACE"
  | "FRESHNESS_DISQUALIFIED"
  | "OPPORTUNITY_BELOW_THRESHOLD"
  | "TOP10_DISPLACED"
  | "DESK_SELECTION_EXCLUDED";

export function classifyDeskDeparture(input: {
  pillarPhase: DayTradePillarPhase | null;
  fivePillarsPass: boolean;
  freshnessPass: boolean;
  opportunityEligible: boolean;
  onAuthoritativeDesk: boolean;
}): DeskDepartureReason {
  if (input.pillarPhase === "EXPIRED") return "PILLAR_EXPIRED";
  if (input.pillarPhase === "GRACE" || (!input.fivePillarsPass && input.pillarPhase === "ACTIVE")) {
    return "PILLARS_IN_GRACE";
  }
  if (!input.fivePillarsPass) return "PILLARS_IN_GRACE";
  if (!input.freshnessPass) return "FRESHNESS_DISQUALIFIED";
  if (!input.opportunityEligible) return "OPPORTUNITY_BELOW_THRESHOLD";
  if (!input.onAuthoritativeDesk) return "TOP10_DISPLACED";
  return "DESK_SELECTION_EXCLUDED";
}

export function deskDepartureLabel(reason: DeskDepartureReason): string {
  switch (reason) {
    case "PILLAR_EXPIRED":
      return "Five Pillars expired";
    case "PILLARS_IN_GRACE":
      return "Five Pillars under review (grace)";
    case "FRESHNESS_DISQUALIFIED":
      return "Freshness disqualification";
    case "OPPORTUNITY_BELOW_THRESHOLD":
      return "Opportunity score below desk threshold";
    case "TOP10_DISPLACED":
      return "Top-10 displacement";
    default:
      return "Desk selection exclusion";
  }
}
