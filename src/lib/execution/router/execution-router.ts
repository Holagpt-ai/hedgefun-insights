import type { BrokerAdapter } from "@/lib/execution/broker/broker-adapter";
import type { MarketOrderRequest, OrderRequest } from "@/lib/execution/broker/types";
import type { RiskDecision } from "@/lib/execution/risk/risk-decision";
import { assertRiskDecisionApproved } from "@/lib/execution/risk/risk-decision";
import type { TradeIntent } from "@/lib/execution/intent/trade-intent";
import {
  executionModePermitsBrokerSubmission,
  executionModePermitsLiveSubmission,
  type ExecutionMode,
} from "@/lib/execution/execution-mode";
import type { TradingEventLog } from "@/lib/execution/events/trading-event-log";
import type { TradingEvent } from "@/lib/execution/events/trading-event";

export class ExecutionRouterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionRouterError";
  }
}

export interface ExecutionRouterDeps {
  resolveMode: () => ExecutionMode;
  resolveBrokerAdapter: (mode: ExecutionMode) => BrokerAdapter | null;
  eventLog: TradingEventLog;
  now?: () => number;
  idFactory?: () => string;
}

export interface ApprovedExecutionRequest {
  intent: TradeIntent;
  decision: RiskDecision;
}

export interface ExecutionRouterResult {
  submitted: boolean;
  orderId: string | null;
  simulated: boolean;
  errorCode: string | null;
}

export class ExecutionRouter {
  private readonly resolveMode: () => ExecutionMode;
  private readonly resolveBrokerAdapter: (mode: ExecutionMode) => BrokerAdapter | null;
  private readonly eventLog: TradingEventLog;
  private readonly now: () => number;
  private readonly idFactory: () => string;

  constructor(deps: ExecutionRouterDeps) {
    this.resolveMode = deps.resolveMode;
    this.resolveBrokerAdapter = deps.resolveBrokerAdapter;
    this.eventLog = deps.eventLog;
    this.now = deps.now ?? (() => Date.now());
    this.idFactory = deps.idFactory ?? (() => `evt-${this.now()}`);
  }

  async executeApproved(request: ApprovedExecutionRequest): Promise<ExecutionRouterResult> {
    assertRiskDecisionApproved(request.decision);

    const mode = this.resolveMode();

    if (executionModePermitsLiveSubmission(mode)) {
      this.emit({
        eventType: "ORDER_REJECTED",
        correlationId: request.intent.correlationId,
        symbol: request.intent.symbol,
        strategyId: request.intent.strategyId,
        tradeIntentId: request.intent.id,
        riskDecisionId: request.decision.id,
        reasonCodes: ["LIVE_EXECUTION_DISABLED"],
        payload: { mode, message: "Live execution not implemented in Sprint 0" },
      });
      return {
        submitted: false,
        orderId: null,
        simulated: false,
        errorCode: "LIVE_EXECUTION_DISABLED",
      };
    }

    if (!executionModePermitsBrokerSubmission(mode)) {
      this.emit({
        eventType: "ORDER_REJECTED",
        correlationId: request.intent.correlationId,
        symbol: request.intent.symbol,
        strategyId: request.intent.strategyId,
        tradeIntentId: request.intent.id,
        riskDecisionId: request.decision.id,
        reasonCodes: ["EXECUTION_MODE_OBSERVE"],
        payload: { mode },
      });
      return {
        submitted: false,
        orderId: null,
        simulated: false,
        errorCode: "EXECUTION_MODE_OBSERVE",
      };
    }

    const adapter = this.resolveBrokerAdapter(mode);
    if (!adapter) {
      throw new ExecutionRouterError(`No broker adapter registered for mode ${mode}`);
    }

    const orderReq = intentToMarketOrder(request.intent, request.decision);
    this.emit({
      eventType: "ORDER_SUBMITTED",
      correlationId: request.intent.correlationId,
      symbol: request.intent.symbol,
      strategyId: request.intent.strategyId,
      tradeIntentId: request.intent.id,
      riskDecisionId: request.decision.id,
      reasonCodes: ["APPROVED"],
      payload: { orderReq, adapterId: adapter.adapterId },
    });

    const result = await adapter.submitOrder(orderReq);
    if (!result.ok || !result.order) {
      this.emit({
        eventType: "ORDER_REJECTED",
        correlationId: request.intent.correlationId,
        symbol: request.intent.symbol,
        strategyId: request.intent.strategyId,
        tradeIntentId: request.intent.id,
        riskDecisionId: request.decision.id,
        orderId: null,
        reasonCodes: [],
        payload: { errorCode: result.errorCode, errorMessage: result.errorMessage },
      });
      return {
        submitted: false,
        orderId: null,
        simulated: true,
        errorCode: result.errorCode,
      };
    }

    this.emit({
      eventType: "ORDER_FILLED",
      correlationId: request.intent.correlationId,
      symbol: request.intent.symbol,
      strategyId: request.intent.strategyId,
      tradeIntentId: request.intent.id,
      riskDecisionId: request.decision.id,
      orderId: result.order.orderId,
      reasonCodes: ["APPROVED"],
      payload: { filledQuantity: result.order.filledQuantity },
    });

    return {
      submitted: true,
      orderId: result.order.orderId,
      simulated: result.order.isSimulated,
      errorCode: null,
    };
  }

  private emit(
    partial: Omit<
      TradingEvent,
      "eventId" | "timestamp" | "stateBefore" | "stateAfter" | "positionId" | "metadata" | "orderId"
    > & {
      orderId?: string | null;
      stateBefore?: TradingEvent["stateBefore"];
      stateAfter?: TradingEvent["stateAfter"];
      metadata?: TradingEvent["metadata"];
    },
  ): void {
    this.eventLog.append({
      eventId: this.idFactory(),
      timestamp: new Date(this.now()).toISOString(),
      stateBefore: partial.stateBefore ?? null,
      stateAfter: partial.stateAfter ?? null,
      positionId: null,
      orderId: partial.orderId ?? null,
      metadata: partial.metadata ?? {},
      correlationId: partial.correlationId,
      symbol: partial.symbol,
      strategyId: partial.strategyId,
      eventType: partial.eventType,
      tradeIntentId: partial.tradeIntentId,
      riskDecisionId: partial.riskDecisionId,
      reasonCodes: [...partial.reasonCodes],
      payload: { ...partial.payload },
    });
  }
}

function intentToMarketOrder(intent: TradeIntent, decision: RiskDecision): MarketOrderRequest {
  const qty = decision.approvedQuantity;
  if (qty == null || qty <= 0) {
    throw new ExecutionRouterError("Approved decision missing quantity");
  }
  return {
    kind: "market",
    symbol: intent.symbol.toUpperCase(),
    side: intent.side,
    quantity: qty,
    clientOrderId: intent.id,
  };
}
