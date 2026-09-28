/**
 * Day Trade Radar Top-10 opportunity desk (V1.1).
 * All ranking thresholds and component weights live here — not in React components.
 */

/** Maximum names on the primary Day Trade opportunity desk (up to, not forced). */
export const DAY_TRADE_RADAR_TOP_N = 10;

/**
 * Minimum weighted composite score (0–100 scale) to qualify for the Top-10 desk.
 * Weak tape should fall below this rather than filling empty slots.
 */
export const DAY_TRADE_RADAR_MIN_OPPORTUNITY_SCORE = 30;

/** Session share volume below this is unlikely to qualify without strong current participation. */
export const DAY_TRADE_RADAR_SOFT_MIN_SESSION_VOLUME = 50_000;

/** Rolling 60s share volume floor when session volume is not exceptional. */
export const DAY_TRADE_RADAR_MIN_VOLUME_60S = 5_000;

/** Shares-per-minute floor when 60s roll is missing but velocity is verified. */
export const DAY_TRADE_RADAR_MIN_VOL_VELOCITY = 2_500;

/**
 * Large session volume still passes the liquidity gate, but cooling/stale names
 * must earn rank via current participation + momentum (see session blend in scorer).
 */
export const DAY_TRADE_RADAR_SESSION_VOLUME_EXCEPTION = 2_000_000;

/** Component weights (sum = 100). Each input is 0–1 before weighting. */
export const DAY_TRADE_OPPORTUNITY_WEIGHTS = {
  volumeLiquidity: 32,
  momentum: 24,
  freshness: 14,
  hodStructure: 10,
  catalystEvent: 8,
  tradability: 7,
  historical: 5,
} as const;

/**
 * Volume blend: share of session-volume percentile vs current-participation percentile.
 * Lower = current tape matters more (fresh acceleration can beat stale totals).
 */
export const DAY_TRADE_SESSION_VOLUME_BLEND = {
  /** Default split when freshness is active/fresh/unknown. */
  baseSessionShare: 0.38,
  /** When freshness_class is cooling. */
  coolingSessionShare: 0.14,
  /** When freshness_class is stale or signal is COOLING/STALE. */
  staleSessionShare: 0.1,
} as const;

/** Price accessibility multipliers (generic — never ticker-specific). */
export const DAY_TRADE_TRADABILITY_BANDS = {
  /** $1–$20: accessible; not auto-favored in score (multiplier 1.0). */
  accessibleMax: 20,
  accessibleMultiplier: 1,
  /** $20–$100: mostly neutral to slightly discounted. */
  midMax: 100,
  midMultiplier: 0.88,
  /** $100–$300: moderate small-account penalty. */
  highMax: 300,
  highMultiplier: 0.52,
  /** $300+: requires exceptional tape elsewhere to hold a Top-10 slot. */
  ultraMultiplier: 0.28,
} as const;

/**
 * Sub-$1 main desk: no categorical ban — require verified liquidity/activity.
 * Penny panel remains the specialized sub-$1 view.
 */
export const DAY_TRADE_SUB_DOLLAR_MAIN_DESK = {
  /** Weak illiquid penny: reject from main desk eligibility. */
  maxSessionVolumeIfVelocityBelow: 500_000,
  maxVelocityWeak: 5_000,
  /** Strong sub-$1 path (e.g. 13M vol + 100K/min). */
  minSessionVolumeStrong: 1_000_000,
  minVelocityStrong: 50_000,
  minVolume60sStrong: 50_000,
  minDollar60sStrong: 200_000,
} as const;

/** Verified catalyst bonus tiers (only when passed into score context — see scorer docs). */
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
