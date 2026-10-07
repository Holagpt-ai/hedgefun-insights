/**
 * Synthetic high-volatility catalyst momentum scenario for architecture tests only.
 * Not production data — do not import from UI or runtime services.
 */

import type { TradeIntent } from "@/lib/execution/intent/trade-intent";
import type { RiskGatewayContext } from "@/lib/execution/risk/risk-gateway";
import type { ExecutionMode } from "@/lib/execution/execution-mode";

export const CATALYST_MOMENTUM_V1_STRATEGY_ID = "CATALYST_MOMENTUM_V1";

/** Generic synthetic symbol — not a real ticker claim. */
export const SYNTH_HIGH_VOL_SYMBOL = "SYNTH_HVOL";

export interface CatalystMomentumSyntheticSnapshot {
  symbol: string;
  catalystVerified: boolean;
  rvol: number;
  volumeAccelerationPct: number;
  atrPct: number;
  aboveVwap: boolean;
  hodProximityPct: number;
  breakoutTriggered: boolean;
}

export function buildCatalystMomentumSyntheticSnapshot(
  overrides: Partial<CatalystMomentumSyntheticSnapshot> = {},
): CatalystMomentumSyntheticSnapshot {
  return {
    symbol: SYNTH_HIGH_VOL_SYMBOL,
    catalystVerified: true,
    rvol: 4.2,
    volumeAccelerationPct: 180,
    atrPct: 6.5,
    aboveVwap: true,
    hodProximityPct: 0.4,
    breakoutTriggered: true,
    ...overrides,
  };
}

export function buildCatalystMomentumTradeIntent(input: {
  correlationId: string;
  triggerPrice: number;
  quantity: number;
  catalystId?: string;
  profileId?: string;
}): TradeIntent {
  return {
    id: `intent-${input.correlationId}`,
    correlationId: input.correlationId,
    symbol: SYNTH_HIGH_VOL_SYMBOL,
    strategyId: CATALYST_MOMENTUM_V1_STRATEGY_ID,
    side: "buy",
    intentType: "entry",
    triggerPrice: input.triggerPrice,
    invalidationPrice: input.triggerPrice * 0.97,
    requestedQuantity: input.quantity,
    requestedNotional: null,
    marketSnapshotId: `snap-${input.correlationId}`,
    catalystId: input.catalystId ?? "cat-synthetic-verified",
    historicalBehaviorProfileId: input.profileId ?? "hbp-synthetic-1",
    generatedAt: new Date().toISOString(),
    metadata: {
      fixture: "catalyst-momentum-v1",
      snapshot: buildCatalystMomentumSyntheticSnapshot(),
    },
  };
}

export function buildPaperRiskContext(input: {
  mode: ExecutionMode;
  executionEnabled: boolean;
  buyingPower?: number;
  nowMs?: number;
}): RiskGatewayContext {
  const nowMs = input.nowMs ?? Date.now();
  return {
    market: {
      asOfMs: nowMs,
      snapshotAgeMs: 500,
      spreadBps: 25,
      symbolHalted: false,
      buyingPower: input.buyingPower ?? 50_000,
    },
    portfolio: {
      openPositionCount: 0,
      openSymbols: [],
      dailyRealizedPnl: 0,
      lastEntryBySymbol: {},
      pendingClientOrderIds: [],
      grossExposure: 0,
      positionQuantityBySymbol: {},
    },
    policy: {
      executionMode: input.mode,
      executionEnabled: input.executionEnabled,
      allowedSymbols: [SYNTH_HIGH_VOL_SYMBOL],
      allowedStrategyIds: [CATALYST_MOMENTUM_V1_STRATEGY_ID],
    },
  };
}
