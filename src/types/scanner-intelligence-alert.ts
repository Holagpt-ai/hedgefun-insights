export type ScannerIntelligenceEventType =
  | "HOD_MOMENTUM"
  | "RUNNING_UP"
  | "VOLUME_EXPLOSION";

export interface ScannerIntelligenceAlertRow {
  id: string;
  dedupe_key: string;
  symbol: string;
  trading_date: string;
  session_kind: string;
  event_type: ScannerIntelligenceEventType;
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
  comparable_episode_count: number | null;
  catalyst_type: string | null;
  catalyst_id: string | null;
  headline: string;
  summary: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ScannerAlertUserStateRow {
  alert_id: string;
  read_at: string | null;
  dismissed_at: string | null;
}
