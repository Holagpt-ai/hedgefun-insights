import { describe, it, expect } from "vitest";
import {
  DEFAULT_EXECUTION_MODE,
  executionModePermitsBrokerSubmission,
  executionModePermitsLiveSubmission,
} from "@/lib/execution/execution-mode";
import { resetExecutionConfigForTests, getExecutionMode } from "@/lib/execution/execution-config";
import {
  assertStrategyTransition,
  canTransitionStrategyState,
  CATALYST_MOMENTUM_HAPPY_PATH,
  StrategyStateTransitionError,
  transitionStrategyState,
} from "@/lib/execution/strategy/transitions";
import { validateTradeIntent } from "@/lib/execution/intent/trade-intent";
import { PaperBrokerAdapter } from "@/lib/execution/broker/adapters/paper-broker-adapter";
import { buildCatalystMomentumTradeIntent } from "@/lib/execution/__tests__/fixtures/catalyst-momentum-v1.fixture";

describe("execution mode", () => {
  it("defaults to observe", () => {
    resetExecutionConfigForTests();
    expect(DEFAULT_EXECUTION_MODE).toBe("observe");
    expect(getExecutionMode()).toBe("observe");
  });

  it("only paper permits broker submission in Sprint 0", () => {
    expect(executionModePermitsBrokerSubmission("observe")).toBe(false);
    expect(executionModePermitsBrokerSubmission("paper")).toBe(true);
    expect(executionModePermitsLiveSubmission("live_confirm")).toBe(true);
    expect(executionModePermitsLiveSubmission("paper")).toBe(false);
  });
});

describe("strategy state machine", () => {
  it("allows the catalyst momentum happy path", () => {
    for (let i = 0; i < CATALYST_MOMENTUM_HAPPY_PATH.length - 1; i += 1) {
      const from = CATALYST_MOMENTUM_HAPPY_PATH[i];
      const to = CATALYST_MOMENTUM_HAPPY_PATH[i + 1];
      expect(canTransitionStrategyState(from, to)).toBe(true);
      expect(transitionStrategyState(from, to)).toBe(to);
    }
  });

  it("rejects arbitrary transitions", () => {
    expect(() => assertStrategyTransition("DISCOVERED", "ENTERED")).toThrow(
      StrategyStateTransitionError,
    );
    expect(canTransitionStrategyState("DISCOVERED", "ENTERED")).toBe(false);
  });
});

describe("trade intent validation", () => {
  it("requires quantity or notional", () => {
    const intent = buildCatalystMomentumTradeIntent({
      correlationId: "c1",
      triggerPrice: 10,
      quantity: 10,
    });
    expect(validateTradeIntent(intent)).toBeNull();
  });
});

describe("broker capabilities", () => {
  it("paper adapter advertises simulation and core capabilities", async () => {
    const paper = new PaperBrokerAdapter();
    const caps = paper.getCapabilities();
    expect(caps.supportsMarketOrders).toBe(true);
    expect(caps.supportsOrderCancel).toBe(true);
    const acct = await paper.getAccount();
    expect(acct.isSimulated).toBe(true);
    expect(acct.displayName.toLowerCase()).toContain("simulation");
  });
});
