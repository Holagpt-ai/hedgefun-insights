import type { ExecutionRouter, ExecutionRouterResult } from "@/lib/execution/router/execution-router";
import type { RiskGateway, RiskGatewayContext } from "@/lib/execution/risk/risk-gateway";
import type { RiskDecision } from "@/lib/execution/risk/risk-decision";
import type { RiskReasonCode } from "@/lib/execution/risk/reason-codes";
import { validateTradeIntent, type TradeIntent } from "@/lib/execution/intent/trade-intent";
import type { TradingEventLog } from "@/lib/execution/events/trading-event-log";
import type { TradingEvent } from "@/lib/execution/events/trading-event";
import {
  executionModePermitsLiveSubmission,
  type ExecutionMode,
} from "@/lib/execution/execution-mode";
import type { IntentDedupeStore } from "@/lib/execution/orchestrator/intent-dedupe-store";

export type ExecutionOrchestratorStatus =
  | "duplicate_intent"
  | "invalid_intent"
  | "execution_disabled"
  | "live_unavailable"
  | "observe_only"
  | "risk_rejected"
  | "broker_failed"
  | "completed";

export interface ExecutionOrchestratorResult {
  status: ExecutionOrchestratorStatus;
  tradeIntentId: string;
  correlationId: string;
  executionMode: ExecutionMode;
  riskDecision: RiskDecision | null;
  routerResult: ExecutionRouterResult | null;
  orderId: string | null;
  reasonCodes: RiskReasonCode[];
}

export interface ExecutionOrchestratorPolicy {
  executionMode: ExecutionMode;
  executionEnabled: boolean;
}

export interface ExecutionOrchestratorDeps {
  riskGateway: RiskGateway;
  router: ExecutionRouter;
  eventLog: TradingEventLog;
  intentDedupeStore: IntentDedupeStore;
  resolvePolicy: () => ExecutionOrchestratorPolicy;
  buildRiskContext: (intent: TradeIntent, policy: ExecutionOrchestratorPolicy) => RiskGatewayContext;
  now?: () => number;
  idFactory?: () => string;
}

/**
 * Thin coordination layer — no strategy logic. Wires TradeIntent through risk and router only.
 */
export class ExecutionOrchestrator {
  private readonly riskGateway: RiskGateway;
  private readonly router: ExecutionRouter;
  private readonly eventLog: TradingEventLog;
  private readonly intentDedupeStore: IntentDedupeStore;
  private readonly resolvePolicy: () => ExecutionOrchestratorPolicy;
  private readonly buildRiskContext: (
    intent: TradeIntent,
    policy: ExecutionOrchestratorPolicy,
  ) => RiskGatewayContext;
  private readonly now: () => number;
  private readonly idFactory: () => string;

  constructor(deps: ExecutionOrchestratorDeps) {
    this.riskGateway = deps.riskGateway;
    this.router = deps.router;
    this.eventLog = deps.eventLog;
    this.intentDedupeStore = deps.intentDedupeStore;
    this.resolvePolicy = deps.resolvePolicy;
    this.buildRiskContext = deps.buildRiskContext;
    this.now = deps.now ?? (() => Date.now());
    this.idFactory = deps.idFactory ?? (() => `orch-${this.now()}`);
  }

