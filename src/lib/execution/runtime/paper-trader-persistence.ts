import type { ExecutionMode } from "@/lib/execution/execution-mode";
import type { PaperAccountSnapshot } from "@/lib/execution/paper/paper-account-types";
import type { ShadowOpportunityRecord } from "@/lib/execution/shadow/shadow-opportunity";
import type { KillSwitchActivation } from "@/lib/execution/kill-switch/types";
import type { TradingEvent } from "@/lib/execution/events/trading-event";

export const PAPER_TRADER_STORAGE_KEY = "stocksist-paper-trader-v1";

export interface PaperTraderPersistedState {
  version: 1;
  mode: ExecutionMode;
  executionEnabled: boolean;
  startingCash: number;
  account: PaperAccountSnapshot;
  shadowRecords: ShadowOpportunityRecord[];
  processedSignalIds: string[];
  killSwitchActivations: KillSwitchActivation[];
  events: TradingEvent[];
}

export function loadPaperTraderState(): PaperTraderPersistedState | null {
  try {
    const raw = localStorage.getItem(PAPER_TRADER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PaperTraderPersistedState;
    if (parsed?.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePaperTraderState(state: PaperTraderPersistedState): void {
  localStorage.setItem(PAPER_TRADER_STORAGE_KEY, JSON.stringify(state));
}

export function clearPaperTraderState(): void {
  localStorage.removeItem(PAPER_TRADER_STORAGE_KEY);
}
