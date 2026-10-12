/** Edge-safe copy of src/config/day-trade-radar-opportunity.config.ts */

export const DAY_TRADE_RADAR_TOP_N = 10;
export const DAY_TRADE_RADAR_MIN_OPPORTUNITY_SCORE = 30;
export const DAY_TRADE_RADAR_SOFT_MIN_SESSION_VOLUME = 50_000;
export const DAY_TRADE_RADAR_MIN_VOLUME_60S = 5_000;
export const DAY_TRADE_RADAR_MIN_VOL_VELOCITY = 2_500;
export const DAY_TRADE_RADAR_SESSION_VOLUME_EXCEPTION = 2_000_000;

export const DAY_TRADE_OPPORTUNITY_WEIGHTS = {
  volumeLiquidity: 32,
  momentum: 24,
  freshness: 14,
  hodStructure: 10,
  catalystEvent: 8,
  tradability: 7,
  historical: 5,
} as const;

export const DAY_TRADE_SESSION_VOLUME_BLEND = {
  baseSessionShare: 0.38,
  coolingSessionShare: 0.14,
  staleSessionShare: 0.1,
} as const;

export const DAY_TRADE_TRADABILITY_BANDS = {
  accessibleMax: 20,
  accessibleMultiplier: 1,
  midMax: 100,
  midMultiplier: 0.88,
  highMax: 300,
  highMultiplier: 0.52,
  ultraMultiplier: 0.28,
} as const;

export const DAY_TRADE_SUB_DOLLAR_MAIN_DESK = {
  maxSessionVolumeIfVelocityBelow: 500_000,
  maxVelocityWeak: 5_000,
  minSessionVolumeStrong: 1_000_000,
  minVelocityStrong: 50_000,
  minVolume60sStrong: 50_000,
  minDollar60sStrong: 200_000,
} as const;

export const DAY_TRADE_CATALYST_SCORE = {
  directTicker: 0.95,
  scheduledTicker: 0.72,
  scannerEventOnly: 0.62,
  neutral: 0.42,
  none: 0.42,
} as const;

export type DayTradeAttentionTier = "PRIME" | "ACTIVE" | "WATCH";

export function attentionTierForOpportunityRank(rank: number): DayTradeAttentionTier | null {
  if (!Number.isInteger(rank) || rank < 1) return null;
  if (rank <= 3) return "PRIME";
  if (rank <= 6) return "ACTIVE";
  if (rank <= DAY_TRADE_RADAR_TOP_N) return "WATCH";
  return null;
}