  async execute(intent: TradeIntent): Promise<ExecutionOrchestratorResult> {
    const policy = this.resolvePolicy();
    const base = this.baseResult(intent, policy.executionMode);

    if (this.intentDedupeStore.hasProcessed(intent.id)) {
      return {
        ...base,
        status: "duplicate_intent",
        reasonCodes: ["DUPLICATE_ORDER"],
      };
    }

    const invalid = validateTradeIntent(intent);
    if (invalid) {
      return {
        ...base,
        status: "invalid_intent",
        reasonCodes: ["INVALID_TRADE_INTENT"],
      };
    }

    this.emitEvent({
      eventType: "INTENT_RECEIVED",
      intent,
      reasonCodes: [],
      payload: { executionMode: policy.executionMode, executionEnabled: policy.executionEnabled },
    });

    // Paper engine OFF still blocks before risk. Observe always runs deterministic risk.
    if (!policy.executionEnabled && policy.executionMode !== "observe") {
      return {
        ...base,
        status: "execution_disabled",
        reasonCodes: ["TRADING_DISABLED"],
      };
    }

    if (executionModePermitsLiveSubmission(policy.executionMode)) {
      this.emitEvent({
        eventType: "RISK_REJECTED",
        intent,
        reasonCodes: ["LIVE_EXECUTION_DISABLED"],
        payload: { mode: policy.executionMode },
      });
      return {
        ...base,
        status: "live_unavailable",
        reasonCodes: ["LIVE_EXECUTION_DISABLED"],
      };
    }

    const riskContext = this.buildRiskContext(intent, policy);
    const decision = this.riskGateway.evaluate(intent, riskContext);

    this.emitEvent({
      eventType: decision.approved ? "RISK_APPROVED" : "RISK_REJECTED",
      intent,
      riskDecisionId: decision.id,
      reasonCodes: [...decision.reasonCodes],
      payload: {},
    });

    if (!decision.approved) {
      this.intentDedupeStore.markProcessed(intent.id);
      return {
        ...base,
        status: "risk_rejected",
        riskDecision: decision,
        reasonCodes: [...decision.reasonCodes],
      };
    }

    if (policy.executionMode === "observe") {
      this.intentDedupeStore.markProcessed(intent.id);
      return {
        ...base,
        status: "observe_only",
        riskDecision: decision,
        reasonCodes: ["APPROVED"],
      };
    }

    if (!policy.executionEnabled) {
      return {
        ...base,
        status: "execution_disabled",
        riskDecision: decision,
        reasonCodes: ["TRADING_DISABLED"],
      };
    }

    const routerResult = await this.router.executeApproved({ intent, decision });
    if (!routerResult.submitted) {
      this.intentDedupeStore.markProcessed(intent.id);
      return {
        ...base,
        status: "broker_failed",
        riskDecision: decision,
        routerResult,
        reasonCodes: [...decision.reasonCodes],
      };
    }

    this.emitEvent({
      eventType: "EXECUTION_COMPLETED",
      intent,
      riskDecisionId: decision.id,
      orderId: routerResult.orderId,
      reasonCodes: ["APPROVED"],
      payload: { simulated: routerResult.simulated },
    });

    this.intentDedupeStore.markProcessed(intent.id);

    return {
      ...base,
      status: "completed",
      riskDecision: decision,
      routerResult,
      orderId: routerResult.orderId,
      reasonCodes: ["APPROVED"],
    };
  }

  private baseResult(intent: TradeIntent, mode: ExecutionMode): ExecutionOrchestratorResult {
    return {
      status: "invalid_intent",
      tradeIntentId: intent.id,
      correlationId: intent.correlationId,
      executionMode: mode,
      riskDecision: null,
      routerResult: null,
      orderId: null,
      reasonCodes: [],
    };
  }

  private emitEvent(input: {
    eventType: TradingEvent["eventType"];
    intent: TradeIntent;
    riskDecisionId?: string;
    orderId?: string | null;
    reasonCodes: RiskReasonCode[];
    payload: Record<string, unknown>;
  }): void {
    this.eventLog.append({
      eventId: this.idFactory(),
      correlationId: input.intent.correlationId,
      timestamp: new Date(this.now()).toISOString(),
      symbol: input.intent.symbol,
      strategyId: input.intent.strategyId,
      eventType: input.eventType,
      stateBefore: null,
      stateAfter: null,
      tradeIntentId: input.intent.id,
      riskDecisionId: input.riskDecisionId ?? null,
      orderId: input.orderId ?? null,
      positionId: null,
      reasonCodes: [...input.reasonCodes],
      payload: { ...input.payload },
      metadata: {},
    });
  }
}
