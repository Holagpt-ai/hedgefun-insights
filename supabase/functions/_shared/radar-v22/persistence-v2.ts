/**
 * Radar Persistence V2 contract (candidates + discrete events).
 * Shared by the Fly worker, radar-worker-bridge, and tests.
 *
 * Fly calculates. Supabase stores compact results — not the A.* tape.
 * Existing Top-20 replace_radar_v22_generation_v1 is unchanged.
 */

export const RADAR_V22_CANDIDATE_CAP = 200;
export const RADAR_V22_EVENT_RETAIN_DAYS = 14;
export const REPLACE_RADAR_V2_RPC = "replace_radar_v22_candidates_v1";
export const PURGE_RADAR_V2_EVENTS_RPC = "purge_radar_v22_events_v1";
export const SESSION_EVENT_SYMBOL = "SESSION";

export const RADAR_V22_SESSION_KINDS = [
  "pre-market",
  "market",
  "after-hours",
  "closed",
] as const;

export type RadarV22SessionKind = (typeof RADAR_V22_SESSION_KINDS)[number];

export const RADAR_V22_VWAP_SIDES = ["above", "below", "unknown"] as const;
export type RadarV22VwapSide = (typeof RADAR_V22_VWAP_SIDES)[number];

export const RADAR_V22_FRESHNESS_CLASSES = [
  "fresh",
  "active",
  "cooling",
  "stale",
  "unknown",
] as const;
export type RadarV22FreshnessClass =
  (typeof RADAR_V22_FRESHNESS_CLASSES)[number];

/**
 * Discrete events that current Radar can emit with stable timestamps.
 * Omitted (not reliably one-shot): HOD_ATTEMPT, VOLUME_BURST, ACCELERATION.
 * Those remain candidate clocks / freshness fields instead of an event firehose.
 */
export const RADAR_V22_EVENT_TYPES = [
  "PROMOTED",
  "DETECTED",
  "CONFIRMED",
  "ACTIVE",
  "COOLING",
  "REACTIVATED",
  "ARCHIVED",
  "NEW_HOD",
  "HOD_BREAK",
  "HOD_REJECTION",
  "VWAP_RECLAIM",
  "VWAP_LOSS",
  "VOLUME_100K",
  "VOLUME_500K",
  "VOLUME_1M",
  "MOMENTUM_TRIGGER",
  "RE_ACCELERATION",
  "PULLBACK",
  "SECOND_LEG",
  "HALT",
  "RESUME",
  "SESSION_PM_RTH",
  "SESSION_RTH_AH",
] as const;

export type RadarV22EventType = (typeof RADAR_V22_EVENT_TYPES)[number];

