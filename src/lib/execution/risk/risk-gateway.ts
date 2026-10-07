import type { TradeIntent } from "@/lib/execution/intent/trade-intent";
import { validateTradeIntent } from "@/lib/execution/intent/trade-intent";
import type { RiskDecision } from "@/lib/execution/risk/risk-decision";
import type { RiskReasonCode } from "@/lib/execution/risk/reason-codes";
import { killSwitchBlocksNewEntries, type KillSwitchStore } from "@/lib/execution/kill-switch/kill-switch-store";
import {
  DEFAULT_EXECUTION_MODE,
  executionModePermitsBrokerSubmission,
  type ExecutionMode,
} from "@/lib/execution/execution-mode";

export interface RiskGatewayLimits {
  maxOpenPositions: number;
  maxPositionNotional: number;
  maxTradeNotional: number;
  maxPortfolioExposure: number;
  maxDailyLoss: number;
  maxSpreadBps: number;
  symbolCooldownMs: number;
}

export const DEFAULT_RISK_GATEWAY_LIMITS: RiskGatewayLimits = {
  maxOpenPositions: 5,
  maxPositionNotional: 25_000,
  maxTradeNotional: 10_000,
  maxPortfolioExposure: 50_000,
  maxDailyLoss: 2_500,
  maxSpreadBps: 80,
  symbolCooldownMs: 60_000,
};

export interface RiskGatewayMarketContext {
  asOfMs: number;
  snapshotAgeMs: number | null;
  spreadBps: number | null;
  symbolHalted: boolean;
  buyingPower: number;
}

export interface RiskGatewayPortfolioContext {
  openPositionCount: number;
  openSymbols: readonly string[];
  dailyRealizedPnl: number;
  lastEntryBySymbol: Readonly<Record<string, number>>;
  pendingClientOrderIds: readonly string[];
  grossExposure: number;
  positionQuantityBySymbol: Readonly<Record<string, number>>;
}

export interface RiskGatewayPolicyContext {
  executionMode: ExecutionMode;
  executionEnabled: boolean;
  allowedSymbols: readonly string[] | null;
  allowedStrategyIds: readonly string[] | null;
}

export interface RiskGatewayContext {
  market: RiskGatewayMarketContext;
  portfolio: RiskGatewayPortfolioContext;
  policy: RiskGatewayPolicyContext;
}

export interface RiskGatewayDeps {
  killSwitchStore: KillSwitchStore;
  limits?: RiskGatewayLimits;
  now?: () => number;
  idFactory?: () => string;
}

function reject(
  idFactory: () => string,
  intent: TradeIntent,
  codes: RiskReasonCode[],
  evaluatedAt: string,
): RiskDecision {
  return {
    id: idFactory(),
    tradeIntentId: intent.id,
    approved: false,
    reasonCodes: codes,
    approvedQuantity: null,
    approvedNotional: null,
    approvedStopPrice: null,
    evaluatedAt,
  };
}

function approve(
  idFactory: () => string,
  intent: TradeIntent,
  quantity: number,
  evaluatedAt: string,
  stop: number | null,
): RiskDecision {
  return {
    id: idFactory(),
    tradeIntentId: intent.id,
    approved: true,
    reasonCodes: ["APPROVED"],
    approvedQuantity: quantity,
    approvedNotional: null,
    approvedStopPrice: stop,
    evaluatedAt,
  };
}

/**
 * Deterministic risk boundary — no AI override path exists.
 */
export class RiskGateway {
  private readonly limits: RiskGatewayLimits;
  private readonly killSwitchStore: KillSwitchStore;
  private readonly now: () => number;
  private readonly idFactory: () => string;

  constructor(deps: RiskGatewayDeps) {
    this.killSwitchStore = deps.killSwitchStore;
    this.limits = deps.limits ?? DEFAULT_RISK_GATEWAY_LIMITS;
    this.now = deps.now ?? (() => Date.now());
    this.idFactory = deps.idFactory ?? (() => `risk-${this.now()}`);
  }

