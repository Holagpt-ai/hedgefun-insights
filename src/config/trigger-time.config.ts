/**
 * Trigger Time V1 configuration.
 *
 * Records when a condition FIRST became true. Does not affect Discovery Rank,
 * Trader Lens, Trade Quality, filter evaluation, or live screener execution.
 */

export const TRIGGER_TIME_VERSION = "v1" as const;
export type TriggerTimeVersion = typeof TRIGGER_TIME_VERSION;

export const TRIGGER_TYPES = [
  "DISCOVERY_TRIGGER",
  "VOLUME_TRIGGER",
  "MOMENTUM_TRIGGER",
  "HOD_BREAK_TRIGGER",
  "CATALYST_TRIGGER",
] as const;

export type TriggerType = (typeof TRIGGER_TYPES)[number];

/**
 * Reserved names for later trigger families.
 * Not evaluated by the V1 engine.
 */
export const FUTURE_TRIGGER_TYPES = [
  "VWAP_RECLAIM",
  "OPENING_RANGE_BREAK",
  "PREMARKET_HIGH_BREAK",
  "HALT_RESUME",
  "FLOAT_ROTATION_1X",
  "FLOAT_ROTATION_2X",
  "RVOL_5X",
  "RVOL_10X",
  "POWER_HOUR_TRIGGER",
] as const;

export const TRIGGER_REASONS = [
  "DISCOVERY_QUALIFIED",
  "SESSION_VOLUME_THRESHOLD",
  "MOMENTUM_QUALIFIED",
  "HOD_BREAK",
  "VERIFIED_CATALYST",
] as const;

export type TriggerReason = (typeof TRIGGER_REASONS)[number];

export const TRIGGER_VOLUME_THRESHOLD_KEYS = [
  "VOLUME_100K",
  "VOLUME_500K",
  "VOLUME_1M",
] as const;

export type TriggerVolumeThresholdKey = (typeof TRIGGER_VOLUME_THRESHOLD_KEYS)[number];

export interface TriggerVolumeThreshold {
  readonly key: TriggerVolumeThresholdKey;
  readonly threshold: number;
}

export const TRIGGER_VOLUME_THRESHOLDS: readonly TriggerVolumeThreshold[] = [
  { key: "VOLUME_100K", threshold: 100_000 },
  { key: "VOLUME_500K", threshold: 500_000 },
  { key: "VOLUME_1M", threshold: 1_000_000 },
] as const;

export const TRIGGER_VOLUME_THRESHOLD_BY_KEY: Record<TriggerVolumeThresholdKey, number> =
  Object.fromEntries(
    TRIGGER_VOLUME_THRESHOLDS.map((item) => [item.key, item.threshold]),
  ) as Record<TriggerVolumeThresholdKey, number>;
