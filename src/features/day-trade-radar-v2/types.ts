import type { ScreenerResultRow, ScreenerUiStatus } from "@/lib/screeners/contract";

/** Versioned ranking interface — future burst fields stay optional until verified. */
export interface RadarRankingFields {
  radar_rank?: number;
  signal_tier?: string;
  signal_status?: string;
  rolling_volume_5s?: number | null;
  rolling_volume_15s?: number | null;
  rolling_volume_60s?: number | null;
  acceleration_5m?: number | null;
}

export type RadarSignalLabel =
  | "TOP LEADER"
  | "VOLUME LEADER"
  | "STALE"
  | "INACTIVE";

export interface RadarRankedRow extends ScreenerResultRow, RadarRankingFields {
  /** Authoritative volume-first rank derived from verified backend order (1-based). */
  rank: number;
  signal: RadarSignalLabel;
  hod_distance_percent: number | null;
}

export type RadarFollowMode = "follow_leader" | "manual";

export interface RadarSelectionState {
  mode: RadarFollowMode;
  /** Normalized symbol currently driving the detail panel. */
  selectedSymbol: string | null;
  /** Last verified snapshot for the selected symbol (survives board exit). */
  snapshot: RadarRankedRow | null;
  /** True when the locked symbol is not in the latest active board. */
  inactive: boolean;
}

export interface DayTradeRadarV2Props {
  rows: ScreenerResultRow[];
  status: ScreenerUiStatus;
  isPro: boolean;
  syncedAt: string | null;
  providerAsOfMax: string | null;
  freeRowLimit: number;
}

export type RadarChartStatus = "idle" | "loading" | "available" | "empty" | "error";

export interface RadarChartBar {
  /** UTC unix seconds for intraday; YYYY-MM-DD for daily-only feeds. */
  time: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Original provider timestamp when available. */
  providerTimeIso?: string;
}
