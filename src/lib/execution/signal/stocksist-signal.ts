/** Thin projection of Stocksist intelligence for execution (catalyst / radar style). */
export interface StocksistSignal {
  id: string;
  symbol: string;
  strategyId: string;
  side: "buy" | "sell";
  triggerPrice: number;
  suggestedQuantity: number | null;
  suggestedNotional: number | null;
  stopLossPrice: number | null;
  profitTargetPrice: number | null;
  eventType: string | null;
  catalystId: string | null;
  volume: number | null;
  rvol: number | null;
  momentumScore: number | null;
  aboveVwap: boolean | null;
  hodProximityPct: number | null;
  floatTurnover: number | null;
  historicalContext: string | null;
  thesisSummary: string | null;
  signalAt: string;
  metadata: Record<string, unknown>;
}
