import {
  DEFAULT_EXECUTION_MODE,
  type ExecutionMode,
  parseExecutionMode,
} from "@/lib/execution/execution-mode";

/**
 * Runtime execution configuration.
 * Mirrors AI Trader's explicit constant default — never inferred from env in production UI.
 * Tests may override via `configureExecutionForTests`.
 */

let configuredMode: ExecutionMode = DEFAULT_EXECUTION_MODE;

/** When false, router treats all modes as observe-only (system dark). */
let executionSystemEnabled = false;

export function getExecutionMode(): ExecutionMode {
  if (!executionSystemEnabled) return DEFAULT_EXECUTION_MODE;
  return configuredMode;
}

export function isExecutionSystemEnabled(): boolean {
  return executionSystemEnabled;
}

export function resolveExecutionModeFromEnv(): ExecutionMode {
  const raw =
    typeof import.meta !== "undefined" && import.meta.env
      ? (import.meta.env.VITE_STOCKSIST_EXECUTION_MODE as string | undefined)
      : undefined;
  return parseExecutionMode(raw, DEFAULT_EXECUTION_MODE);
}

/** Trusted bootstrap only — not callable from strategy/AI layers in later sprints without review. */
export function configureExecutionRuntime(input: {
  enabled?: boolean;
  mode?: ExecutionMode;
}): void {
  if (input.enabled !== undefined) executionSystemEnabled = input.enabled;
  if (input.mode !== undefined) configuredMode = input.mode;
}

/** Vitest helper — reset to dark / observe defaults. */
export function resetExecutionConfigForTests(): void {
  executionSystemEnabled = false;
  configuredMode = DEFAULT_EXECUTION_MODE;
}
