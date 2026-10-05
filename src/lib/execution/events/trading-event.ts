import type { StrategyState } from "@/lib/execution/strategy/states";
import type { RiskReasonCode } from "@/lib/execution/risk/reason-codes";

export const TRADING_EVENT_TYPES = [
  "SIGNAL_DISCOVERED",
  "SIGNAL_QUALIFIED",
  "STATE_CHANGED",
  "STATE_ARMED",
  "STATE_TRIGGERED",
  "RISK_APPROVED",
  "RISK_REJECTED",
  "ORDER_SUBMITTED",
  "ORDER_ACCEPTED",
  "ORDER_PARTIAL_FILL",
  "ORDER_FILLED",
  "ORDER_CANCELLED",
  "ORDER_REJECTED",
  "POSITION_OPENED",
  "STOP_UPDATED",
  "POSITION_CLOSED",
  "KILL_SWITCH_ACTIVATED",
  "DATA_STALE",
  "HALT_DETECTED",
  "SYSTEM_ERROR",
] as const;

export type TradingEventType = (typeof TRADING_EVENT_TYPES)[number];

export interface TradingEvent {
  eventId: string;
  correlationId: string;
  timestamp: string;
  symbol: string | null;
  strategyId: string | null;
  eventType: TradingEventType;
  stateBefore: StrategyState | null;
  stateAfter: StrategyState | null;
  tradeIntentId: string | null;
  riskDecisionId: string | null;
  orderId: string | null;
  positionId: string | null;
  reasonCodes: RiskReasonCode[];
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
}
