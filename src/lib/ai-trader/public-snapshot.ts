import {
  AI_TRADER_CURRENT_OPERATING_MODE,
  aiTraderEmptyStateCopy,
  type AiTraderOperatingMode,
} from "@/lib/ai-trader/operating-mode";

const EMPTY: readonly string[] = [];

/**
 * Public and dashboard projection for this sprint.
 * Lists stay empty because no scanner, watchlist, or ledger is connected.
 */
export interface AiTraderShellSnapshot {
  operatingMode: AiTraderOperatingMode;
  statusCopy: string;
  scannedSymbols: readonly string[];
  watchlist: readonly string[];
  positions: readonly string[];
  activity: readonly string[];
  trades: readonly string[];
  pnl: null;
  capitalDeployed: null;
  tradeCount: number;
}

export function createAiTraderShellSnapshot(
  mode: AiTraderOperatingMode = AI_TRADER_CURRENT_OPERATING_MODE,
): AiTraderShellSnapshot {
  const statusCopy = aiTraderEmptyStateCopy(mode, 0);
  if (statusCopy === null) {
    throw new Error("AI Trader shell snapshot requires an empty-state sentence.");
  }
  return {
    operatingMode: mode,
    statusCopy,
    scannedSymbols: EMPTY,
    watchlist: EMPTY,
    positions: EMPTY,
    activity: EMPTY,
    trades: EMPTY,
    pnl: null,
    capitalDeployed: null,
    tradeCount: 0,
  };
}

export const AI_TRADER_SHELL_SNAPSHOT = createAiTraderShellSnapshot(AI_TRADER_CURRENT_OPERATING_MODE);
