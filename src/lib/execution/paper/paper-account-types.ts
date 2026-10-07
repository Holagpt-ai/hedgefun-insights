export type PaperPositionSide = "long";

export interface PaperPosition {
  symbol: string;
  side: PaperPositionSide;
  quantity: number;
  averageEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  openedAt: string;
  correlationId: string;
  originatingIntentId: string;
  stopLossPrice: number | null;
  profitTargetPrice: number | null;
}

export type PaperExitReason = "STOP_LOSS" | "PROFIT_TARGET" | "MANUAL" | "SCALE_OUT";

export interface ClosedPaperTrade {
  symbol: string;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  realizedPnl: number;
  openedAt: string;
  closedAt: string;
  originatingIntentId: string;
  exitReason: PaperExitReason;
  correlationId: string;
}

export interface PaperAccountSnapshot {
  startingCash: number;
  cash: number;
  buyingPower: number;
  equity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  openPositions: PaperPosition[];
  closedTrades: ClosedPaperTrade[];
}