  evaluate(intent: TradeIntent, ctx: RiskGatewayContext): RiskDecision {
    const evaluatedAt = new Date(this.now()).toISOString();
    const invalid = validateTradeIntent(intent);
    if (invalid) {
      return reject(this.idFactory, intent, ["INVALID_TRADE_INTENT"], evaluatedAt);
    }

    const symbol = intent.symbol.trim().toUpperCase();
    const isExit = intent.side === "sell" || intent.intentType === "exit" || intent.intentType === "scale_out";

    const mode = ctx.policy.executionMode ?? DEFAULT_EXECUTION_MODE;
    if (!ctx.policy.executionEnabled && mode !== "observe") {
      return reject(this.idFactory, intent, ["TRADING_DISABLED"], evaluatedAt);
    }
    if (!executionModePermitsBrokerSubmission(mode) && mode !== "observe") {
      return reject(this.idFactory, intent, ["LIVE_EXECUTION_DISABLED"], evaluatedAt);
    }

    if (!isExit) {
      const ks = killSwitchBlocksNewEntries(this.killSwitchStore, {
        strategyId: intent.strategyId,
        symbol,
      });
      if (ks) {
        const code: RiskReasonCode =
          ks.scope === "GLOBAL"
            ? "GLOBAL_KILL_SWITCH"
            : ks.scope === "STRATEGY"
              ? "STRATEGY_KILL_SWITCH"
              : "SYMBOL_KILL_SWITCH";
        return reject(this.idFactory, intent, [code], evaluatedAt);
      }
    }

    if (ctx.market.symbolHalted) {
      return reject(this.idFactory, intent, ["MARKET_HALTED"], evaluatedAt);
    }

    const staleMs = ctx.market.snapshotAgeMs;
    if (staleMs == null || staleMs > 60_000) {
      return reject(this.idFactory, intent, ["STALE_MARKET_DATA"], evaluatedAt);
    }

    if (ctx.policy.allowedSymbols && !ctx.policy.allowedSymbols.includes(symbol)) {
      return reject(this.idFactory, intent, ["SYMBOL_NOT_ALLOWED"], evaluatedAt);
    }
    if (
      ctx.policy.allowedStrategyIds &&
      !ctx.policy.allowedStrategyIds.includes(intent.strategyId)
    ) {
      return reject(this.idFactory, intent, ["STRATEGY_NOT_ALLOWED"], evaluatedAt);
    }

    const spread = ctx.market.spreadBps;
    if (spread != null && spread > this.limits.maxSpreadBps) {
      return reject(this.idFactory, intent, ["SPREAD_TOO_WIDE"], evaluatedAt);
    }

    if (ctx.portfolio.dailyRealizedPnl <= -this.limits.maxDailyLoss) {
      return reject(this.idFactory, intent, ["MAX_DAILY_LOSS"], evaluatedAt);
    }

    if (!isExit && ctx.portfolio.openPositionCount >= this.limits.maxOpenPositions) {
      return reject(this.idFactory, intent, ["MAX_OPEN_POSITIONS"], evaluatedAt);
    }

    const clientKey = intent.id;
    if (ctx.portfolio.pendingClientOrderIds.includes(clientKey)) {
      return reject(this.idFactory, intent, ["DUPLICATE_ORDER"], evaluatedAt);
    }

    if (!isExit) {
      const lastEntry = ctx.portfolio.lastEntryBySymbol[symbol];
      if (lastEntry != null && this.now() - lastEntry < this.limits.symbolCooldownMs) {
        return reject(this.idFactory, intent, ["SYMBOL_COOLDOWN"], evaluatedAt);
      }
    }

    const qty = intent.requestedQuantity ?? 0;
    const refPrice = intent.triggerPrice ?? 1;
    const notional = intent.requestedNotional ?? qty * refPrice;
    if (!isExit) {
      if (notional > this.limits.maxTradeNotional) {
        return reject(this.idFactory, intent, ["MAX_TRADE_NOTIONAL"], evaluatedAt);
      }
      if (notional > this.limits.maxPositionNotional) {
        return reject(this.idFactory, intent, ["MAX_POSITION_NOTIONAL"], evaluatedAt);
      }
      if (ctx.portfolio.grossExposure + notional > this.limits.maxPortfolioExposure) {
        return reject(this.idFactory, intent, ["MAX_PORTFOLIO_EXPOSURE"], evaluatedAt);
      }
    }

    const finalQty =
      intent.requestedQuantity ??
      Math.floor((intent.requestedNotional ?? 0) / Math.max(refPrice, 0.01));
    if (finalQty <= 0) {
      return reject(this.idFactory, intent, ["INVALID_TRADE_INTENT"], evaluatedAt);
    }

    if (isExit) {
      const held = ctx.portfolio.positionQuantityBySymbol[symbol] ?? 0;
      if (held < finalQty) {
        return reject(this.idFactory, intent, ["INVALID_TRADE_INTENT"], evaluatedAt);
      }
      return approve(this.idFactory, intent, finalQty, evaluatedAt, intent.invalidationPrice);
    }

    const orderNotional = finalQty * refPrice;
    if (orderNotional > ctx.market.buyingPower) {
      return reject(this.idFactory, intent, ["INSUFFICIENT_BUYING_POWER"], evaluatedAt);
    }

    return approve(
      this.idFactory,
      intent,
      finalQty,
      evaluatedAt,
      intent.invalidationPrice,
    );
  }
}
