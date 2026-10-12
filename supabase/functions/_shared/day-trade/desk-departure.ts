/**
 * Desk departure reasons — distinct from Five Pillars expiration labels.
 */

export type DeskDepartureReason =
  | "PILLAR_EXPIRED"
  | "FRESHNESS_DISQUALIFIED"
  | "OPPORTUNITY_BELOW_THRESHOLD"
  | "TOP10_DISPLACED"
  | "DESK_SELECTION_EXCLUDED";

export type DeskAdmissionSnapshot = {
  symbol: string;
  onAuthoritativeDesk: boolean;
  fivePillarsPass: boolean;
  freshnessPass: boolean;
  opportunityEligible: boolean;
  pillarPhaseExpired: boolean;
};

export function classifyDeskDeparture(input: {
  fivePillarsPass: boolean;
  freshnessPass: boolean;
  opportunityEligible: boolean;
  onAuthoritativeDesk: boolean;
  pillarPhaseExpired: boolean;
}): DeskDepartureReason {
  if (input.pillarPhaseExpired || !input.fivePillarsPass) {
    return "PILLAR_EXPIRED";
  }
  if (!input.freshnessPass) return "FRESHNESS_DISQUALIFIED";
  if (!input.opportunityEligible) return "OPPORTUNITY_BELOW_THRESHOLD";
  if (!input.onAuthoritativeDesk) return "TOP10_DISPLACED";
  return "DESK_SELECTION_EXCLUDED";
}

export function deskDepartureLabel(reason: DeskDepartureReason): string {
  switch (reason) {
    case "PILLAR_EXPIRED":
      return "Five Pillars expired";
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
