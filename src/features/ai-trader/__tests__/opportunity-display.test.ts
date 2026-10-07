import { describe, expect, it } from "vitest";
import {
  formatOpportunityIntelLine,
  formatObservationalRiskLabel,
  formatRejectionSummary,
} from "@/features/ai-trader/opportunity-display";
import type { StocksistSignal } from "@/lib/execution/signal/stocksist-signal";

describe("formatOpportunityIntelLine", () => {
  it("joins scanner and participation metadata without fabricating missing fields", () => {
    const signal: StocksistSignal = {
      id: "s1",
      symbol: "MRVL",
      strategyId: "DAY_TRADE_RADAR_V1",
      side: "buy",
      triggerPrice: 80,
      suggestedQuantity: 10,
      suggestedNotional: null,
      stopLossPrice: 77,
      profitTargetPrice: 84,
      eventType: "RUNNING_UP",
      catalystId: null,
      volume: 1_000_000,
      rvol: 3.2,
      momentumScore: null,
      aboveVwap: true,
      hodProximityPct: 1.2,
      floatTurnover: null,
      historicalContext: null,
      thesisSummary: null,
      signalAt: new Date().toISOString(),
      metadata: {
        scannerEventLabel: "Running up",
        rvol5m: 4.1,
        volumeVelocity: 55_000,
        volumeAccelerationState: "ACCELERATING",
        vwapState: "above",
        hodState: 0.8,
        historicalMatchSummary: {
          matchCount: 2,
          continuationCount: 1,
          continuationRate: 0.5,
          medianNextSessionReturn: null,
          medianMfe: null,
          medianMae: null,
          positiveOutcomeRate: null,
          sampleQuality: "LIMITED",
          topMatches: [],
          strongestComparableDates: [],
        },
      },
    };
    const line = formatOpportunityIntelLine(signal);
    expect(line).toMatch(/Running up/);
    expect(line).toMatch(/5m 4\.1×/);
    expect(line).toMatch(/ACCELERATING/);
    expect(line).toMatch(/2 matches/);
  });

  it("returns honest unavailable when metadata is empty", () => {
    const signal = { metadata: {} } as StocksistSignal;
    expect(formatOpportunityIntelLine(signal)).toBe("Intelligence unavailable");
  });
});

describe("formatRejectionSummary", () => {
  it("labels approved vs rejected", () => {
    expect(formatRejectionSummary([])).toBe("Approved");
    expect(formatRejectionSummary(["APPROVED"])).toBe("Approved");
  });
});

describe("formatObservationalRiskLabel", () => {
  it("shows WOULD APPROVE / WOULD REJECT for observe rows", () => {
    expect(formatObservationalRiskLabel({ status: "APPROVED", rejectionReasons: ["APPROVED"] })).toBe(
      "WOULD APPROVE",
    );
    expect(
      formatObservationalRiskLabel({ status: "REJECTED", rejectionReasons: ["MAX_EXPOSURE"] }),
    ).toMatch(/^WOULD REJECT/);
  });
});
