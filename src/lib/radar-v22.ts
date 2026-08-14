import type { ScreenerResultRow, ScreenerUiStatus } from "@/lib/screeners/contract";
import type { RadarRankedRow, RadarSignalLabel } from "@/features/day-trade-radar-v2/types";

export const RADAR_V22_POLL_MS = 15_000;

export type RadarV22FeedStatus = "available" | "empty" | "stale";

export type RadarV22Lifecycle =
  | "DETECTED"
  | "CONFIRMING"
  | "ACTIVE"
  | "REACTIVATED"
  | "COOLING";

export type RadarV22SignalStatus =
  | "BUILDING"
  | "CONFIRMING"
  | "EXPLOSIVE"
  | "REACTIVATED"
  | "COOLING"
  | "STALE"
  | "INACTIVE";

export type RadarV22FeedState = {
  state_key: string;
  generation_id: string | null;
  status: string;
  session_date: string | null;
  synced_at: string;
  provider_as_of_min: string | null;
  provider_as_of_max: string | null;
  last_provider_event_at: string | null;
  symbol_count: number;
  feed_stale: boolean;
  updated_at: string;
};

export type RadarV22BoardRow = {
  generation_id: string;
  rank: number;
  symbol: string;
  company_name: string | null;
  lifecycle: string;
  signal_status: string;
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

export type RadarV22View = {
  valid: boolean;
  status: ScreenerUiStatus;
  sessionDate: string | null;
  generationId: string | null;
  rows: RadarRankedRow[];
  syncedAt: string | null;
  providerAsOfMax: string | null;
};

const V22_SIGNALS = new Set<string>([
  "BUILDING",
  "CONFIRMING",
  "EXPLOSIVE",
  "REACTIVATED",
  "COOLING",
  "STALE",
  "INACTIVE",
]);

const V22_LIFECYCLES = new Set<string>([
  "DETECTED",
  "CONFIRMING",
  "ACTIVE",
  "REACTIVATED",
  "COOLING",
]);

export function isRadarV22Signal(value: unknown): value is RadarSignalLabel {
  return typeof value === "string" && V22_SIGNALS.has(value);
}

export function easternDate(nowMs: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(
    new Date(nowMs),
  );
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function mapV22Row(
  row: RadarV22BoardRow,
  status: ScreenerUiStatus,
): RadarRankedRow | null {
  if (!Number.isInteger(row.rank) || row.rank < 1) return null;
  if (!V22_LIFECYCLES.has(row.lifecycle)) return null;
  if (!finitePositive(row.price) || !finitePositive(row.volume)) return null;
  const signal: RadarSignalLabel =
    status === "stale"
      ? "STALE"
      : isRadarV22Signal(row.signal_status)
        ? row.signal_status
        : "VOLUME LEADER";
  const screener: ScreenerResultRow = {
    tab_id: "day_trade_radar",
    symbol: row.symbol,
    company_name: row.company_name,
    price: row.price,
    change_percent: row.change_percent,
    volume: row.volume,
    avg_volume: null,
    rvol: null,
    float_shares: null,
    gap_percent: null,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: row.prior_session_volume,
    volume_ratio_prior_session: row.volume_ratio_prior_session,
    day_high: row.day_high,
    day_low: row.day_low,
    provider_as_of: row.provider_as_of,
    sync_run_id: row.generation_id,
    updated_at: row.updated_at,
  };
  return {
    ...screener,
    rank: row.rank,
    radar_rank: row.rank,
    signal,
    signal_status: row.signal_status,
    signal_tier: row.lifecycle,
    rolling_volume_5s: row.rolling_volume_5s,
    rolling_volume_15s: row.rolling_volume_15s,
    rolling_volume_60s: row.rolling_volume_60s,
    acceleration_5m: row.acceleration_5m,
    hod_distance_percent:
      Number.isFinite(row.price) && Number.isFinite(row.day_high) && row.day_high > 0
        ? Math.round(((row.day_high - row.price) / row.day_high) * 1000) / 10
        : null,
  };
}

export function viewRadarV22Generation(
  stateRows: RadarV22FeedState[] | null,
  boardRows: RadarV22BoardRow[] | null,
  todayEt: string,
): RadarV22View {
  const empty: RadarV22View = {
    valid: false,
    status: "unavailable",
    sessionDate: null,
    generationId: null,
    rows: [],
    syncedAt: null,
    providerAsOfMax: null,
  };
  if (!stateRows || !boardRows || stateRows.length !== 1) return empty;
  const state = stateRows[0];
  if (state.state_key !== "current") return empty;
  if (state.status !== "available" && state.status !== "empty" && state.status !== "stale") {
    return empty;
  }
  if (state.session_date !== todayEt) return empty;
  const generationId = state.generation_id;
  if (!generationId) return empty;
  const matching = boardRows
    .filter((row) => row.generation_id === generationId)
    .sort((a, b) => a.rank - b.rank);
  if (matching.length !== state.symbol_count) return empty;
  const uiStatus: ScreenerUiStatus =
    state.status === "stale" || state.feed_stale
      ? "stale"
      : state.status === "empty"
        ? "empty"
        : "available";
  const rows: RadarRankedRow[] = [];
  for (const row of matching) {
    const mapped = mapV22Row(row, uiStatus);
    if (!mapped) return empty;
    rows.push(mapped);
  }
  return {
    valid: true,
    status: uiStatus,
    sessionDate: state.session_date,
    generationId,
    rows,
    syncedAt: state.synced_at,
    providerAsOfMax: state.provider_as_of_max,
  };
}

export type RadarSourceDecision = {
  source: "v2.1" | "v2.2";
  adoptedSession: string | null;
  rows: RadarRankedRow[] | ScreenerResultRow[];
  rankedReady: boolean;
  status: ScreenerUiStatus;
  syncedAt: string | null;
  providerAsOfMax: string | null;
};

export function resolveRadarSource(input: {
  todayEt: string;
  adoptedSession: string | null;
  v21: {
    rows: ScreenerResultRow[];
    status: ScreenerUiStatus;
    syncedAt: string | null;
    providerAsOfMax: string | null;
  };
  v22: RadarV22View;
}): RadarSourceDecision {
  const adoptedThisSession = input.adoptedSession === input.todayEt;
  const v22HasBoard = input.v22.valid && input.v22.sessionDate === input.todayEt &&
    (input.v22.rows.length > 0 || adoptedThisSession);
  const nextAdopted =
    input.v22.valid &&
    input.v22.sessionDate === input.todayEt &&
    input.v22.rows.length > 0
      ? input.todayEt
      : adoptedThisSession
        ? input.adoptedSession
        : null;

  if (v22HasBoard) {
    return {
      source: "v2.2",
      adoptedSession: nextAdopted,
      rows: input.v22.rows,
      rankedReady: true,
      status: input.v22.status,
      syncedAt: input.v22.syncedAt,
      providerAsOfMax: input.v22.providerAsOfMax,
    };
  }

  return {
    source: "v2.1",
    adoptedSession: nextAdopted,
    rows: input.v21.rows,
    rankedReady: false,
    status: input.v21.status,
    syncedAt: input.v21.syncedAt,
    providerAsOfMax: input.v21.providerAsOfMax,
  };
}
