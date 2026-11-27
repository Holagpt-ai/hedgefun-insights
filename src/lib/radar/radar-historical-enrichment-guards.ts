import type { RepeatMoversLoadState } from "@/lib/radar/repeat-movers-load-state";

export function shouldApplyRadarHistoricalFailureState(input: {
  cancelled: boolean;
  tabId: string;
  expectedTabId: string;
  pollGeneration: number;
  activePollGeneration: number;
  repeatMoversLoadState: RepeatMoversLoadState;
}): boolean {
  if (input.cancelled) return false;
  if (input.tabId !== input.expectedTabId) return false;
  if (input.pollGeneration !== input.activePollGeneration) return false;
  if (input.repeatMoversLoadState.status === "ready") return false;
  return true;
}