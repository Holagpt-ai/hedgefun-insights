import type {
  ClosedPaperTrade,
  PaperAccountSnapshot,
  PaperExitReason,
  PaperPosition,
} from "@/lib/execution/paper/paper-account-types";
import type { TradeExecutionPlan } from "@/lib/execution/paper/trade-execution-plan";

export class PaperPortfolioLedger {
  private startingCash: number;
  private cash: number;
  private readonly positions = new Map<string, PaperPosition>();
  private readonly closedTrades: ClosedPaperTrade[] = [];

  constructor(startingCash: number) {
    this.startingCash = startingCash;
    this.cash = startingCash;
  }

  snapshot(): PaperAccountSnapshot {
    const openPositions = [...this.positions.values()];
    const unrealizedPnl = openPositions.reduce((s, p) => s + p.unrealizedPnl, 0);
    const marketValue = openPositions.reduce((s, p) => s + p.marketValue, 0);
    const realizedPnl = this.closedTrades.reduce((s, t) => s + t.realizedPnl, 0);
    const equity = this.cash + marketValue;
    return {
      startingCash: this.startingCash,
      cash: this.cash,
      buyingPower: this.cash,
      equity,
      realizedPnl,
      unrealizedPnl,
      openPositions,
      closedTrades: [...this.closedTrades],
    };
  }

  grossExposure(): number {
    return [...this.positions.values()].reduce((s, p) => s + p.marketValue, 0);
  }

  applyLongEntry(input: {
    symbol: string;
    quantity: number;
    fillPrice: number;
    correlationId: string;
    originatingIntentId: string;
    openedAt: string;
    plan: TradeExecutionPlan;
  }): void {
    const sym = input.symbol.toUpperCase();
    const notional = input.quantity * input.fillPrice;
    if (notional > this.cash) {
      throw new Error("INSUFFICIENT_CASH");
    }
    this.cash -= notional;
    const existing = this.positions.get(sym);
    if (!existing) {
      this.positions.set(sym, {
        symbol: sym,
        side: "long",
        quantity: input.quantity,
        averageEntryPrice: input.fillPrice,
        currentPrice: input.fillPrice,
        marketValue: notional,
        unrealizedPnl: 0,
        openedAt: input.openedAt,
        correlationId: input.correlationId,
        originatingIntentId: input.originatingIntentId,
        stopLossPrice: input.plan.stopLossPrice,
        profitTargetPrice: input.plan.profitTargetPrice,
      });
      return;
    }
    const totalQty = existing.quantity + input.quantity;
    const avg =
      (existing.averageEntryPrice * existing.quantity + input.fillPrice * input.quantity) /
      totalQty;
    existing.quantity = totalQty;
    existing.averageEntryPrice = avg;
    existing.currentPrice = input.fillPrice;
    existing.marketValue = totalQty * input.fillPrice;
    existing.unrealizedPnl = (input.fillPrice - avg) * totalQty;
    if (input.plan.stopLossPrice != null) existing.stopLossPrice = input.plan.stopLossPrice;
    if (input.plan.profitTargetPrice != null) existing.profitTargetPrice = input.plan.profitTargetPrice;
  }

  applyLongExit(input: {
    symbol: string;
    quantity: number;
    fillPrice: number;
    closedAt: string;
    exitReason: PaperExitReason;
    correlationId: string;
  }): ClosedPaperTrade | null {
    const sym = input.symbol.toUpperCase();
    const pos = this.positions.get(sym);
    if (!pos || input.quantity <= 0 || input.quantity > pos.quantity) return null;

    const realizedPnl = (input.fillPrice - pos.averageEntryPrice) * input.quantity;
    this.cash += input.quantity * input.fillPrice;

    const trade: ClosedPaperTrade = {
      symbol: sym,
      quantity: input.quantity,
      entryPrice: pos.averageEntryPrice,
      exitPrice: input.fillPrice,
      realizedPnl,
      openedAt: pos.openedAt,
      closedAt: input.closedAt,
      originatingIntentId: pos.originatingIntentId,
      exitReason: input.exitReason,
      correlationId: input.correlationId,
    };

    if (input.quantity === pos.quantity) {
      this.positions.delete(sym);
    } else {
      pos.quantity -= input.quantity;
      pos.marketValue = pos.quantity * pos.currentPrice;
      pos.unrealizedPnl = (pos.currentPrice - pos.averageEntryPrice) * pos.quantity;
    }

    this.closedTrades.push(trade);
    return trade;
  }

  markToMarket(prices: Readonly<Record<string, number>>): void {
    for (const pos of this.positions.values()) {
      const px = prices[pos.symbol];
      if (px == null || px <= 0) continue;
      pos.currentPrice = px;
      pos.marketValue = pos.quantity * px;
      pos.unrealizedPnl = (px - pos.averageEntryPrice) * pos.quantity;
    }
  }

  getPosition(symbol: string): PaperPosition | null {
    return this.positions.get(symbol.toUpperCase()) ?? null;
  }

  openPositionCount(): number {
    return this.positions.size;
  }

  dailyRealizedPnl(): number {
    return this.closedTrades.reduce((s, t) => s + t.realizedPnl, 0);
  }
}
