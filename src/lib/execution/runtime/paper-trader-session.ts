import { ExecutionOrchestrator } from "@/lib/execution/orchestrator/execution-orchestrator";
import {
  createInMemoryIntentDedupeStore,
  type IntentDedupeStore,
} from "@/lib/execution/orchestrator/intent-dedupe-store";
import { ExecutionRouter } from "@/lib/execution/router/execution-router";
import { RiskGateway, DEFAULT_RISK_GATEWAY_LIMITS, type RiskGatewayLimits } from "@/lib/execution/risk/risk-gateway";
import { createInMemoryKillSwitchStore, type KillSwitchStore } from "@/lib/execution/kill-switch/kill-switch-store";
import { createInMemoryTradingEventLog, type TradingEventLog } from "@/lib/execution/events/trading-event-log";
import { PaperBrokerAdapter } from "@/lib/execution/broker/adapters/paper-broker-adapter";
import type { ExecutionMode } from "@/lib/execution/execution-mode";
import { DEFAULT_EXECUTION_MODE } from "@/lib/execution/execution-mode";
import { PaperPortfolioLedger } from "@/lib/execution/paper/paper-portfolio-ledger";
import { detectLongExitTriggers } from "@/lib/execution/paper/paper-exit-monitor";
import {
  buildExitIntent,
  stocksistSignalToExecutionPlan,
  stocksistSignalToTradeIntent,
} from "@/lib/execution/signal/stocksist-signal-adapter";
import type { StocksistSignal } from "@/lib/execution/signal/stocksist-signal";
import type { ShadowOpportunityRecord } from "@/lib/execution/shadow/shadow-opportunity";
import type { TradeExecutionPlan } from "@/lib/execution/paper/trade-execution-plan";
import type { PaperAccountSnapshot } from "@/lib/execution/paper/paper-account-types";
import { computePaperStatistics, type PaperTradingStatistics } from "@/lib/execution/paper/paper-statistics";
import type { PaperTraderPersistedState } from "@/lib/execution/runtime/paper-trader-persistence";
import type { KillSwitchActivation } from "@/lib/execution/kill-switch/types";

export interface PaperTraderSessionOptions {
  startingCash?: number;
  mode?: ExecutionMode;
  executionEnabled?: boolean;
  limits?: RiskGatewayLimits;
  now?: () => number;
  persisted?: PaperTraderPersistedState | null;
}

export class PaperTraderSession {
  readonly eventLog: TradingEventLog;
  readonly killSwitchStore: KillSwitchStore;
  readonly paperBroker: PaperBrokerAdapter;
  readonly ledger: PaperPortfolioLedger;

  private mode: ExecutionMode;
  private executionEnabled: boolean;
  private readonly orchestrator: ExecutionOrchestrator;
  private readonly riskGateway: RiskGateway;
  private readonly now: () => number;
  private readonly shadowRecords: ShadowOpportunityRecord[] = [];
  private readonly plansBySymbol = new Map<string, TradeExecutionPlan>();
  private readonly intentDedupeStore: IntentDedupeStore;
  private readonly processedSignalIds = new Set<string>();
  private readonly limits: RiskGatewayLimits;

  constructor(options: PaperTraderSessionOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.mode = options.mode ?? DEFAULT_EXECUTION_MODE;
    this.executionEnabled = options.executionEnabled ?? false;
    this.eventLog = createInMemoryTradingEventLog();
    this.killSwitchStore = createInMemoryKillSwitchStore();
    this.paperBroker = new PaperBrokerAdapter({ now: this.now });
    this.ledger = new PaperPortfolioLedger(options.startingCash ?? 100_000);

    this.limits = options.limits ?? { ...DEFAULT_RISK_GATEWAY_LIMITS, symbolCooldownMs: 0 };
    this.riskGateway = new RiskGateway({
      killSwitchStore: this.killSwitchStore,
      limits: this.limits,
      now: this.now,
    });

    const router = new ExecutionRouter({
      eventLog: this.eventLog,
      resolveMode: () => this.mode,
      resolveBrokerAdapter: (m) => (m === "paper" ? this.paperBroker : null),
      now: this.now,
    });

    this.intentDedupeStore = createInMemoryIntentDedupeStore();
    this.orchestrator = new ExecutionOrchestrator({
      riskGateway: this.riskGateway,
      router,
      eventLog: this.eventLog,
      intentDedupeStore: this.intentDedupeStore,
      resolvePolicy: () => ({
        executionMode: this.mode,
        executionEnabled: this.executionEnabled,
      }),
      buildRiskContext: (_intent, policy) => this.buildRiskContext(policy.executionMode, policy.executionEnabled),
      now: this.now,
    });

    if (options.persisted) {
      this.applyPersistedState(options.persisted);
    }
  }

