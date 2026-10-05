export const STRATEGY_LIFECYCLE_STATES = [
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
] as const;

export type StrategyLifecycleState = (typeof STRATEGY_LIFECYCLE_STATES)[number];

export const STRATEGY_TERMINAL_STATES = [
  "INVALIDATED",
  "REJECTED",
  "HALTED",
  "KILLED",
  "ERROR",
] as const;

export type StrategyTerminalState = (typeof STRATEGY_TERMINAL_STATES)[number];

export type StrategyState = StrategyLifecycleState | StrategyTerminalState;

export const STRATEGY_STATES = [
  ...STRATEGY_LIFECYCLE_STATES,
  ...STRATEGY_TERMINAL_STATES,
] as const;

export function isStrategyState(value: string): value is StrategyState {
  return (STRATEGY_STATES as readonly string[]).includes(value);
}
