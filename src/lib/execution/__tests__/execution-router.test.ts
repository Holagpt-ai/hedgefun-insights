import { describe, it, expect } from "vitest";
import { ExecutionRouter } from "@/lib/execution/router/execution-router";
import { createInMemoryTradingEventLog } from "@/lib/execution/events/trading-event-log";
import { PaperBrokerAdapter } from "@/lib/execution/broker/adapters/paper-broker-adapter";
import { DEFAULT_RISK_GATEWAY_LIMITS, RiskGateway } from "@/lib/execution/risk/risk-gateway";
import { createInMemoryKillSwitchStore } from "@/lib/execution/kill-switch/kill-switch-store";
import {
  buildCatalystMomentumTradeIntent,
  buildPaperRiskContext,
  SYNTH_HIGH_VOL_SYMBOL,
} from "@/lib/execution/__tests__/fixtures/catalyst-momentum-v1.fixture";
import type { ExecutionMode } from "@/lib/execution/execution-mode";
import type { RiskDecision } from "@/lib/execution/risk/risk-decision";

describe("ExecutionRouter", () => {
  it("never submits in observe mode", async () => {
    const log = createInMemoryTradingEventLog();
    const paper = new PaperBrokerAdapter();
    const router = new ExecutionRouter({
      eventLog: log,
      resolveMode: () => "observe" as ExecutionMode,
      resolveBrokerAdapter: () => paper,
    });
    const intent = buildCatalystMomentumTradeIntent({
      correlationId: "obs-route",
      triggerPrice: 20,
      quantity: 5,
    });
    const decision: RiskDecision = {
      id: "risk-obs",
      tradeIntentId: intent.id,
      approved: true,
      reasonCodes: ["APPROVED"],
      approvedQuantity: 5,
      approvedNotional: null,
      approvedStopPrice: null,
      evaluatedAt: new Date().toISOString(),
    };
    const result = await router.executeApproved({ intent, decision });
    expect(result.submitted).toBe(false);
    expect(result.errorCode).toBe("EXECUTION_MODE_OBSERVE");
    expect(log.getEvents().some((e) => e.eventType === "ORDER_REJECTED")).toBe(true);
  });

  it("routes paper execution and logs events", async () => {
    const log = createInMemoryTradingEventLog();
    const paper = new PaperBrokerAdapter();
    paper.setReferencePrice(SYNTH_HIGH_VOL_SYMBOL, 20);
    const router = new ExecutionRouter({
      eventLog: log,
      resolveMode: () => "paper",
      resolveBrokerAdapter: (m) => (m === "paper" ? paper : null),
    });
    const gateway = new RiskGateway({
      killSwitchStore: createInMemoryKillSwitchStore(),
      limits: { ...DEFAULT_RISK_GATEWAY_LIMITS, symbolCooldownMs: 0 },
    });
    const intent = buildCatalystMomentumTradeIntent({
      correlationId: "paper-route",
      triggerPrice: 20,
      quantity: 5,
    });
    const decision = gateway.evaluate(
      intent,
      buildPaperRiskContext({ mode: "paper", executionEnabled: true }),
    );
    const result = await router.executeApproved({ intent, decision });
    expect(result.submitted).toBe(true);
    expect(result.simulated).toBe(true);
    const types = log.getEvents().map((e) => e.eventType);
    expect(types).toContain("ORDER_SUBMITTED");
    expect(types).toContain("ORDER_FILLED");
  });

  it("blocks live modes in Sprint 0", async () => {
    const log = createInMemoryTradingEventLog();
    const router = new ExecutionRouter({
      eventLog: log,
      resolveMode: () => "live_autonomous",
      resolveBrokerAdapter: () => null,
    });
    const intent = buildCatalystMomentumTradeIntent({
      correlationId: "live",
      triggerPrice: 10,
      quantity: 1,
    });
    const decision: RiskDecision = {
      id: "risk-live",
      tradeIntentId: intent.id,
      approved: true,
      reasonCodes: ["APPROVED"],
      approvedQuantity: 1,
      approvedNotional: null,
      approvedStopPrice: null,
      evaluatedAt: new Date().toISOString(),
    };
    const result = await router.executeApproved({ intent, decision });
    expect(result.submitted).toBe(false);
    expect(result.errorCode).toBe("LIVE_EXECUTION_DISABLED");
  });
});
