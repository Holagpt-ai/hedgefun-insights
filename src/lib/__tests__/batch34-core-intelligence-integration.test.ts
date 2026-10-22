import { describe, expect, it } from "vitest";
import { buildHistoricalMemoryFromRepeatMoverContext } from "@/lib/ai-analyst/historical-memory";
import { filterPriceAlertToastCandidates, markPriceAlertToastSeenInSession } from "@/lib/price-alerts/toast-delivery";
import { resolveContinuationRvolConfidenceInput } from "@/lib/screeners/continuation-rvol-confidence";
import type { ContinuationInput } from "@/types/continuation";
import type { RepeatMoverContext } from "@/types/repeat-mover";

describe("Batch 34 — core intelligence integration contracts", () => {
  it("preserves forward outcome and intraday evidence on AI Analyst historical memory mapping", () => {
    const context = {
      securityId: "sec-1",
      symbol: "ABC",
      profile: { profileAvailable: true, sampleSizeQuality: "ROBUST" },
      comparableHistory: {
        closestComparableEpisodes: [
          {
            sessionDate: "2026-09-01",
            tier: "NOTABLE",
            direction: "POSITIVE",
            movePct: 5,
            volume: 1_000_000,
            rvol: 2,
            dollarVolume: 10_000_000,
            closePosition: 0.8,
            nextSessionMovePct: 1,
            nextSessionContinuation: true,
            similarity: { movePctDelta: 0.1 },
            historicalEvents: [],
            observedIntradayReconstruction: { completenessState: "PARTIAL", haltCount: 0 },
            observedForwardOutcomes: {
              closeToCloseReturnPct: { D1: 2.5 },
              nextSession: { nextSessionAvailable: true, nextSessionReturnPct: 1.2 },
            },
          },
        ],
        mostRecentComparableEpisode: null,
      },
    } as unknown as RepeatMoverContext;

    const memory = buildHistoricalMemoryFromRepeatMoverContext(context, "ABC");
    const episode = memory.closestComparableEpisodes[0];
    expect(episode?.observedForwardOutcomes?.closeToCloseReturnPct?.D1).toBe(2.5);
    expect(episode?.observedIntradayReconstruction?.completenessState).toBe("PARTIAL");
  });

  it("does not replay price-alert toasts already marked seen in session storage", () => {
    const userId = "user-batch34";
    const row = {
      id: "trigger-1",
      delivery_status: "delivered",
      seen_at: null,
      triggered_at: new Date().toISOString(),
    };
    markPriceAlertToastSeenInSession(userId, row.id);
    const sessionSeen = new Set([row.id]);
    expect(filterPriceAlertToastCandidates([row], sessionSeen)).toHaveLength(0);
  });

  it("propagates RVOL baseline sample size into continuation confidence input", () => {
    const input: ContinuationInput = {
      timeAdjustedRvol: 3.2,
      currentSessionVolume: 1_600_000,
      rvolBaselineVolume: 500_000,
      rvolBaselineSampleSize: 18,
    } as ContinuationInput;
    const resolved = resolveContinuationRvolConfidenceInput(input);
    expect(resolved?.baselineSampleSize).toBe(18);
    expect(resolved?.baselineVolume).toBe(500_000);
  });
});
