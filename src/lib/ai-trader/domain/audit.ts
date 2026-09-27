import type {
  AiTraderSessionId,
  ContextSnapshotId,
  DecisionId,
  OrderIntentId,
  PositionId,
  ReflectionId,
  TradeId,
  TradePlanId,
} from "@/lib/ai-trader/domain/ids";

export const AI_TRADER_CORRELATION_KEYS = [
  "session_id",
  "context_snapshot_id",
  "decision_id",
  "trade_plan_id",
  "order_intent_id",
  "broker_order_id",
  "position_id",
  "trade_id",
  "reflection_id",
] as const;

export type AiTraderCorrelationKey = (typeof AI_TRADER_CORRELATION_KEYS)[number];

export interface AiTraderCorrelationIds {
  sessionId: AiTraderSessionId | null;
  contextSnapshotId: ContextSnapshotId | null;
  decisionId: DecisionId | null;
  tradePlanId: TradePlanId | null;
  orderIntentId: OrderIntentId | null;
  brokerOrderId: string | null;
  positionId: PositionId | null;
  tradeId: TradeId | null;
  reflectionId: ReflectionId | null;
}

export const AUDIT_SECRET_KEYS = [
  "apiKey",
  "apiSecret",
  "authorization",
  "password",
  "token",
  "chainOfThought",
  "rawReasoning",
] as const;

export function auditPayloadContainsForbiddenKey(payload: Record<string, unknown>): boolean {
  return AUDIT_SECRET_KEYS.some((key) => key in payload);
}
