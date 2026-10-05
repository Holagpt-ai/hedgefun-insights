import type { StrategyState } from "@/lib/execution/strategy/states";

export class StrategyStateTransitionError extends Error {
  readonly from: StrategyState;
  readonly to: StrategyState;

  constructor(from: StrategyState, to: StrategyState) {
    super(`Invalid strategy state transition: ${from} → ${to}`);
    this.name = "StrategyStateTransitionError";
    this.from = from;
    this.to = to;
  }
}

/** Explicit allowed transitions — no arbitrary jumps. */
const VALID_TRANSITIONS: Readonly<Record<StrategyState, readonly StrategyState[]>> = {
  DISCOVERED: ["QUALIFIED", "INVALIDATED", "REJECTED", "ERROR"],
  QUALIFIED: ["WATCHING", "INVALIDATED", "REJECTED", "ERROR"],
  WATCHING: ["ARMED", "INVALIDATED", "REJECTED", "HALTED", "KILLED", "ERROR"],
  ARMED: ["TRIGGERED", "WATCHING", "INVALIDATED", "REJECTED", "HALTED", "KILLED", "ERROR"],
  TRIGGERED: ["RISK_CHECK", "INVALIDATED", "REJECTED", "HALTED", "KILLED", "ERROR"],
  RISK_CHECK: ["ORDER_PENDING", "REJECTED", "INVALIDATED", "HALTED", "KILLED", "ERROR"],
  ORDER_PENDING: ["ENTERED", "REJECTED", "ERROR", "KILLED"],
  ENTERED: ["MANAGING", "EXIT_PENDING", "ERROR", "KILLED"],
  MANAGING: ["EXIT_PENDING", "ERROR", "KILLED"],
  EXIT_PENDING: ["EXITED", "ERROR", "KILLED"],
  EXITED: ["COOLDOWN", "ERROR"],
  COOLDOWN: ["DISCOVERED", "WATCHING", "ERROR"],
  INVALIDATED: [],
  REJECTED: [],
  HALTED: ["WATCHING", "KILLED", "ERROR"],
  KILLED: [],
  ERROR: [],
};

export function allowedStrategyTransitions(from: StrategyState): readonly StrategyState[] {
  return VALID_TRANSITIONS[from] ?? [];
}

export function canTransitionStrategyState(from: StrategyState, to: StrategyState): boolean {
  return allowedStrategyTransitions(from).includes(to);
}

export function assertStrategyTransition(from: StrategyState, to: StrategyState): void {
  if (!canTransitionStrategyState(from, to)) {
    throw new StrategyStateTransitionError(from, to);
  }
}

export function transitionStrategyState(from: StrategyState, to: StrategyState): StrategyState {
  assertStrategyTransition(from, to);
  return to;
}

/** Happy-path lifecycle for documentation and tests. */
export const CATALYST_MOMENTUM_HAPPY_PATH: readonly StrategyState[] = [
  "DISCOVERED",
  "QUALIFIED",
  "WATCHING",
  "ARMED",
  "TRIGGERED",
  "RISK_CHECK",
  "ORDER_PENDING",
  "ENTERED",
  "MANAGING",
  "EXIT_PENDING",
  "EXITED",
  "COOLDOWN",
];
