/**
 * Day Trade Radar Top-10 opportunity desk (V1).
 * Weights are bounded so no single raw metric dominates the composite score.
 */

export const DAY_TRADE_RADAR_TOP_N = 10;

/** Minimum composite score (0–100) to appear in the ranked Top-10 desk. */
export const DAY_TRADE_RADAR_MIN_OPPORTUNITY_SCORE = 28;

/** Soft floor: session share volume below this is heavily penalized, not hard-banned. */
export const DAY_TRADE_RADAR_SOFT_MIN_SESSION_VOLUME = 50_000;

/** Rolling 60s share volume below this fails eligibility unless session volume is exceptional. */
export const DAY_TRADE_RADAR_MIN_VOLUME_60S = 5_000;

/** Exceptional session volume that can qualify without strong 60s velocity. */
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

export type DayTradeAttentionTier = "PRIME" | "ACTIVE" | "WATCH";

export function attentionTierForOpportunityRank(rank: number): DayTradeAttentionTier | null {
  if (!Number.isInteger(rank) || rank < 1) return null;
  if (rank <= 3) return "PRIME";
  if (rank <= 6) return "ACTIVE";
  if (rank <= DAY_TRADE_RADAR_TOP_N) return "WATCH";
  return null;
}
