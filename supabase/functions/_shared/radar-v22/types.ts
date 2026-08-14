/** Persisted Day Trade Radar V2.2 contract. Shared by the worker and tests. */

export const RADAR_V22_STATE_KEY = "current";
export const RADAR_V22_LEASE_KEY = "radar_v22";
export const RADAR_V22_BOARD_CAP = 20;

export const RADAR_V22_LIFECYCLES = [
  "WATCHING",
  "DETECTED",
  "CONFIRMING",
  "ACTIVE",
  "COOLING",
  "ARCHIVED",
  "REACTIVATED",
] as const;

export type RadarV22Lifecycle = (typeof RADAR_V22_LIFECYCLES)[number];

export const RADAR_V22_BOARD_LIFECYCLES = [
  "DETECTED",
  "CONFIRMING",
  "ACTIVE",
  "REACTIVATED",
  "COOLING",
] as const;

export type RadarV22BoardLifecycle =
  (typeof RADAR_V22_BOARD_LIFECYCLES)[number];

export const RADAR_V22_SIGNAL_STATUSES = [
  "BUILDING",
  "CONFIRMING",
  "EXPLOSIVE",
  "REACTIVATED",
  "COOLING",
  "STALE",
  "INACTIVE",
] as const;

export type RadarV22SignalStatus = (typeof RADAR_V22_SIGNAL_STATUSES)[number];

export const RADAR_V22_FEED_STATUSES = [
  "available",
  "empty",
  "stale",
] as const;

export type RadarV22FeedStatus = (typeof RADAR_V22_FEED_STATUSES)[number];

export type RadarV22BoardRow = {
  generation_id: string;
  rank: number;
  symbol: string;
  company_name: string | null;
  lifecycle: RadarV22BoardLifecycle;
  signal_status: RadarV22SignalStatus;
  price: number;
  change_percent: number;
  volume: number;
  prior_session_volume: number;
  volume_ratio_prior_session: number;
  day_high: number;
  day_low: number;
  rolling_volume_5s: number;
  rolling_volume_15s: number;
  rolling_volume_60s: number;
  rolling_dollar_volume_60s: number;
  acceleration_5m: number | null;
  session_vwap: number | null;
  peak_volume_15s: number | null;
  provider_as_of: string;
  updated_at: string;
};

export type RadarV22FeedState = {
  state_key: string;
  generation_id: string | null;
  status: RadarV22FeedStatus;
  session_date: string | null;
  synced_at: string;
  provider_as_of_min: string | null;
  provider_as_of_max: string | null;
  last_provider_event_at: string | null;
  symbol_count: number;
  feed_stale: boolean;
  updated_at: string;
};

export type RadarV22ArchiveRow = {
  session_date: string;
  symbol: string;
  lifecycle: "ARCHIVED";
  archived_at: string;
  generation_id: string | null;
  rolling_volume_60s: number | null;
  rolling_volume_15s: number | null;
  session_volume: number | null;
  peak_volume_15s: number | null;
  provider_as_of: string | null;
};

export function isRadarV22Lifecycle(
  value: unknown,
): value is RadarV22Lifecycle {
  return typeof value === "string" &&
    (RADAR_V22_LIFECYCLES as readonly string[]).includes(value);
}

export function isRadarV22BoardLifecycle(
  value: unknown,
): value is RadarV22BoardLifecycle {
  return typeof value === "string" &&
    (RADAR_V22_BOARD_LIFECYCLES as readonly string[]).includes(value);
}

export function isRadarV22SignalStatus(
  value: unknown,
): value is RadarV22SignalStatus {
  return typeof value === "string" &&
    (RADAR_V22_SIGNAL_STATUSES as readonly string[]).includes(value);
}

export function isRadarV22FeedStatus(
  value: unknown,
): value is RadarV22FeedStatus {
  return typeof value === "string" &&
    (RADAR_V22_FEED_STATUSES as readonly string[]).includes(value);
}

export function signalStatusForLifecycle(
  lifecycle: RadarV22BoardLifecycle,
  feedStale: boolean,
): RadarV22SignalStatus {
  if (feedStale) return "STALE";
  switch (lifecycle) {
    case "DETECTED":
      return "BUILDING";
    case "CONFIRMING":
      return "CONFIRMING";
    case "ACTIVE":
      return "EXPLOSIVE";
    case "REACTIVATED":
      return "REACTIVATED";
    case "COOLING":
      return "COOLING";
  }
}
