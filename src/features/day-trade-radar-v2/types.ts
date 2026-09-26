import type { ScreenerResultRow, ScreenerUiStatus } from "@/lib/screeners/contract";
import type { ScreenerDataSource } from "@/lib/screeners/screener-copy";
import type { RadarHistoricalContextFields } from "@/lib/radar/radar-historical-context-types";
import type { RadarRepeatMoversView } from "@/lib/radar/radar-repeat-movers-types";
import type { RepeatMoversLoadState } from "@/lib/radar/repeat-movers-load-state";

/** Versioned ranking interface — future burst fields stay optional until verified. */
export interface RadarRankingFields {
  radar_rank?: number;
  signal_tier?: string;
  signal_status?: string;
  rolling_volume_5s?: number | null;
  rolling_volume_15s?: number | null;
  rolling_volume_60s?: number | null;
  acceleration_5m?: number | null;
  rvol_5m?: number | null;
  vol_velocity?: number | null;
  volume_acceleration_pct?: number | null;
  primary_scanner_event?: string | null;
  primary_scanner_event_at?: string | null;
  scanner_events?: unknown;
  distance_from_hod_pct?: number | null;
  rolling_dollar_volume_60s?: number | null;
  session_vwap?: number | null;
  vwap_side?: string | null;
  freshness_class?: string | null;
  /** Short-window 15s move. Never display as Day Move. */
  move_15s_pct?: number | null;
  /** Short-window 60s move. Never display as Day Move. */
  move_60s_pct?: number | null;
  /** Authentic Radar promotion timestamp. Not fetched_at / synced_at. */
  promoted_at?: string | null;
  /** Authentic Radar HOD-break event timestamp. Not current HOD distance. */
  last_hod_break_at?: string | null;
  /** Current intraday distance from HOD. Optional on ranking-augmented rows. */
  hod_distance_percent?: number | null;
  /** Radar trading session date (YYYY-MM-DD). */
  radar_trading_date?: string | null;
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

export interface LegacyConfirmationFields {
  /** True only when all three validated legacy gates are satisfied. */
  legacy_confirmed?: boolean;
  legacy_price_gate?: boolean | null;
  legacy_move_gate?: boolean | null;
  legacy_volume_gate?: boolean | null;
}

export interface RadarRankedRow extends ScreenerResultRow, RadarRankingFields, LegacyConfirmationFields, RadarHistoricalContextFields {
  /** Authoritative volume-first rank derived from verified backend order (1-based). */
  rank: number;
  /**
   * 1-based position within the currently visible Trader Lens view.
   * Free-plan unlocking uses this so the first visible rows stay usable.
   */
  access_rank?: number;
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
  marketFeed?: import("@/lib/market-feed/telemetry").MarketFeedTelemetry | null;
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
  /** Same-session closed snapshot. Live candidates stay empty after close. */
  closedSnapshot?: boolean;
  /** Repeat Movers V2 view from enriched Radar payload (Discovery order preserved). */
  repeatMoversView?: RadarRepeatMoversView | null;
  /** Isolated Repeat Movers load lifecycle (must not gate Discovery). */
  repeatMoversLoadState?: RepeatMoversLoadState;
  /** Soft refresh to retry Repeat Movers enrichment after failure. */
  onRepeatMoversRetry?: () => void;
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
