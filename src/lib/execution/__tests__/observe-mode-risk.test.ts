import { describe, expect, it, vi } from "vitest";
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
import { PaperTraderSession } from "@/lib/execution/runtime/paper-trader-session";
import { computeSessionSummary } from "@/lib/execution/observation/session-review";
import { radarRankedRowToStocksistSignal } from "@/lib/execution/signal/map-radar-row-to-stocksist-signal";
import type { RadarRankedRow } from "@/features/day-trade-radar-v2/types";

describe("observe mode risk evaluation", () => {
  it("runs RiskGateway when execution is disabled in observe mode", async () => {
    const log = createInMemoryTradingEventLog();
    const paper = new PaperBrokerAdapter();
    paper.setReferencePrice(SYNTH_HIGH_VOL_SYMBOL, 15);
    const gateway = new RiskGateway({
      killSwitchStore: createInMemoryKillSwitchStore(),
      limits: { ...DEFAULT_RISK_GATEWAY_LIMITS, symbolCooldownMs: 0 },
    });
    const router = new ExecutionRouter({
      eventLog: log,
      resolveMode: () => "observe",
      resolveBrokerAdapter: (m) => (m === "paper" ? paper : null),
    });
    const executeApproved = vi.spyOn(router, "executeApproved");
    const orchestrator = new ExecutionOrchestrator({
      riskGateway: gateway,
      router,
      eventLog: log,
      intentDedupeStore: createInMemoryIntentDedupeStore(),
      resolvePolicy: () => ({ executionMode: "observe", executionEnabled: false }),
      buildRiskContext: (_intent, policy) =>
        buildPaperRiskContext({
          mode: policy.executionMode,
          executionEnabled: policy.executionEnabled,
        }),
    });

    const intent = buildCatalystMomentumTradeIntent({
      correlationId: "obs-risk",
      triggerPrice: 15,
      quantity: 4,
    });
    const result = await orchestrator.execute(intent);
    expect(result.status).toBe("observe_only");
    expect(result.reasonCodes).toContain("APPROVED");
    expect(result.riskDecision?.approved).toBe(true);
    expect(executeApproved).not.toHaveBeenCalled();
  });

  it("records actual risk rejection codes in observe mode", async () => {
    const log = createInMemoryTradingEventLog();
    const paper = new PaperBrokerAdapter();
    paper.setReferencePrice(SYNTH_HIGH_VOL_SYMBOL, 15);
    const badCtx = buildPaperRiskContext({ mode: "observe", executionEnabled: false });
    badCtx.market.spreadBps = 999;

    const orchestrator = new ExecutionOrchestrator({
      riskGateway: new RiskGateway({
        killSwitchStore: createInMemoryKillSwitchStore(),
        limits: { ...DEFAULT_RISK_GATEWAY_LIMITS, maxSpreadBps: 5, symbolCooldownMs: 0 },
      }),
      router: new ExecutionRouter({
        eventLog: log,
        resolveMode: () => "observe",
        resolveBrokerAdapter: (m) => (m === "paper" ? paper : null),
      }),
      eventLog: log,
      intentDedupeStore: createInMemoryIntentDedupeStore(),
      resolvePolicy: () => ({ executionMode: "observe", executionEnabled: false }),
      buildRiskContext: () => badCtx,
    });

    const intent = buildCatalystMomentumTradeIntent({
      correlationId: "obs-reject",
      triggerPrice: 15,
      quantity: 4,
    });
    const result = await orchestrator.execute(intent);
    expect(result.status).toBe("risk_rejected");
    expect(result.reasonCodes).toContain("SPREAD_TOO_WIDE");
    expect(result.reasonCodes).not.toContain("TRADING_DISABLED");
  });

  function radarRow(overrides: Partial<RadarRankedRow> = {}): RadarRankedRow {
    return {
      symbol: SYNTH_HIGH_VOL_SYMBOL,
      price: 15,
      change_percent: 5,
      volume: 2_000_000,
      rvol_5m: 4,
      primary_scanner_event: "MOMENTUM_SPIKE",
      signal: "BUILDING",
      updated_at: "2026-10-07T14:00:00Z",
      rank: 1,
      ...overrides,
    } as RadarRankedRow;
  }

  it("does not change paper portfolio in observe mode", async () => {
    const session = new PaperTraderSession({ mode: "observe", executionEnabled: false });
    const signal = radarRankedRowToStocksistSignal(radarRow(), "radar")!;
    await session.processSignal(signal);
    const account = session.getAccount();
    expect(account.openPositions).toHaveLength(0);
    expect(account.cash).toBe(100_000);
  });

  it("keeps paper mode behavior when execution enabled", async () => {
    const session = new PaperTraderSession({ mode: "paper", executionEnabled: true });
    const signal = radarRankedRowToStocksistSignal(radarRow({ symbol: "OBS-PAPER" }), "radar")!;
    await session.processSignal(signal);
    expect(session.getAccount().openPositions.length).toBeGreaterThan(0);
  });

  it("session review counts observational approvals and real rejections", async () => {
    const session = new PaperTraderSession({ mode: "observe", executionEnabled: false });
    await session.processSignal(radarRankedRowToStocksistSignal(radarRow({ symbol: "OBS-OK" }), "radar")!);
    session.killSwitchStore.activate({
      scope: "GLOBAL",
      strategyId: null,
      symbol: null,
      semantics: ["BLOCK_NEW_ENTRIES"],
      activatedAt: new Date().toISOString(),
      reason: "test",
    });
    await session.processSignal(radarRankedRowToStocksistSignal(radarRow({ symbol: "OBS-BLOCK" }), "radar")!);
    const summary = computeSessionSummary(session.getShadowRecords(), session.getAccount());
    expect(summary.opportunities).toBe(2);
    expect(summary.approved).toBe(1);
    expect(summary.rejected).toBe(1);
    expect(summary.paperTrades).toBe(0);
    expect(
      session.getShadowRecords().every((r) => !r.rejectionReasons.includes("TRADING_DISABLED")),
    ).toBe(true);
  });

  it("paper mode with execution disabled still returns TRADING_DISABLED before risk", async () => {
    const log = createInMemoryTradingEventLog();
    const orchestrator = new ExecutionOrchestrator({
      riskGateway: new RiskGateway({
        killSwitchStore: createInMemoryKillSwitchStore(),
        limits: { ...DEFAULT_RISK_GATEWAY_LIMITS, symbolCooldownMs: 0 },
      }),
      router: new ExecutionRouter({
        eventLog: log,
        resolveMode: () => "paper",
        resolveBrokerAdapter: () => null,
      }),
      eventLog: log,
      intentDedupeStore: createInMemoryIntentDedupeStore(),
      resolvePolicy: () => ({ executionMode: "paper", executionEnabled: false }),
      buildRiskContext: (_intent, policy) =>
        buildPaperRiskContext({
          mode: policy.executionMode,
          executionEnabled: policy.executionEnabled,
        }),
    });
    const intent = buildCatalystMomentumTradeIntent({
      correlationId: "paper-off",
      triggerPrice: 15,
      quantity: 4,
    });
    const result = await orchestrator.execute(intent);
    expect(result.status).toBe("execution_disabled");
    expect(result.reasonCodes).toContain("TRADING_DISABLED");
  });
});
