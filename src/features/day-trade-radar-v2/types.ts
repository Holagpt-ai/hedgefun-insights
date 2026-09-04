import type { ScreenerResultRow, ScreenerUiStatus } from "@/lib/screeners/contract";
import type { ScreenerDataSource } from "@/lib/screeners/screener-copy";

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
  | "BUILDING"
  | "CONFIRMING"
  | "EXPLOSIVE"
  | "REACTIVATED"
  | "COOLING"
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
  /**
   * Active screener data source. When "radar-v2", the passed rows/status are the
   * authoritative Radar V2 candidate universe (pre-market, market, after-hours)
   * and MUST NOT be superseded by the legacy radar_v22_board. Any other value
   * preserves the existing board/fallback resolution.
   */
  source?: ScreenerDataSource | null;
  /** Accepted Radar V2 generation session_kind from the data layer. */
  session?: string | null;
}

/** Engine/source designation shown in the Day Trade Radar status rail. */
export type RadarEngineSource = "v2.1" | "v2.2" | "radar-v2-candidates";

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