export type RadarV22CandidateRow = {
  generation_id: string;
  trading_date: string;
  session_kind: RadarV22SessionKind;
  symbol: string;
  lifecycle: string;
  signal_status: string;
  last_price: number | null;
  last_price_at: string | null;
  move_15s_pct: number | null;
  move_60s_pct: number | null;
  volume_5s: number;
  volume_15s: number;
  volume_60s: number;
  session_volume: number;
  dollar_volume_60s: number;
  acceleration_5m: number | null;
  /** Regular-session 5m RVOL vs historical TOD baseline (null when insufficient). */
  rvol_5m: number | null;
  /** Shares per minute over the latest completed 5m window. */
  volume_velocity: number | null;
  /** Percent change in velocity vs the prior 5m window (distinct from acceleration_5m ratio). */
  volume_acceleration_pct: number | null;
  session_high: number | null;
  session_low: number | null;
  distance_from_hod_pct: number | null;
  session_vwap: number | null;
  vwap_side: RadarV22VwapSide;
  geometry_partial: boolean;
  vwap_partial: boolean;
  last_new_hod_at: string | null;
  last_hod_attempt_at: string | null;
  last_hod_break_at: string | null;
  last_hod_reject_at: string | null;
  last_vwap_cross_at: string | null;
  last_vwap_reclaim_at: string | null;
  last_vwap_loss_at: string | null;
  freshness_class: RadarV22FreshnessClass;
  freshness_age_ms: number | null;
  last_volume_burst_at: string | null;
  last_price_move_at: string | null;
  last_acceleration_at: string | null;
  promoted_at: string | null;
  lifecycle_entered_at: string | null;
  provider_as_of: string | null;
  primary_scanner_event: string | null;
  primary_scanner_event_at: string | null;
  scanner_events: unknown;
  /** Radar Event Engine V1 promotion explanation (bounded JSON). */
  promotion_reason: unknown;
  radar_event_lifecycle: string | null;
  /** Fired engine events [{type, event_at}] for discrete persistence. */
  radar_engine_events: unknown;
  time_adjusted_rvol: number | null;
  volume_5m: number | null;
  volume_15m: number | null;
  volume_60m: number | null;
  volume_velocity_5m: number | null;
  volume_velocity_15m: number | null;
  volume_velocity_60m: number | null;
  dollar_volume_velocity_5m: number | null;
  participation_state: string | null;
  participation_baseline_session_count: number | null;
  participation_calculated_at: string | null;
  participation_source_as_of: string | null;
  /** Verified regular-session close for AH extension (same trading date). */
  regular_session_close: number | null;
  /**
   * Previous regular-session close recovered from day.c and the verified
   * regular-session move. Null when unverified or split-scale. Never 0.
   */
  previous_close: number | null;
  /** Verified previous completed session volume (prevDay.v). Null when unverified. Never 0. */
  prior_session_volume: number | null;
  updated_at: string;
};

export type RadarV22EventRow = {
  trading_date: string;
  session_kind: RadarV22SessionKind;
  symbol: string;
  event_type: RadarV22EventType;
  event_at: string;
  generation_id: string | null;
};

export type ScannerAlertFiringPayload = {
  symbol: string;
  event_type: string;
  event_at: string;
  trading_date: string;
  session_kind: string;
  price: number | null;
  move_pct: number | null;
  today_volume: number | null;
  prior_volume: number | null;
  vol_prior: number | null;
  rvol_5m: number | null;
  volume_velocity: number | null;
  volume_acceleration_pct: number | null;
  distance_from_hod_pct: number | null;
  session_vwap: number | null;
};

export type ReplaceRadarV2Args = {
  p_generation_id: string;
  p_trading_date: string;
  p_session_kind: RadarV22SessionKind;
  p_synced_at: string;
  p_candidates: RadarV22CandidateRow[];
  p_events: RadarV22EventRow[];
  p_sentinel_enabled: boolean;
  p_last_provider_event_at: string | null;
  p_last_receive_at: string | null;
  p_scanner_firings?: ScannerAlertFiringPayload[];
  p_market_data_provider?: string | null;
  p_market_data_feed_mode?: string | null;
  p_feed_latency_ms?: number | null;
  p_feed_connection_state?: string | null;
  p_feed_last_message_at?: string | null;
  p_feed_telemetry_stale?: boolean | null;
};

export function isRadarV22SessionKind(
  value: unknown,
): value is RadarV22SessionKind {
  return typeof value === "string" &&
    (RADAR_V22_SESSION_KINDS as readonly string[]).includes(value);
}

export function isRadarV22VwapSide(value: unknown): value is RadarV22VwapSide {
  return typeof value === "string" &&
    (RADAR_V22_VWAP_SIDES as readonly string[]).includes(value);
}

export function isRadarV22FreshnessClass(
  value: unknown,
): value is RadarV22FreshnessClass {
  return typeof value === "string" &&
    (RADAR_V22_FRESHNESS_CLASSES as readonly string[]).includes(value);
}

export function isRadarV22EventType(
  value: unknown,
): value is RadarV22EventType {
  return typeof value === "string" &&
    (RADAR_V22_EVENT_TYPES as readonly string[]).includes(value);
}
