import type { TradeIntent } from "@/lib/execution/intent/trade-intent";
import type { TradeExecutionPlan } from "@/lib/execution/paper/trade-execution-plan";
import type { StocksistSignal } from "@/lib/execution/signal/stocksist-signal";

export function stocksistSignalToTradeIntent(signal: StocksistSignal): TradeIntent {
  return {
    id: `intent-${signal.id}`,
    correlationId: signal.id,
    symbol: signal.symbol.toUpperCase(),
    strategyId: signal.strategyId,
    side: signal.side,
    intentType: "entry",
    triggerPrice: signal.triggerPrice,
    invalidationPrice: signal.stopLossPrice,
    requestedQuantity: signal.suggestedQuantity,
    requestedNotional: signal.suggestedNotional,
    marketSnapshotId: `snap-${signal.id}`,
    catalystId: signal.catalystId,
    historicalBehaviorProfileId: null,
    generatedAt: signal.signalAt,
    metadata: {
      ...signal.metadata,
      eventType: signal.eventType,
      volume: signal.volume,
      rvol: signal.rvol,
      momentumScore: signal.momentumScore,
      aboveVwap: signal.aboveVwap,
      hodProximityPct: signal.hodProximityPct,
      floatTurnover: signal.floatTurnover,
      historicalContext: signal.historicalContext,
      thesisSummary: signal.thesisSummary,
    },
  };
}

export function stocksistSignalToExecutionPlan(signal: StocksistSignal): TradeExecutionPlan {
  return {
    stopLossPrice: signal.stopLossPrice,
    profitTargetPrice: signal.profitTargetPrice,
  };
}

export function buildExitIntent(input: {
  positionIntentId: string;
  correlationId: string;
  symbol: string;
  strategyId: string;
  quantity: number;
  triggerPrice: number;
  exitReason: string;
}): TradeIntent {
  return {
    id: `intent-exit-${input.correlationId}-${input.exitReason}`,
    correlationId: input.correlationId,
    symbol: input.symbol.toUpperCase(),
    strategyId: input.strategyId,
    side: "sell",
    intentType: input.quantity > 0 ? "exit" : "scale_out",
    triggerPrice: input.triggerPrice,
    invalidationPrice: null,
    requestedQuantity: input.quantity,
    requestedNotional: null,
    marketSnapshotId: null,
    catalystId: null,
    historicalBehaviorProfileId: null,
    generatedAt: new Date().toISOString(),
    metadata: { exitReason: input.exitReason },
  };
}
