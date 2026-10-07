import { describe, expect, it } from "vitest";
import {
  compareOpportunitiesNewestFirst,
  sortShadowOpportunitiesForDisplay,
} from "@/lib/execution/observation/opportunity-display-order";
import { buildSymbolTimeline } from "@/lib/execution/observation/session-review";
import type { ShadowOpportunityRecord } from "@/lib/execution/shadow/shadow-opportunity";

function row(partial: {
  id: string;
  signalAt: string;
  symbol?: string;
}): ShadowOpportunityRecord {
  return {
    signal: {
      id: partial.id,
      symbol: partial.symbol ?? "AAA",
      strategyId: "DAY_TRADE_RADAR_V1",
      side: "buy",
      triggerPrice: 10,
      suggestedQuantity: 1,
      suggestedNotional: null,
      stopLossPrice: 9,
      profitTargetPrice: 11,
      eventType: "RUNNING_UP",
      catalystId: null,
      volume: 1_000_000,
      rvol: 2,
      momentumScore: null,
      aboveVwap: null,
      hodProximityPct: null,
      floatTurnover: null,
      historicalContext: null,
      thesisSummary: null,
      signalAt: partial.signalAt,
      metadata: {},
    },
    plan: { stopLossPrice: 9, profitTargetPrice: 11 },
    orchestratorResult: null as ShadowOpportunityRecord["orchestratorResult"],
    status: "APPROVED",
    rejectionReasons: ["APPROVED"],
    paperOrderId: null,
    entryPrice: null,
    exitPrice: null,
    exitReason: null,
    realizedPnl: null,
    recordedAt: "2026-10-07T16:00:00.000Z",
  };
}

describe("AI Trader opportunity display order", () => {
  it("sorts opportunities newest signal first", () => {
    const unsorted = [
      row({ id: "a", signalAt: "2026-10-07T10:30:00.000Z" }),
      row({ id: "b", signalAt: "2026-10-07T16:56:00.000Z" }),
      row({ id: "c", signalAt: "2026-10-07T12:54:00.000Z" }),
    ];
    const sorted = sortShadowOpportunitiesForDisplay(unsorted);
    expect(sorted.map((r) => r.signal.id)).toEqual(["b", "c", "a"]);
  });

  it("orders mixed premarket and RTH timestamps correctly", () => {
    const unsorted = [
      row({ id: "premarket", signalAt: "2026-10-07T11:00:00.000Z" }),
      row({ id: "rth", signalAt: "2026-10-07T16:51:00.000Z" }),
      row({ id: "early", signalAt: "2026-10-07T10:05:00.000Z" }),
    ];
    const sorted = sortShadowOpportunitiesForDisplay(unsorted);
    expect(sorted.map((r) => r.signal.id)).toEqual(["rth", "premarket", "early"]);
  });

  it("places missing or invalid timestamps after valid rows", () => {
    const withMissing = [
      row({ id: "bad", signalAt: "not-a-date" }),
      row({ id: "good", signalAt: "2026-10-07T14:00:00.000Z" }),
      row({ id: "empty", signalAt: "" }),
    ];
    const sorted = sortShadowOpportunitiesForDisplay(withMissing);
    expect(sorted[0]?.signal.id).toBe("good");
    expect(sorted.slice(1).map((r) => r.signal.id).sort()).toEqual(["bad", "empty"]);
    expect(compareOpportunitiesNewestFirst(withMissing[1], withMissing[0])).toBeLessThan(0);
  });

  it("keeps symbol timeline oldest-first", () => {
    const shadows = [
      row({ id: "s1", signalAt: "2026-10-07T16:00:00.000Z", symbol: "ZZZ" }),
    ];
    const timeline = buildSymbolTimeline(
      "ZZZ",
      [
        {
          eventId: "e1",
          correlationId: "s1",
          timestamp: "2026-10-07T16:05:00.000Z",
          symbol: "ZZZ",
          strategyId: "S",
          eventType: "RISK_APPROVED",
          stateBefore: null,
          stateAfter: null,
          tradeIntentId: "t1",
          riskDecisionId: null,
          orderId: null,
          positionId: null,
          reasonCodes: ["APPROVED"],
          payload: {},
          metadata: {},
        },
      ],
      shadows,
    );
    expect(timeline[0]?.timestamp).toBe("2026-10-07T16:00:00.000Z");
    expect(timeline[timeline.length - 1]?.timestamp).toBe("2026-10-07T16:05:00.000Z");
  });
});
