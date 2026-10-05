/** Broker-neutral order and account types. No vendor-specific fields. */

export type OrderSide = "buy" | "sell";
export type OrderStatus =
  | "pending"
  | "accepted"
  | "partially_filled"
  | "filled"
  | "cancelled"
  | "rejected";

export type TimeInForce = "day" | "gtc" | "ioc" | "fok";

export interface BrokerCapabilities {
  supportsMarketOrders: boolean;
  supportsLimitOrders: boolean;
  supportsStopOrders: boolean;
  supportsStopLimitOrders: boolean;
  supportsTrailingStops: boolean;
  supportsExtendedHours: boolean;
  supportsFractionalShares: boolean;
  supportsOrderCancel: boolean;
  supportsPartialFills: boolean;
}

export interface BrokerAccount {
  accountId: string;
  /** Human-readable; paper adapters must identify simulation. */
  displayName: string;
  currency: string;
  buyingPower: number;
  equity: number;
  isSimulated: boolean;
}

export interface BrokerPosition {
  symbol: string;
  quantity: number;
  averageEntryPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  side: "long" | "short";
}

export interface BrokerFill {
  fillId: string;
  orderId: string;
  symbol: string;
  quantity: number;
  price: number;
  filledAt: string;
}

export interface BrokerOrder {
  orderId: string;
  clientOrderId: string | null;
  symbol: string;
  side: OrderSide;
  status: OrderStatus;
  quantity: number;
  filledQuantity: number;
  limitPrice: number | null;
  stopPrice: number | null;
  submittedAt: string;
  updatedAt: string;
  isSimulated: boolean;
}

export interface MarketOrderRequest {
  kind: "market";
  symbol: string;
  side: OrderSide;
  quantity: number;
  timeInForce?: TimeInForce;
  clientOrderId?: string;
}

export interface LimitOrderRequest {
  kind: "limit";
  symbol: string;
  side: OrderSide;
  quantity: number;
  limitPrice: number;
  timeInForce?: TimeInForce;
  clientOrderId?: string;
}

export interface StopOrderRequest {
  kind: "stop";
  symbol: string;
  side: OrderSide;
  quantity: number;
  stopPrice: number;
  timeInForce?: TimeInForce;
  clientOrderId?: string;
}

export interface StopLimitOrderRequest {
  kind: "stop_limit";
  symbol: string;
  side: OrderSide;
  quantity: number;
  stopPrice: number;
  limitPrice: number;
  timeInForce?: TimeInForce;
  clientOrderId?: string;
}

export type OrderRequest =
  | MarketOrderRequest
  | LimitOrderRequest
  | StopOrderRequest
  | StopLimitOrderRequest;

export interface OrderResult {
  ok: boolean;
  order: BrokerOrder | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface CancelOrderResult {
  ok: boolean;
  order: BrokerOrder | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface ClosePositionRequest {
  symbol: string;
  quantity?: number;
  clientOrderId?: string;
}
