import { describe, it, expect } from "vitest";
import {
  CATALYST_MOMENTUM_HAPPY_PATH,
  transitionStrategyState,
  StrategyStateTransitionError,
} from "@/lib/execution/strategy/transitions";
import { createInMemoryTradingEventLog } from "@/lib/execution/events/trading-event-log";
import { RiskGateway, DEFAULT_RISK_GATEWAY_LIMITS } from "@/lib/execution/risk/risk-gateway";
import { createInMemoryKillSwitchStore } from "@/lib/execution/kill-switch/kill-switch-store";
import { ExecutionRouter } from "@/lib/execution/router/execution-router";
import { PaperBrokerAdapter } from "@/lib/execution/broker/adapters/paper-broker-adapter";
import {
  buildCatalystMomentumTradeIntent,
  buildPaperRiskContext,
  SYNTH_HIGH_VOL_SYMBOL,
} from "@/lib/execution/__tests__/fixtures/catalyst-momentum-v1.fixture";

describe("CATALYST_MOMENTUM_V1 synthetic lifecycle (architecture only)", () => {
  it("walks the happy-path state machine", () => {
    let state = CATALYST_MOMENTUM_HAPPY_PATH[0];
    for (let i = 1; i < CATALYST_MOMENTUM_HAPPY_PATH.length; i += 1) {
      state = transitionStrategyState(state, CATALYST_MOMENTUM_HAPPY_PATH[i]);
    }
    expect(state).toBe("COOLDOWN");
  });

  it("runs intent → risk → paper router with event log", async () => {
    const correlationId = "lifecycle-1";
    const log = createInMemoryTradingEventLog();
    const paper = new PaperBrokerAdapter();
    paper.setReferencePrice(SYNTH_HIGH_VOL_SYMBOL, 15);
    const router = new ExecutionRouter({
      eventLog: log,
      resolveMode: () => "paper",
      resolveBrokerAdapter: (m) => (m === "paper" ? paper : null),
    });
    const gateway = new RiskGateway({
      killSwitchStore: createInMemoryKillSwitchStore(),
      limits: { ...DEFAULT_RISK_GATEWAY_LIMITS, symbolCooldownMs: 0 },
    });

    let state = CATALYST_MOMENTUM_HAPPY_PATH[0];
    for (let i = 1; i < CATALYST_MOMENTUM_HAPPY_PATH.length; i += 1) {
      const next = CATALYST_MOMENTUM_HAPPY_PATH[i];
      const prev = state;
      state = transitionStrategyState(state, next);
      log.append({
        eventId: `evt-state-${i}`,
        correlationId,
        timestamp: new Date().toISOString(),
        symbol: SYNTH_HIGH_VOL_SYMBOL,
        strategyId: "CATALYST_MOMENTUM_V1",
        eventType: "STATE_CHANGED",
        stateBefore: prev,
        stateAfter: next,
        tradeIntentId: null,
        riskDecisionId: null,
        orderId: null,
        positionId: null,
        reasonCodes: [],
        payload: {},
        metadata: {},
      });
    }

    const intent = buildCatalystMomentumTradeIntent({
      correlationId,
      triggerPrice: 15,
      quantity: 4,
    });
    const decision = gateway.evaluate(
      intent,
      buildPaperRiskContext({ mode: "paper", executionEnabled: true }),
    );
    log.append({
      eventId: "evt-risk",
      correlationId,
      timestamp: new Date().toISOString(),
      symbol: intent.symbol,
      strategyId: intent.strategyId,
      eventType: decision.approved ? "RISK_APPROVED" : "RISK_REJECTED",
      stateBefore: "RISK_CHECK",
      stateAfter: decision.approved ? "ORDER_PENDING" : "REJECTED",
      tradeIntentId: intent.id,
      riskDecisionId: decision.id,
      orderId: null,
      positionId: null,
      reasonCodes: [...decision.reasonCodes],
      payload: {},
      metadata: {},
    });

    const exec = await router.executeApproved({ intent, decision });
    expect(decision.approved).toBe(true);
    expect(exec.submitted).toBe(true);
    expect(log.getByCorrelationId(correlationId).length).toBeGreaterThan(5);
  });

  it("rejects invalid transition during lifecycle", () => {
    expect(() => transitionStrategyState("DISCOVERED", "ENTERED")).toThrow(
      StrategyStateTransitionError,
    );
  });
});
