import { describe, it, expect, beforeEach } from "vitest";
import { ExecutionOrchestrator } from "@/lib/execution/orchestrator/execution-orchestrator";
import { createInMemoryIntentDedupeStore } from "@/lib/execution/orchestrator/intent-dedupe-store";
import { ExecutionRouter } from "@/lib/execution/router/execution-router";
import { RiskGateway, DEFAULT_RISK_GATEWAY_LIMITS } from "@/lib/execution/risk/risk-gateway";
import { createInMemoryKillSwitchStore } from "@/lib/execution/kill-switch/kill-switch-store";
import { createInMemoryTradingEventLog } from "@/lib/execution/events/trading-event-log";
import { PaperBrokerAdapter } from "@/lib/execution/broker/adapters/paper-broker-adapter";
import {
  buildCatalystMomentumTradeIntent,
  buildPaperRiskContext,
  SYNTH_HIGH_VOL_SYMBOL,
} from "@/lib/execution/__tests__/fixtures/catalyst-momentum-v1.fixture";
import type { ExecutionMode } from "@/lib/execution/execution-mode";
import type { TradeIntent } from "@/lib/execution/intent/trade-intent";

function buildStack(input: {
  mode: ExecutionMode;
  executionEnabled: boolean;
  paper?: PaperBrokerAdapter;
}) {
  const log = createInMemoryTradingEventLog();
  const paper = input.paper ?? new PaperBrokerAdapter();
  const dedupe = createInMemoryIntentDedupeStore();
  const killSwitch = createInMemoryKillSwitchStore();
  const gateway = new RiskGateway({
    killSwitchStore: killSwitch,
    limits: { ...DEFAULT_RISK_GATEWAY_LIMITS, symbolCooldownMs: 0 },
  });
  const router = new ExecutionRouter({
    eventLog: log,
    resolveMode: () => input.mode,
    resolveBrokerAdapter: (m) => (m === "paper" ? paper : null),
  });
  const orchestrator = new ExecutionOrchestrator({
    riskGateway: gateway,
    router,
    eventLog: log,
    intentDedupeStore: dedupe,
    resolvePolicy: () => ({
      executionMode: input.mode,
      executionEnabled: input.executionEnabled,
    }),
    buildRiskContext: (_intent, policy) =>
      buildPaperRiskContext({
        mode: policy.executionMode,
        executionEnabled: policy.executionEnabled,
      }),
  });
  return { orchestrator, log, paper, killSwitch, dedupe };
}

