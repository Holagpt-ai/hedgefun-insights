import type { BrokerAdapter } from "@/lib/execution/broker/broker-adapter";
import type {
  BrokerAccount,
  BrokerCapabilities,
  BrokerOrder,
  BrokerPosition,
  CancelOrderResult,
  ClosePositionRequest,
  MarketOrderRequest,
  OrderRequest,
  OrderResult,
} from "@/lib/execution/broker/types";

/** Extension hooks for later simulation fidelity (Sprint 0 stubs). */
export interface PaperBrokerSimulationHooks {
  slippageBps?: number;
  latencyMs?: number;
  rejectProbability?: number;
}

export interface PaperBrokerAdapterOptions {
  accountId?: string;
  initialBuyingPower?: number;
  hooks?: PaperBrokerSimulationHooks;
  now?: () => number;
  idFactory?: () => string;
}

const PAPER_CAPABILITIES: BrokerCapabilities = {
  supportsMarketOrders: true,
  supportsLimitOrders: true,
  supportsStopOrders: false,
  supportsStopLimitOrders: false,
  supportsTrailingStops: false,
  supportsExtendedHours: false,
  supportsFractionalShares: false,
  supportsOrderCancel: true,
  supportsPartialFills: false,
};

export class PaperBrokerAdapter implements BrokerAdapter {
  readonly adapterId = "paper";
  readonly displayName = "Stocksist Paper (simulated)";

  private buyingPower: number;
  private readonly equity: number;
  private readonly accountId: string;
  private readonly hooks: PaperBrokerSimulationHooks;
  private readonly now: () => number;
  private readonly idFactory: () => string;
  private readonly orders = new Map<string, BrokerOrder>();
  private readonly positions = new Map<string, BrokerPosition>();
  private readonly lastPrices = new Map<string, number>();

  constructor(options: PaperBrokerAdapterOptions = {}) {
    this.accountId = options.accountId ?? "paper-default";
    this.buyingPower = options.initialBuyingPower ?? 100_000;
    this.equity = this.buyingPower;
    this.hooks = options.hooks ?? {};
    this.now = options.now ?? (() => Date.now());
    this.idFactory = options.idFactory ?? (() => `paper-${this.now()}`);
  }

  /** Test helper — seed reference price for fills. */
  setReferencePrice(symbol: string, price: number): void {
    this.lastPrices.set(symbol.toUpperCase(), price);
  }

  getCapabilities(): BrokerCapabilities {
    return { ...PAPER_CAPABILITIES };
  }

  async getAccount(): Promise<BrokerAccount> {
    return {
      accountId: this.accountId,
      displayName: "Stocksist Paper Simulation",
      currency: "USD",
      buyingPower: this.buyingPower,
      equity: this.equity,
      isSimulated: true,
    };
  }

  async getPositions(): Promise<BrokerPosition[]> {
    return [...this.positions.values()];
  }

  async getOrders(): Promise<BrokerOrder[]> {
    return [...this.orders.values()];
  }

  async getOrder(orderId: string): Promise<BrokerOrder | null> {
    return this.orders.get(orderId) ?? null;
  }

  async submitOrder(request: OrderRequest): Promise<OrderResult> {
    if (this.hooks.rejectProbability != null && Math.random() < this.hooks.rejectProbability) {
      return {
        ok: false,
        order: null,
        errorCode: "SIM_REJECTED",
        errorMessage: "Simulated rejection",
      };
    }

    const ts = new Date(this.now()).toISOString();
    const orderId = this.idFactory();
    const symbol = request.symbol.toUpperCase();

    if (request.kind === "stop" || request.kind === "stop_limit") {
      return {
        ok: false,
        order: null,
        errorCode: "UNSUPPORTED",
        errorMessage: "Paper broker does not support stop orders in Sprint 0",
      };
    }

    const qty = request.quantity;
    const ref =
      request.kind === "limit"
        ? request.limitPrice
        : (this.lastPrices.get(symbol) ?? null);
    if (ref == null || ref <= 0) {
      return {
        ok: false,
        order: null,
        errorCode: "NO_REFERENCE_PRICE",
        errorMessage: "Paper broker requires a reference price for market orders",
      };
    }

    const slip = (this.hooks.slippageBps ?? 0) / 10_000;
    const fillPrice =
      request.side === "buy" ? ref * (1 + slip) : ref * (1 - slip);
    const notional = fillPrice * qty;

    if (request.side === "buy" && notional > this.buyingPower) {
      return {
        ok: false,
        order: null,
        errorCode: "INSUFFICIENT_BUYING_POWER",
        errorMessage: "Insufficient simulated buying power",
      };
    }

    const order: BrokerOrder = {
      orderId,
      clientOrderId: request.clientOrderId ?? null,
      symbol,
      side: request.side,
      status: "filled",
      quantity: qty,
      filledQuantity: qty,
      limitPrice: request.kind === "limit" ? request.limitPrice : null,
      stopPrice: null,
      submittedAt: ts,
      updatedAt: ts,
      isSimulated: true,
    };
    this.orders.set(orderId, order);
    this.applyFill(symbol, request.side, qty, fillPrice);
    return { ok: true, order, errorCode: null, errorMessage: null };
  }

  async cancelOrder(orderId: string): Promise<CancelOrderResult> {
    const order = this.orders.get(orderId);
    if (!order) {
      return { ok: false, order: null, errorCode: "NOT_FOUND", errorMessage: "Order not found" };
    }
    if (order.status === "filled") {
      return { ok: false, order, errorCode: "NOT_CANCELLABLE", errorMessage: "Filled order" };
    }
    const updated: BrokerOrder = {
      ...order,
      status: "cancelled",
      updatedAt: new Date(this.now()).toISOString(),
    };
    this.orders.set(orderId, updated);
    return { ok: true, order: updated, errorCode: null, errorMessage: null };
  }

  async closePosition(request: ClosePositionRequest): Promise<OrderResult> {
    const symbol = request.symbol.toUpperCase();
    const pos = this.positions.get(symbol);
    if (!pos || pos.quantity <= 0) {
      return {
        ok: false,
        order: null,
        errorCode: "NO_POSITION",
        errorMessage: "No open simulated position",
      };
    }
    const qty = request.quantity ?? pos.quantity;
    const market: MarketOrderRequest = {
      kind: "market",
      symbol,
      side: pos.side === "long" ? "sell" : "buy",
      quantity: qty,
      clientOrderId: request.clientOrderId,
    };
    return this.submitOrder(market);
  }

  private applyFill(symbol: string, side: "buy" | "sell", qty: number, price: number): void {
    const existing = this.positions.get(symbol);
    if (side === "buy") {
      this.buyingPower -= price * qty;
      if (!existing) {
        this.positions.set(symbol, {
          symbol,
          quantity: qty,
          averageEntryPrice: price,
          marketValue: price * qty,
          unrealizedPnl: 0,
          side: "long",
        });
        return;
      }
      const newQty = existing.quantity + qty;
      const avg =
        (existing.averageEntryPrice * existing.quantity + price * qty) / newQty;
      this.positions.set(symbol, {
        ...existing,
        quantity: newQty,
        averageEntryPrice: avg,
        marketValue: avg * newQty,
      });
      return;
    }

    if (!existing || existing.quantity < qty) return;
    this.buyingPower += price * qty;
    const remaining = existing.quantity - qty;
    if (remaining <= 0) {
      this.positions.delete(symbol);
      return;
    }
    this.positions.set(symbol, {
      ...existing,
      quantity: remaining,
      marketValue: existing.averageEntryPrice * remaining,
    });
  }
}