  setMode(mode: ExecutionMode): void {
    this.mode = mode;
  }

  setExecutionEnabled(enabled: boolean): void {
    this.executionEnabled = enabled;
  }

  getMode(): ExecutionMode {
    return this.mode;
  }

  isExecutionEnabled(): boolean {
    return this.executionEnabled;
  }

  hasSeenSignal(signalId: string): boolean {
    return this.processedSignalIds.has(signalId);
  }

  getRiskLimits(): RiskGatewayLimits {
    return { ...this.limits };
  }

  exportPersistedState(): PaperTraderPersistedState {
    return {
      version: 1,
      mode: this.mode,
      executionEnabled: this.executionEnabled,
      startingCash: this.ledger.snapshot().startingCash,
      account: this.getAccount(),
      shadowRecords: this.shadowRecords.slice(0, 150).map((r) => ({
        ...r,
        rejectionReasons: [...r.rejectionReasons],
      })),
      processedSignalIds: [...this.processedSignalIds],
      killSwitchActivations: this.killSwitchStore.getActivations().map((a) => ({
        ...a,
        semantics: [...a.semantics],
      })),
      events: this.eventLog.getEvents().slice(-150).map((e) => ({
        ...e,
        reasonCodes: [...e.reasonCodes],
        payload: { ...e.payload },
        metadata: { ...e.metadata },
      })),
    };
  }

  applyPersistedState(state: PaperTraderPersistedState): void {
    this.mode = state.mode;
    this.executionEnabled = state.executionEnabled;
    this.ledger.loadFromSnapshot(state.account);
    this.shadowRecords.length = 0;
    this.shadowRecords.push(...state.shadowRecords);
    this.processedSignalIds.clear();
    for (const id of state.processedSignalIds) this.processedSignalIds.add(id);
    for (const id of state.processedSignalIds) {
      this.intentDedupeStore.markProcessed(`intent-${id}`);
    }
    this.killSwitchStore.clearAll();
    for (const activation of state.killSwitchActivations) {
      this.killSwitchStore.activate(activation as KillSwitchActivation);
    }
    for (const event of state.events) {
      this.eventLog.append(event);
    }
  }

  reset(startingCash = 100_000): void {
    this.mode = DEFAULT_EXECUTION_MODE;
    this.executionEnabled = false;
    this.shadowRecords.length = 0;
    this.processedSignalIds.clear();
    this.intentDedupeStore.clear();
    this.plansBySymbol.clear();
    this.killSwitchStore.clearAll();
    this.ledger.loadFromSnapshot({
      startingCash,
      cash: startingCash,
      buyingPower: startingCash,
      equity: startingCash,
      realizedPnl: 0,
      unrealizedPnl: 0,
      openPositions: [],
      closedTrades: [],
    });
  }

  async processSignal(signal: StocksistSignal): Promise<ShadowOpportunityRecord | null> {
    if (this.processedSignalIds.has(signal.id)) return null;
    this.processedSignalIds.add(signal.id);
    this.paperBroker.setReferencePrice(signal.symbol, signal.triggerPrice);
    const intent = stocksistSignalToTradeIntent(signal);
    const plan = stocksistSignalToExecutionPlan(signal);
    const result = await this.orchestrator.execute(intent);

    let status: ShadowOpportunityRecord["status"] = "OBSERVING";
    if (result.status === "completed") status = "PAPER_ENTERED";
    else if (result.status === "observe_only" && result.reasonCodes.includes("APPROVED")) {
      status = "APPROVED";
    } else if (result.status === "observe_only") status = "OBSERVING";
    else if (result.status === "risk_rejected" || result.status === "live_unavailable") status = "REJECTED";
    else if (result.status === "duplicate_intent") status = "CLOSED";
    else if (result.status === "broker_failed") status = "REJECTED";

    if (result.status === "completed" && result.orderId) {
      this.plansBySymbol.set(signal.symbol.toUpperCase(), plan);
      try {
        this.ledger.applyLongEntry({
          symbol: signal.symbol,
          quantity: result.riskDecision?.approvedQuantity ?? signal.suggestedQuantity ?? 0,
          fillPrice: signal.triggerPrice,
          correlationId: signal.id,
          originatingIntentId: intent.id,
          openedAt: new Date(this.now()).toISOString(),
          plan,
        });
      } catch {
        status = "REJECTED";
      }
    }

    const record: ShadowOpportunityRecord = {
      signal,
      plan,
      orchestratorResult: result,
      status,
      rejectionReasons: [...result.reasonCodes],
      paperOrderId: result.orderId,
      entryPrice: status === "PAPER_ENTERED" ? signal.triggerPrice : null,
      exitPrice: null,
      exitReason: null,
      realizedPnl: null,
      recordedAt: new Date(this.now()).toISOString(),
    };
    this.shadowRecords.unshift(record);
    return record;
  }