describe("ExecutionOrchestrator Sprint 1", () => {
  let intent: TradeIntent;

  beforeEach(() => {
    intent = buildCatalystMomentumTradeIntent({
      correlationId: "orch-1",
      triggerPrice: 15,
      quantity: 4,
    });
  });

  it("CASE A — first delivery in paper mode completes with lifecycle events", async () => {
    const { orchestrator, log, paper } = buildStack({ mode: "paper", executionEnabled: true });
    paper.setReferencePrice(SYNTH_HIGH_VOL_SYMBOL, 15);

    const result = await orchestrator.execute(intent);
    expect(result.status).toBe("completed");
    expect(result.orderId).not.toBeNull();

    const types = log.getByCorrelationId(intent.correlationId).map((e) => e.eventType);
    expect(types).toContain("INTENT_RECEIVED");
    expect(types).toContain("RISK_APPROVED");
    expect(types).toContain("ORDER_SUBMITTED");
    expect(types).toContain("ORDER_FILLED");
    expect(types).toContain("EXECUTION_COMPLETED");
  });

  it("CASE B — reload duplicate same intent id is ignored", async () => {
    const { orchestrator, paper } = buildStack({ mode: "paper", executionEnabled: true });
    paper.setReferencePrice(SYNTH_HIGH_VOL_SYMBOL, 15);

    const first = await orchestrator.execute(intent);
    const second = await orchestrator.execute(intent);
    expect(first.status).toBe("completed");
    expect(second.status).toBe("duplicate_intent");
    expect(second.reasonCodes).toContain("DUPLICATE_ORDER");
  });

  it("CASE C — observe mode logs intent without broker submission", async () => {
    const { orchestrator, log, paper } = buildStack({ mode: "observe", executionEnabled: true });
    paper.setReferencePrice(SYNTH_HIGH_VOL_SYMBOL, 15);

    const result = await orchestrator.execute(intent);
    expect(result.status).toBe("observe_only");
    expect(result.routerResult).toBeNull();
    const types = log.getByCorrelationId(intent.correlationId).map((e) => e.eventType);
    expect(types).toContain("INTENT_RECEIVED");
    expect(types).toContain("RISK_REJECTED");
    expect(types).not.toContain("ORDER_SUBMITTED");
  });

  it("CASE D — kill switch blocks broker path", async () => {
    const { orchestrator, log, killSwitch } = buildStack({ mode: "paper", executionEnabled: true });
    killSwitch.activate({
      scope: "GLOBAL",
      strategyId: null,
      symbol: null,
      semantics: ["BLOCK_NEW_ENTRIES"],
      activatedAt: new Date().toISOString(),
      reason: "test",
    });

    const result = await orchestrator.execute(intent);
    expect(result.status).toBe("risk_rejected");
    expect(result.reasonCodes).toContain("GLOBAL_KILL_SWITCH");
    expect(log.getEvents().some((e) => e.eventType === "ORDER_SUBMITTED")).toBe(false);
  });

  it("CASE E — live_confirm fails closed", async () => {
    const { orchestrator, log } = buildStack({ mode: "live_confirm", executionEnabled: true });
    const result = await orchestrator.execute(intent);
    expect(result.status).toBe("live_unavailable");
    expect(result.reasonCodes).toContain("LIVE_EXECUTION_DISABLED");
    expect(log.getEvents().some((e) => e.eventType === "ORDER_SUBMITTED")).toBe(false);
  });

  it("CASE F — live_autonomous fails closed", async () => {
    const { orchestrator } = buildStack({ mode: "live_autonomous", executionEnabled: true });
    const result = await orchestrator.execute(intent);
    expect(result.status).toBe("live_unavailable");
  });

  it("CASE G — duplicate intent after successful paper run", async () => {
    const { orchestrator, paper } = buildStack({ mode: "paper", executionEnabled: true });
    paper.setReferencePrice(SYNTH_HIGH_VOL_SYMBOL, 15);
    await orchestrator.execute(intent);
    const dup = await orchestrator.execute(intent);
    expect(dup.status).toBe("duplicate_intent");
  });

  it("CASE H — paper broker failure is logged without fabricated success", async () => {
    const paper = new PaperBrokerAdapter();
    const { orchestrator, log } = buildStack({ mode: "paper", executionEnabled: true, paper });
    const result = await orchestrator.execute(intent);
    expect(result.status).toBe("broker_failed");
    expect(result.orderId).toBeNull();
    expect(log.getEvents().some((e) => e.eventType === "EXECUTION_COMPLETED")).toBe(false);
    expect(log.getEvents().some((e) => e.eventType === "ORDER_REJECTED")).toBe(true);
  });

  it("risk rejection without broker when spread too wide", async () => {
    const log = createInMemoryTradingEventLog();
    const paper = new PaperBrokerAdapter();
    paper.setReferencePrice(SYNTH_HIGH_VOL_SYMBOL, 15);
    const badCtx = buildPaperRiskContext({ mode: "paper", executionEnabled: true });
    badCtx.market.spreadBps = 999;

    const orchestratorWide = new ExecutionOrchestrator({
      riskGateway: new RiskGateway({
        killSwitchStore: createInMemoryKillSwitchStore(),
        limits: { ...DEFAULT_RISK_GATEWAY_LIMITS, maxSpreadBps: 5, symbolCooldownMs: 0 },
      }),
      router: new ExecutionRouter({
        eventLog: log,
        resolveMode: () => "paper",
        resolveBrokerAdapter: (m) => (m === "paper" ? paper : null),
      }),
      eventLog: log,
      intentDedupeStore: createInMemoryIntentDedupeStore(),
      resolvePolicy: () => ({ executionMode: "paper", executionEnabled: true }),
      buildRiskContext: () => badCtx,
    });

    const result = await orchestratorWide.execute(intent);
    expect(result.status).toBe("risk_rejected");
    expect(result.reasonCodes).toContain("SPREAD_TOO_WIDE");
    expect(log.getEvents().some((e) => e.eventType === "ORDER_SUBMITTED")).toBe(false);
  });

  it("mixed old processed + new intent id notifies once for new only", async () => {
    const { orchestrator, paper } = buildStack({ mode: "paper", executionEnabled: true });
    paper.setReferencePrice(SYNTH_HIGH_VOL_SYMBOL, 15);

    const oldIntent = intent;
    const newIntent = buildCatalystMomentumTradeIntent({
      correlationId: "orch-new",
      triggerPrice: 15,
      quantity: 2,
    });
    newIntent.id = "intent-orch-new-unique";

    await orchestrator.execute(oldIntent);
    const replay = await orchestrator.execute(oldIntent);
    const fresh = await orchestrator.execute(newIntent);

    expect(replay.status).toBe("duplicate_intent");
    expect(fresh.status).toBe("completed");
  });
});
