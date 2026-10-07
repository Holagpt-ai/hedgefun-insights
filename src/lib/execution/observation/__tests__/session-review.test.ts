import { describe, expect, it, vi } from "vitest";
import {
  buildSymbolTimeline,
  computeRejectionBreakdown,
  computeSessionSummary,
  computeSetupBreakdown,
  listMissedOpportunities,
} from "@/lib/execution/observation/session-review";
import type { ShadowOpportunityRecord } from "@/lib/execution/shadow/shadow-opportunity";
import type { TradingEvent } from "@/lib/execution/events/trading-event";
import type { PaperAccountSnapshot } from "@/lib/execution/paper/paper-account-types";
import {
  loadPaperTraderState,
  savePaperTraderState,
  clearPaperTraderState,
  PAPER_TRADER_STORAGE_KEY,
} from "@/lib/execution/runtime/paper-trader-persistence";
import { PaperTraderSession } from "@/lib/execution/runtime/paper-trader-session";

function emptyAccount(): PaperAccountSnapshot {
  return {
    startingCash: 100_000,
    cash: 100_000,
    buyingPower: 100_000,
    equity: 100_000,
    realizedPnl: 0,
    unrealizedPnl: 0,
    openPositions: [],
    closedTrades: [],
  };
}

function shadow(partial: Partial<ShadowOpportunityRecord> & Pick<ShadowOpportunityRecord, "signal">): ShadowOpportunityRecord {
  return {
    plan: { stopLossPrice: 9, profitTargetPrice: 11 },
    orchestratorResult: {
      status: "risk_rejected",
      tradeIntentId: "t1",
      correlationId: partial.signal.id,
      executionMode: "observe",
      riskDecision: null,
      routerResult: null,
      orderId: null,
      reasonCodes: ["EXECUTION_MODE_OBSERVE"],
    },
    status: "REJECTED",
    rejectionReasons: ["EXECUTION_MODE_OBSERVE"],
    paperOrderId: null,
    entryPrice: null,
    exitPrice: null,
    exitReason: null,
    realizedPnl: null,
    recordedAt: "2026-10-07T13:41:08.000Z",
    ...partial,
  };
}

