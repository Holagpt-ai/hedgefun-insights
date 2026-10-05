import type {
  BrokerAccount,
  BrokerCapabilities,
  BrokerOrder,
  BrokerPosition,
  CancelOrderResult,
  ClosePositionRequest,
  OrderRequest,
  OrderResult,
} from "@/lib/execution/broker/types";

/** Replaceable execution adapter — no strategy or risk logic. */
export interface BrokerAdapter {
  readonly adapterId: string;
  readonly displayName: string;

  getCapabilities(): BrokerCapabilities;

  getAccount(): Promise<BrokerAccount>;

  getPositions(): Promise<BrokerPosition[]>;

  getOrders(): Promise<BrokerOrder[]>;

  getOrder(orderId: string): Promise<BrokerOrder | null>;

  submitOrder(request: OrderRequest): Promise<OrderResult>;

  cancelOrder(orderId: string): Promise<CancelOrderResult>;

  closePosition(request: ClosePositionRequest): Promise<OrderResult>;
}
