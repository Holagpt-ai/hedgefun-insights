/** New-entry proposals. These do not authorize an order. */
export type EntryDecisionAction = "ENTER" | "WAIT" | "PASS";

/**
 * Open-position proposals. These do not authorize an order.
 * They cannot increase risk: there is no add, scale-in, or widen-stop action.
 * Any later execution still requires the Risk Governor, the approved plan,
 * the Protective Order Manager, the Order Capability Registry, reconciliation,
 * and the kill switch.
 */
export const POSITION_DECISION_ACTIONS = [
  "HOLD",
  "REDUCE",
  "EXIT",
  "TAKE_PARTIAL",
  "TIGHTEN_STOP",
  "ACTIVATE_TRAIL",
] as const;

export type PositionDecisionAction = (typeof POSITION_DECISION_ACTIONS)[number];

const RISK_INCREASING_ACTIONS = ["ADD", "SCALE_IN", "WIDEN_STOP", "INCREASE_RISK"] as const;

export function isPositionDecisionAction(value: string): value is PositionDecisionAction {
  return (POSITION_DECISION_ACTIONS as readonly string[]).includes(value);
}

export function positionActionIncreasesUnauthorizedRisk(action: string): boolean {
  return (RISK_INCREASING_ACTIONS as readonly string[]).includes(action);
}
