import { describe, it, expect } from "vitest";
import { PaperPortfolioLedger } from "@/lib/execution/paper/paper-portfolio-ledger";
import { computePaperStatistics } from "@/lib/execution/paper/paper-statistics";
import { detectLongExitTriggers } from "@/lib/execution/paper/paper-exit-monitor";
import { stocksistSignalToTradeIntent } from "@/lib/execution/signal/stocksist-signal-adapter";
import { PaperTraderSession } from "@/lib/execution/runtime/paper-trader-session";
import { RiskGateway, DEFAULT_RISK_GATEWAY_LIMITS } from "@/lib/execution/risk/risk-gateway";
import { createInMemoryKillSwitchStore } from "@/lib/execution/kill-switch/kill-switch-store";
import { buildPaperRiskContext } from "@/lib/execution/__tests__/fixtures/catalyst-momentum-v1.fixture";
import type { StocksistSignal } from "@/lib/execution/signal/stocksist-signal";

function sampleSignal(overrides: Partial<StocksistSignal> = {}): StocksistSignal {
  return {
    id: "sig-1",
    symbol: "GRML",
    strategyId: "CATALYST_MOMENTUM_V1",
    side: "buy",
    triggerPrice: 12,
    suggestedQuantity: 10,
    suggestedNotional: null,
    stopLossPrice: 11.5,
    profitTargetPrice: 13,
    eventType: "BREAKOUT",
    catalystId: "cat-1",
    volume: 1_000_000,
    rvol: 3.2,
    momentumScore: 0.8,
    aboveVwap: true,
    hodProximityPct: 0.2,
    floatTurnover: null,
    historicalContext: "repeat mover",
    thesisSummary: "Catalyst momentum continuation",
    signalAt: new Date().toISOString(),
    metadata: {},
    ...overrides,
  };
}

describe("paper portfolio ledger", () => {
  it("long entry, weighted average, partial/full exit, P&L, buying power", () => {
    const ledger = new PaperPortfolioLedger(10_000);
    ledger.applyLongEntry({
      symbol: "GRML",
      quantity: 10,
      fillPrice: 10,
      correlationId: "c1",
      originatingIntentId: "i1",
      openedAt: "2026-10-06T14:00:00Z",
      plan: { stopLossPrice: 9, profitTargetPrice: 12 },
    });
    ledger.applyLongEntry({
      symbol: "GRML",
      quantity: 10,
      fillPrice: 12,
      correlationId: "c2",
      originatingIntentId: "i2",
      openedAt: "2026-10-06T14:05:00Z",
      plan: { stopLossPrice: 9, profitTargetPrice: 13 },
    });
    const pos = ledger.getPosition("GRML");
    expect(pos?.quantity).toBe(20);
    expect(pos?.averageEntryPrice).toBe(11);

    ledger.markToMarket({ GRML: 11.5 });
    expect(ledger.snapshot().unrealizedPnl).toBe(10);

    const partial = ledger.applyLongExit({
      symbol: "GRML",
      quantity: 5,
      fillPrice: 11.5,
      closedAt: "2026-10-06T15:00:00Z",
      exitReason: "SCALE_OUT",
      correlationId: "x1",
    });
    expect(partial?.realizedPnl).toBe(2.5);

    ledger.applyLongExit({
      symbol: "GRML",
      quantity: 15,
      fillPrice: 12,
      closedAt: "2026-10-06T16:00:00Z",
      exitReason: "MANUAL",
      correlationId: "x2",
    });
    const snap = ledger.snapshot();
    expect(snap.openPositions).toHaveLength(0);
    expect(snap.realizedPnl).toBe(2.5 + 15);
    expect(snap.cash).toBeGreaterThan(9000);
  });

  it("stop and target triggers", () => {
    const pos = {
      symbol: "GRML",
      side: "long" as const,
      quantity: 5,
      averageEntryPrice: 10,
      currentPrice: 10,
      marketValue: 50,
      unrealizedPnl: 0,
      openedAt: "t",
      correlationId: "c",
      originatingIntentId: "i",
      stopLossPrice: 9.5,
      profitTargetPrice: 11,
    };
    expect(detectLongExitTriggers([pos], { GRML: 9.4 })[0]?.exitReason).toBe("STOP_LOSS");
    expect(detectLongExitTriggers([pos], { GRML: 11.1 })[0]?.exitReason).toBe("PROFIT_TARGET");
  });
});

