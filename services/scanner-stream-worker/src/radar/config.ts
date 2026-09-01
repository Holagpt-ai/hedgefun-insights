export type RadarV22Config = {
  evaluationIntervalMs: number;
  boardRowCap: number;
  globalFeedStaleMs: number;
  highActivityShares60s: number;
  detectVol5s: number;
  detectVol15s: number;
  detectVol60sFloor: number;
  activeVol60s: number;
  activeVol15s: number;
  activeMove15sPct: number;
  activeMove60sPct: number;
  coolingConfirmEvals: number;
  archiveCoolingMs: number;
  archiveRolling60Ceiling: number;
  archiveLowActivityEvals: number;
  reactivateConfirmEvals: number;
  lateCorrectionMs: number;
  snapshotRefreshMs: number;
  detectConfirmEvals: number;
  confirmingEvals: number;
  activeConfirmEvals: number;
  leaseTtlMs: number;
  leaseRenewMs: number;
  reconnectBaseDelayMs: number;
  reconnectMaxDelayMs: number;
  reconnectJitter: number;
  barRetentionMs: number;
  snapshotPageCap: number;
  snapshotTimeoutMs: number;
  /** When false, ingest is gated by the snapshot/DTR universe (current behavior). */
  sentinelEnabled: boolean;
  /** Drop Sentinel-only state after this many ms without a print. */
  sentinelTtlMs: number;
  /**
   * Max Stage-2 RadarBook symbols. Clamped to [1, promotionHardMax] and
   * never allowed above RADAR_PROMOTION_HARD_MAX.
   */
  promotionCap: number;
  /** Config-level hard cap; mergeRadarConfig also clamps to RADAR_PROMOTION_HARD_MAX. */
  promotionHardMax: number;
  /** vol5 / expected5 from the preceding 60s-excluding-current-5s baseline. */
  sentinelBurst5Multiple: number;
  /** vol15 / expected15 from the preceding 60s-excluding-current-15s baseline. */
  sentinelBurst15Multiple: number;
  /** Minimum observed preceding seconds before relative 5s burst can fire. */
  sentinelBurst5MinPrecedingSeconds: number;
  /** Minimum observed preceding seconds before relative 15s burst can fire. */
  sentinelBurst15MinPrecedingSeconds: number;
  /** Share floor on the relative 5s path so tiny multiples of silence do not promote. */
  sentinelBurst5MinShares: number;
  /** Share floor on the relative 15s path. */
  sentinelBurst15MinShares: number;
  /**
   * Liquidity safeguard for the absolute 5s path only ($). Modest on purpose:
   * 10k shares at $0.20 = $2,000 qualifies; 10k at $0.01 = $100 does not.
   * NOT applied to the absolute 60s detect combo or to relative bursts.
   */
  sentinelAbsoluteMinDollar5s: number;
  /** Liquidity safeguard for the absolute 15s path only ($). */
  sentinelAbsoluteMinDollar15s: number;
  /**
   * Relative-burst dollar floor ($). Lower than the absolute 5s floor so a
   * dead-then-8k-share print in a low-priced name can still promote.
   */
  sentinelBurstMinDollar5s: number;
  /** Relative-burst 15s dollar floor ($). */
  sentinelBurstMinDollar15s: number;
};

/** Absolute ceiling — config cannot raise Stage-2 allocation above this. */
export const RADAR_PROMOTION_HARD_MAX = 200;
export const RADAR_PROMOTION_CAP_DEFAULT = 128;

export const RADAR_V22_CONFIG: RadarV22Config = {
  evaluationIntervalMs: 5_000,
  boardRowCap: 20,
  globalFeedStaleMs: 15_000,
  highActivityShares60s: 100_000,
  detectVol5s: 10_000,
  detectVol15s: 25_000,
  detectVol60sFloor: 50_000,
  activeVol60s: 100_000,
  activeVol15s: 25_000,
  activeMove15sPct: 0.25,
  activeMove60sPct: 0.50,
  coolingConfirmEvals: 3,
  archiveCoolingMs: 5 * 60 * 1000,
  archiveRolling60Ceiling: 50_000,
  archiveLowActivityEvals: 12,
  reactivateConfirmEvals: 3,
  lateCorrectionMs: 10_000,
  snapshotRefreshMs: 5 * 60 * 1000,
  detectConfirmEvals: 1,
  confirmingEvals: 2,
  activeConfirmEvals: 3,
  leaseTtlMs: 15_000,
  leaseRenewMs: 5_000,
  reconnectBaseDelayMs: 500,
  reconnectMaxDelayMs: 15_000,
  reconnectJitter: 0.2,
  barRetentionMs: 6 * 60 * 1000,
  snapshotPageCap: 50,
  snapshotTimeoutMs: 15_000,
  sentinelEnabled: false,
  sentinelTtlMs: 90_000,
  promotionCap: RADAR_PROMOTION_CAP_DEFAULT,
  promotionHardMax: RADAR_PROMOTION_HARD_MAX,
  sentinelBurst5Multiple: 4,
  sentinelBurst15Multiple: 4,
  sentinelBurst5MinPrecedingSeconds: 30,
  sentinelBurst15MinPrecedingSeconds: 30,
  sentinelBurst5MinShares: 2_000,
  sentinelBurst15MinShares: 4_000,
  sentinelAbsoluteMinDollar5s: 1_000,
  sentinelAbsoluteMinDollar15s: 2_500,
  sentinelBurstMinDollar5s: 250,
  sentinelBurstMinDollar15s: 500,
};

function clampPromotionCaps(config: RadarV22Config): RadarV22Config {
  const hard = Math.min(
    Math.max(1, Math.trunc(config.promotionHardMax)),
    RADAR_PROMOTION_HARD_MAX,
  );
  const cap = Math.min(Math.max(1, Math.trunc(config.promotionCap)), hard);
  return { ...config, promotionHardMax: hard, promotionCap: cap };
}

export function mergeRadarConfig(
  overrides: Partial<RadarV22Config> = {},
): RadarV22Config {
  return clampPromotionCaps({ ...RADAR_V22_CONFIG, ...overrides });
}

/** Effective Stage-2 cap used by the engine. Impossible to exceed HARD_MAX. */
export function effectivePromotionCap(config: RadarV22Config): number {
  return Math.min(
    Math.max(1, Math.trunc(config.promotionCap)),
    Math.min(Math.max(1, Math.trunc(config.promotionHardMax)), RADAR_PROMOTION_HARD_MAX),
  );
}
