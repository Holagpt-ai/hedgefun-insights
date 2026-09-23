import type { ScannerEventType } from "../radar-v22/scanner-events.ts";

/** Worker → bridge payload for a false→true scanner transition. */
export type ScannerAlertFiring = {
  symbol: string;
  event_type: ScannerEventType;
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

export type ScannerIntelligenceAlertRow = {
  dedupe_key: string;
  symbol: string;
  trading_date: string;
  session_kind: string;
  event_type: ScannerEventType;
  event_at: string;
  severity: "info" | "attention" | "high";
  price: number | null;
  move_pct: number | null;
  today_volume: number | null;
  prior_volume: number | null;
  vol_prior: number | null;
  rvol_5m: number | null;
  volume_velocity: number | null;
  volume_acceleration_pct: number | null;
  distance_from_hod_pct: number | null;
  historical_match_count: number | null;
  last_significant_episode_date: string | null;
  last_significant_episode_id: string | null;
  last_episode_move_pct: number | null;
  last_episode_volume: number | null;
  last_episode_hod_time: string | null;
  comparable_episode_count: number | null;
  historical_catalyst_type: string | null;
  catalyst_type: string | null;
  catalyst_id: string | null;
  headline: string;
  summary: string;
  metadata: Record<string, unknown>;
};
