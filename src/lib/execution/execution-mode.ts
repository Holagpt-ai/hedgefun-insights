/**
 * Central execution modes for Stocksist agentic trading.
 * Broker adapters sit below the router; modes gate whether orders may be sent.
 */

export const EXECUTION_MODES = [
  "observe",
  "paper",
  "live_confirm",
  "live_autonomous",
] as const;

export type ExecutionMode = (typeof EXECUTION_MODES)[number];

/** Sprint 0 default — signals only, never submit orders. */
export const DEFAULT_EXECUTION_MODE: ExecutionMode = "observe";

export function isExecutionMode(value: string): value is ExecutionMode {
  return (EXECUTION_MODES as readonly string[]).includes(value);
}

export function parseExecutionMode(
  value: string | null | undefined,
  fallback: ExecutionMode = DEFAULT_EXECUTION_MODE,
): ExecutionMode {
  if (value && isExecutionMode(value)) return value;
  return fallback;
}

/** Modes that may route to a broker adapter (simulated or live). */
export function executionModePermitsBrokerSubmission(mode: ExecutionMode): boolean {
  return mode === "paper";
}

/** Live paths reserved; Sprint 0 must not enable them. */
export function executionModePermitsLiveSubmission(mode: ExecutionMode): boolean {
  return mode === "live_confirm" || mode === "live_autonomous";
}

export const EXECUTION_MODE_LABEL: Record<ExecutionMode, string> = {
  observe: "Observe",
  paper: "Paper (simulated)",
  live_confirm: "Live (confirm)",
  live_autonomous: "Live (autonomous)",
};
