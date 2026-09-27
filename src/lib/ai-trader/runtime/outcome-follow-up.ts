import { rejectFutureForwardOutcome } from "@/lib/ai-trader/runtime/lookahead";

export interface HistoricalOutcomeRequest {
  symbol: string;
  discoveredAt: string;
  evaluationHorizonEnd: string;
  cycleNow: string;
}

export interface HistoricalOutcomeObserver {
  observeAfterHorizon(input: HistoricalOutcomeRequest): Promise<Record<string, unknown> | null>;
}

export function createDeferredHistoricalOutcomeObserver(): HistoricalOutcomeObserver {
  return {
    async observeAfterHorizon(input) {
      if (rejectFutureForwardOutcome(Date.parse(input.cycleNow), Date.parse(input.evaluationHorizonEnd))) {
        return null;
      }
      return null;
    },
  };
}
