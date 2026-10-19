/** Documented defaults for homepage Market Pulse significance filtering. */
export const MARKET_PULSE_DEFAULT_CONFIG = {
  /** Maximum visible pulse entries on the homepage. */
  maxItems: 8,
  /** Minimum absolute percent change for a mover to qualify. */
  minAbsChangePercent: 3,
  /** Minimum verified volume (shares) when percent move is moderate. */
  minVerifiedVolume: 250_000,
  /** Percent move labeled as a sharp move. */
  sharpAbsChangePercent: 8,
  /** Percent move labeled as notable (between min and sharp). */
  notableAbsChangePercent: 3,
} as const;

export type MarketPulseConfig = typeof MARKET_PULSE_DEFAULT_CONFIG;