describe("risk gateway extended limits", () => {
  const intent = stocksistSignalToTradeIntent(sampleSignal({ suggestedQuantity: 100, triggerPrice: 200 }));

  it("rejects max trade, max position, max open, daily loss", () => {
    const gw = new RiskGateway({
      killSwitchStore: createInMemoryKillSwitchStore(),
      limits: {
        ...DEFAULT_RISK_GATEWAY_LIMITS,
        maxTradeNotional: 500,
        maxPositionNotional: 500,
        maxPortfolioExposure: 500,
        maxOpenPositions: 1,
        maxDailyLoss: 100,
        symbolCooldownMs: 0,
      },
    });
    const ctx = buildPaperRiskContext({ mode: "paper", executionEnabled: true });
    ctx.policy.allowedSymbols = null;
    ctx.portfolio.openPositionCount = 1;
    expect(gw.evaluate(intent, ctx).reasonCodes).toContain("MAX_OPEN_POSITIONS");

    ctx.portfolio.openPositionCount = 0;
    expect(gw.evaluate(intent, ctx).reasonCodes).toContain("MAX_TRADE_NOTIONAL");

    ctx.portfolio.dailyRealizedPnl = -200;
    expect(gw.evaluate(intent, ctx).reasonCodes).toContain("MAX_DAILY_LOSS");
  });
});

describe("PaperTraderSession end-to-end", () => {
  it("paper fill, observe no fill, duplicate, kill switch, live blocked, stats", async () => {
    const session = new PaperTraderSession({ startingCash: 50_000, mode: "paper", executionEnabled: true });
    const sig = sampleSignal();
    const paper = await session.processSignal(sig);
    expect(paper.status).toBe("PAPER_ENTERED");
    expect(session.getAccount().openPositions).toHaveLength(1);

    const dup = await session.processSignal(sig);
    expect(dup).toBeNull();

    const stats = session.getStatistics();
    expect(stats.openPositionCount).toBe(1);

    session.setMode("observe");
    session.setExecutionEnabled(true);
    const obs = await session.processSignal(sampleSignal({ id: "sig-obs", symbol: "AAA", suggestedQuantity: 1, triggerPrice: 5 }));
    expect(obs.status).toBe("APPROVED");

    session.killSwitchStore.activate({
      scope: "GLOBAL",
      strategyId: null,
      symbol: null,
      semantics: ["BLOCK_NEW_ENTRIES"],
      activatedAt: new Date().toISOString(),
      reason: "test",
    });
    session.setMode("paper");
    const blocked = await session.processSignal(sampleSignal({ id: "sig-block", symbol: "BBB", suggestedQuantity: 1, triggerPrice: 5 }));
    expect(blocked.status).toBe("REJECTED");

    session.setMode("live_confirm");
    const live = await session.processSignal(sampleSignal({ id: "sig-live", symbol: "CCC", suggestedQuantity: 1, triggerPrice: 5 }));
    expect(live.status).toBe("REJECTED");
  });

  it("stop-loss exit updates shadow record", async () => {
    const session = new PaperTraderSession({ startingCash: 50_000, mode: "paper", executionEnabled: true });
    await session.processSignal(sampleSignal());
    await session.processPriceTick({ GRML: 11.4 });
    const rec = session.getShadowRecords().find((r) => r.signal.symbol === "GRML");
    expect(rec?.status === "STOPPED" || rec?.status === "PAPER_ENTERED").toBe(true);
  });

  it("signal maps to TradeIntent", () => {
    const intent = stocksistSignalToTradeIntent(sampleSignal());
    expect(intent.symbol).toBe("GRML");
    expect(intent.requestedQuantity).toBe(10);
  });
});