describe("session review calculations", () => {
  it("summarizes opportunities, approvals, and rejections", () => {
    const shadows: ShadowOpportunityRecord[] = [
      shadow({
        signal: {
          id: "s1",
          symbol: "AAA",
          strategyId: "DAY_TRADE_RADAR_V1",
          side: "buy",
          triggerPrice: 10,
          suggestedQuantity: 10,
          suggestedNotional: null,
          stopLossPrice: 9,
          profitTargetPrice: 11,
          eventType: "RUNNING_UP",
          catalystId: null,
          volume: 1_000_000,
          rvol: 3,
          momentumScore: null,
          aboveVwap: true,
          hodProximityPct: 1,
          floatTurnover: null,
          historicalContext: null,
          thesisSummary: null,
          signalAt: "2026-10-07T13:41:03.000Z",
          metadata: { scannerEvent: "RUNNING_UP" },
        },
        rejectionReasons: ["APPROVED"],
        status: "OBSERVING",
      }),
      shadow({
        signal: {
          id: "s2",
          symbol: "BBB",
          strategyId: "DAY_TRADE_RADAR_V1",
          side: "buy",
          triggerPrice: 20,
          suggestedQuantity: 5,
          suggestedNotional: null,
          stopLossPrice: 19,
          profitTargetPrice: 22,
          eventType: "VOLUME_EXPLOSION",
          catalystId: null,
          volume: 500_000,
          rvol: 2,
          momentumScore: null,
          aboveVwap: null,
          hodProximityPct: null,
          floatTurnover: null,
          historicalContext: null,
          thesisSummary: null,
          signalAt: "2026-10-07T13:42:00.000Z",
          metadata: { scannerEvent: "VOLUME_EXPLOSION" },
        },
      }),
    ];
    const summary = computeSessionSummary(shadows, emptyAccount());
    expect(summary.opportunities).toBe(2);
    expect(summary.approved).toBe(1);
    expect(summary.rejected).toBe(1);
  });

  it("counts rejection reasons excluding APPROVED", () => {
    const shadows = [
      shadow({
        signal: { id: "a", symbol: "X", strategyId: "S", side: "buy", triggerPrice: 1, suggestedQuantity: 1, suggestedNotional: null, stopLossPrice: null, profitTargetPrice: null, eventType: null, catalystId: null, volume: null, rvol: null, momentumScore: null, aboveVwap: null, hodProximityPct: null, floatTurnover: null, historicalContext: null, thesisSummary: null, signalAt: "2026-10-07T13:00:00Z", metadata: {} },
        rejectionReasons: ["DUPLICATE_ORDER", "MAX_OPEN_POSITIONS"],
      }),
      shadow({
        signal: { id: "b", symbol: "Y", strategyId: "S", side: "buy", triggerPrice: 1, suggestedQuantity: 1, suggestedNotional: null, stopLossPrice: null, profitTargetPrice: null, eventType: null, catalystId: null, volume: null, rvol: null, momentumScore: null, aboveVwap: null, hodProximityPct: null, floatTurnover: null, historicalContext: null, thesisSummary: null, signalAt: "2026-10-07T13:01:00Z", metadata: {} },
        rejectionReasons: ["DUPLICATE_ORDER"],
      }),
    ];
    const breakdown = computeRejectionBreakdown(shadows);
    expect(breakdown.find((r) => r.code === "DUPLICATE_ORDER")?.count).toBe(2);
    expect(breakdown.find((r) => r.code === "MAX_OPEN_POSITIONS")?.count).toBe(1);
  });

  it("groups setup breakdown by scanner event", () => {
    const sig = {
      id: "s1",
      symbol: "NVDA",
      strategyId: "DAY_TRADE_RADAR_V1",
      side: "buy" as const,
      triggerPrice: 10,
      suggestedQuantity: 1,
      suggestedNotional: null,
      stopLossPrice: null,
      profitTargetPrice: null,
      eventType: "RUNNING_UP",
      catalystId: null,
      volume: null,
      rvol: null,
      momentumScore: null,
      aboveVwap: null,
      hodProximityPct: null,
      floatTurnover: null,
      historicalContext: null,
      thesisSummary: null,
      signalAt: "2026-10-07T13:00:00Z",
      metadata: { scannerEvent: "RUNNING_UP" },
    };
    const rows = computeSetupBreakdown([shadow({ signal: sig, rejectionReasons: ["APPROVED"], status: "OBSERVING" })]);
    expect(rows[0]?.setupKey).toBe("RUNNING_UP");
    expect(rows[0]?.opportunities).toBe(1);
  });

  it("orders symbol timeline chronologically", () => {
    const events: TradingEvent[] = [
      {
        eventId: "e1",
        correlationId: "s1",
        timestamp: "2026-10-07T13:41:15.000Z",
        symbol: "AAA",
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
    ];
    const shadows = [
      shadow({
        signal: {
          id: "s1",
          symbol: "AAA",
          strategyId: "S",
          side: "buy",
          triggerPrice: 10,
          suggestedQuantity: 1,
          suggestedNotional: null,
          stopLossPrice: null,
          profitTargetPrice: null,
          eventType: "VOLUME_EXPLOSION",
          catalystId: null,
          volume: null,
          rvol: null,
          momentumScore: null,
          aboveVwap: null,
          hodProximityPct: null,
          floatTurnover: null,
          historicalContext: null,
          thesisSummary: null,
          signalAt: "2026-10-07T13:41:03.000Z",
          metadata: { scannerEvent: "VOLUME_EXPLOSION" },
        },
        rejectionReasons: ["APPROVED"],
      }),
    ];
    const timeline = buildSymbolTimeline("AAA", events, shadows);
    expect(timeline[0]?.label).toBe("VOLUME_EXPLOSION");
    expect(timeline[timeline.length - 1]?.label).toBe("Risk approved");
  });

  it("lists misses for rejected opportunities", () => {
    const misses = listMissedOpportunities([
      shadow({
        signal: {
          id: "s1",
          symbol: "ZZZ",
          strategyId: "S",
          side: "buy",
          triggerPrice: 1,
          suggestedQuantity: 1,
          suggestedNotional: null,
          stopLossPrice: null,
          profitTargetPrice: null,
          eventType: null,
          catalystId: null,
          volume: null,
          rvol: null,
          momentumScore: null,
          aboveVwap: null,
          hodProximityPct: null,
          floatTurnover: null,
          historicalContext: null,
          thesisSummary: null,
          signalAt: "2026-10-07T13:00:00Z",
          metadata: {},
        },
      }),
    ]);
    expect(misses).toHaveLength(1);
    expect(misses[0]?.symbol).toBe("ZZZ");
  });
});

describe("paper trader persistence restore", () => {
  it("round-trips shadow records and events for session review", () => {
    const storage = new Map<string, string>();
    const ls = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => { storage.set(k, v); },
      removeItem: (k: string) => { storage.delete(k); },
    };
    vi.stubGlobal("localStorage", ls);

    const session = new PaperTraderSession({ startingCash: 50_000 });
    savePaperTraderState(session.exportPersistedState());

    const restored = new PaperTraderSession({
      persisted: loadPaperTraderState(),
    });
    expect(restored.getAccount().startingCash).toBe(50_000);
    expect(restored.getAllEvents()).toEqual(session.getAllEvents());

    clearPaperTraderState();
    expect(storage.has(PAPER_TRADER_STORAGE_KEY)).toBe(false);
    vi.unstubAllGlobals();
  });
});
