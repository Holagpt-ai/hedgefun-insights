export type AiTraderOperatingMode =
  | "OFF"
  | "BACKTEST"
  | "SHADOW"
  | "PAPER"
  | "CONTROLLED_LIVE"
  | "LIVE";

/** Sprint 1 has no runtime config. Mode is explicit and is never inferred. */
export const AI_TRADER_CURRENT_OPERATING_MODE: AiTraderOperatingMode = "OFF";

export const AI_TRADER_DASHBOARD_PATH = "/dashboard/ai-trader";
export const AI_TRADER_LEGACY_GAME_PATH = "/dashboard/game";

export const AI_TRADER_OFF_COPY = "AI Trader is not active yet.";
export const AI_TRADER_WAITING_COPY = "AI Trader is waiting for qualifying opportunities.";

const RUNNING_MODES = ["SHADOW", "PAPER", "CONTROLLED_LIVE", "LIVE"] as const;
export type AiTraderRunningMode = (typeof RUNNING_MODES)[number];

const MODE_LABEL: Record<AiTraderOperatingMode, string> = {
  OFF: "Not active",
  BACKTEST: "Backtest",
  SHADOW: "Shadow",
  PAPER: "Paper",
  CONTROLLED_LIVE: "Controlled live",
  LIVE: "Live",
};

export function isAiTraderRunningMode(mode: AiTraderOperatingMode): mode is AiTraderRunningMode {
  return (RUNNING_MODES as readonly string[]).includes(mode);
}

export function aiTraderModeLabel(mode: AiTraderOperatingMode): string {
  return MODE_LABEL[mode];
}

/**
 * OFF and BACKTEST are not a live scan.
 * The waiting sentence is only for a running mode with no qualifying candidate.
 * A running mode that already has a candidate does not use either empty-state sentence.
 */
export function aiTraderEmptyStateCopy(
  mode: AiTraderOperatingMode,
  qualifyingCandidateCount: number,
): string | null {
  if (qualifyingCandidateCount > 0) return null;
  if (isAiTraderRunningMode(mode)) return AI_TRADER_WAITING_COPY;
  return AI_TRADER_OFF_COPY;
}

/** Performance figures stay unreported until a running mode has a real ledger. */
export function aiTraderPerformanceLabel(mode: AiTraderOperatingMode, tradeCount: number): string {
  if (!isAiTraderRunningMode(mode)) return "—";
  return String(tradeCount);
}
