import type { OrderSide } from "@/lib/execution/broker/types";

export const TRADE_INTENT_TYPES = ["entry", "exit", "scale_out"] as const;
export type TradeIntentType = (typeof TRADE_INTENT_TYPES)[number];

/**
 * Strategy proposal only — no authority to place orders.
 * Must pass through RiskGateway before ExecutionRouter.
 */
export interface TradeIntent {
  id: string;
  correlationId: string;
  symbol: string;
  strategyId: string;
  side: OrderSide;
  intentType: TradeIntentType;
  triggerPrice: number | null;
  invalidationPrice: number | null;
  requestedQuantity: number | null;
  requestedNotional: number | null;
  marketSnapshotId: string | null;
  catalystId: string | null;
  historicalBehaviorProfileId: string | null;
  generatedAt: string;
  metadata: Record<string, unknown>;
}

export function validateTradeIntent(intent: TradeIntent): string | null {
  if (!intent.id.trim()) return "missing id";
  if (!intent.symbol.trim()) return "missing symbol";
  if (!intent.strategyId.trim()) return "missing strategyId";
  const hasQty = intent.requestedQuantity != null && intent.requestedQuantity > 0;
  const hasNotional = intent.requestedNotional != null && intent.requestedNotional > 0;
  if (!hasQty && !hasNotional) return "missing quantity or notional";
  if (hasQty && hasNotional) return "ambiguous quantity and notional";
  return null;
}
