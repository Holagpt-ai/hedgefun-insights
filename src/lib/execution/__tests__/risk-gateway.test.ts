import { describe, it, expect, beforeEach } from "vitest";
import { DEFAULT_RISK_GATEWAY_LIMITS, RiskGateway } from "@/lib/execution/risk/risk-gateway";
import { createInMemoryKillSwitchStore } from "@/lib/execution/kill-switch/kill-switch-store";
import {
  buildCatalystMomentumTradeIntent,
  buildPaperRiskContext,
  CATALYST_MOMENTUM_V1_STRATEGY_ID,
  SYNTH_HIGH_VOL_SYMBOL,
} from "@/lib/execution/__tests__/fixtures/catalyst-momentum-v1.fixture";

describe("RiskGateway", () => {
  const killSwitchStore = createInMemoryKillSwitchStore();
  let seq = 0;
  const gateway = new RiskGateway({
    killSwitchStore,
    idFactory: () => `risk-${++seq}`,
    now: () => 1_700_000_000_000,
    limits: { ...DEFAULT_RISK_GATEWAY_LIMITS, symbolCooldownMs: 0 },
  });

  beforeEach(() => {
    killSwitchStore.clearAll();
    seq = 0;
  });

  it("approves paper intent when policy enabled", () => {
    const intent = buildCatalystMomentumTradeIntent({
      correlationId: "ok",
      triggerPrice: 12,
      quantity: 10,
    });
    const decision = gateway.evaluate(
      intent,
      buildPaperRiskContext({ mode: "paper", executionEnabled: true }),
    );
    expect(decision.approved).toBe(true);
    expect(decision.reasonCodes).toContain("APPROVED");
    expect(decision.approvedQuantity).toBe(10);
  });

  it("rejects in observe mode", () => {
    const intent = buildCatalystMomentumTradeIntent({
      correlationId: "obs",
      triggerPrice: 12,
      quantity: 5,
    });
    const decision = gateway.evaluate(
      intent,
      buildPaperRiskContext({ mode: "observe", executionEnabled: true }),
    );
    expect(decision.approved).toBe(false);
    expect(decision.reasonCodes).toContain("EXECUTION_MODE_OBSERVE");
  });

  it("rejects when trading disabled", () => {
    const intent = buildCatalystMomentumTradeIntent({
      correlationId: "off",
      triggerPrice: 12,
      quantity: 5,
    });
    const decision = gateway.evaluate(
      intent,
      buildPaperRiskContext({ mode: "paper", executionEnabled: false }),
    );
    expect(decision.reasonCodes).toContain("TRADING_DISABLED");
  });

  it("enforces global kill switch", () => {
    killSwitchStore.activate({
      scope: "GLOBAL",
      semantics: ["BLOCK_NEW_ENTRIES"],
      activatedAt: new Date().toISOString(),
      reason: "test",
    });
    const intent = buildCatalystMomentumTradeIntent({
      correlationId: "ks",
      triggerPrice: 12,
      quantity: 5,
    });
    const decision = gateway.evaluate(
      intent,
      buildPaperRiskContext({ mode: "paper", executionEnabled: true }),
    );
    expect(decision.reasonCodes).toContain("GLOBAL_KILL_SWITCH");
  });

  it("enforces strategy kill switch", () => {
    killSwitchStore.activate({
      scope: "STRATEGY",
      strategyId: CATALYST_MOMENTUM_V1_STRATEGY_ID,
      semantics: ["BLOCK_NEW_ENTRIES"],
      activatedAt: new Date().toISOString(),
      reason: "test",
    });
    const decision = gateway.evaluate(
      buildCatalystMomentumTradeIntent({ correlationId: "sks", triggerPrice: 10, quantity: 1 }),
      buildPaperRiskContext({ mode: "paper", executionEnabled: true }),
    );
    expect(decision.reasonCodes).toContain("STRATEGY_KILL_SWITCH");
  });

  it("enforces symbol kill switch", () => {
    killSwitchStore.activate({
      scope: "SYMBOL",
      symbol: SYNTH_HIGH_VOL_SYMBOL,
      semantics: ["BLOCK_NEW_ENTRIES"],
      activatedAt: new Date().toISOString(),
      reason: "test",
    });
    const decision = gateway.evaluate(
      buildCatalystMomentumTradeIntent({ correlationId: "sym", triggerPrice: 10, quantity: 1 }),
      buildPaperRiskContext({ mode: "paper", executionEnabled: true }),
    );
    expect(decision.reasonCodes).toContain("SYMBOL_KILL_SWITCH");
  });

  it("rejects duplicate pending client order id", () => {
    const ctx = buildPaperRiskContext({ mode: "paper", executionEnabled: true });
    ctx.portfolio.pendingClientOrderIds = ["intent-dup"];
    const intent = buildCatalystMomentumTradeIntent({
      correlationId: "dup",
      triggerPrice: 10,
      quantity: 1,
    });
    const decision = gateway.evaluate(intent, ctx);
    expect(decision.reasonCodes).toContain("DUPLICATE_ORDER");
  });

  it("rejects halted symbol", () => {
    const ctx = buildPaperRiskContext({ mode: "paper", executionEnabled: true });
    ctx.market.symbolHalted = true;
    const decision = gateway.evaluate(
      buildCatalystMomentumTradeIntent({ correlationId: "halt", triggerPrice: 10, quantity: 1 }),
      ctx,
    );
    expect(decision.reasonCodes).toContain("MARKET_HALTED");
  });
});