  markToMarket(prices: Readonly<Record<string, number>>): void {
    this.ledger.markToMarket(prices);
    for (const [sym, px] of Object.entries(prices)) {
      this.paperBroker.setReferencePrice(sym, px);
    }
  }

  async processPriceTick(prices: Readonly<Record<string, number>>): Promise<void> {
    this.markToMarket(prices);
    const snap = this.ledger.snapshot();
    const triggers = detectLongExitTriggers(snap.openPositions, prices);
    for (const trig of triggers) {
      const pos = this.ledger.getPosition(trig.symbol);
      if (!pos) continue;
      const exitSignal: StocksistSignal = {
        id: `exit-${trig.symbol}-${trig.exitReason}-${this.now()}`,
        symbol: trig.symbol,
        strategyId: "PAPER_EXIT",
        side: "sell",
        triggerPrice: trig.currentPrice,
        suggestedQuantity: trig.quantity,
        suggestedNotional: null,
        stopLossPrice: null,
        profitTargetPrice: null,
        eventType: trig.exitReason,
        catalystId: null,
        volume: null,
        rvol: null,
        momentumScore: null,
        aboveVwap: null,
        hodProximityPct: null,
        floatTurnover: null,
        historicalContext: null,
        thesisSummary: null,
        signalAt: new Date(this.now()).toISOString(),
        metadata: { autoExit: true },
      };
      const intent = buildExitIntent({
        positionIntentId: pos.originatingIntentId,
        correlationId: exitSignal.id,
        symbol: trig.symbol,
        strategyId: "PAPER_EXIT",
        quantity: trig.quantity,
        triggerPrice: trig.currentPrice,
        exitReason: trig.exitReason,
      });
      intent.id = `intent-${exitSignal.id}`;
      const result = await this.orchestrator.execute(intent);
      if (result.status === "completed") {
        const closed = this.ledger.applyLongExit({
          symbol: trig.symbol,
          quantity: trig.quantity,
          fillPrice: trig.currentPrice,
          closedAt: new Date(this.now()).toISOString(),
          exitReason: trig.exitReason,
          correlationId: exitSignal.id,
        });
        const shadow = this.shadowRecords.find((r) => r.signal.symbol === trig.symbol && r.status === "PAPER_ENTERED");
        if (shadow && closed) {
          shadow.status = trig.exitReason === "STOP_LOSS" ? "STOPPED" : "TARGET_HIT";
          shadow.exitPrice = trig.currentPrice;
          shadow.exitReason = trig.exitReason;
          shadow.realizedPnl = closed.realizedPnl;
        }
      }
    }
  }

  getAccount(): PaperAccountSnapshot {
    return this.ledger.snapshot();
  }

  getStatistics(): PaperTradingStatistics {
    return computePaperStatistics(this.getAccount());
  }

  getShadowRecords(): readonly ShadowOpportunityRecord[] {
    return this.shadowRecords;
  }

  getRecentEvents(limit = 30) {
    return this.eventLog.getEvents().slice(-limit).reverse();
  }

  getAllEvents() {
    return this.eventLog.getEvents();
  }

  private buildRiskContext(mode: ExecutionMode, executionEnabled: boolean) {
    const snap = this.ledger.snapshot();
    return {
      market: {
        asOfMs: this.now(),
        snapshotAgeMs: 500,
        spreadBps: 20,
        symbolHalted: false,
        buyingPower: snap.buyingPower,
      },
      portfolio: {
        openPositionCount: snap.openPositions.length,
        openSymbols: snap.openPositions.map((p) => p.symbol),
        dailyRealizedPnl: snap.realizedPnl,
        lastEntryBySymbol: {},
        pendingClientOrderIds: [],
        grossExposure: this.ledger.grossExposure(),
        positionQuantityBySymbol: Object.fromEntries(
          snap.openPositions.map((p) => [p.symbol, p.quantity]),
        ),
      },
      policy: {
        executionMode: mode,
        executionEnabled,
        allowedSymbols: null,
        allowedStrategyIds: null,
      },
    };
  }
}
