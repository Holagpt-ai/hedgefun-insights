export const AH_STALE_AFTER_MS = 20 * 60_000;
export const AH_MAX_ROWS = 40;

export type AfterHoursUiStatus =
  | "loading"
  | "available"
  | "empty"
  | "stale"
  | "unavailable";

export type AfterHoursFeedState = {
  state_key: string;
  generation_id: string;
  status: string;
  session_date: string;
  synced_at: string;
  provider_as_of_min: string | null;
  provider_as_of_max: string | null;
  gainer_count: number;
  loser_count: number;
  updated_at: string;
};

export type AfterHoursMoverResult = {
  generation_id: string;
  side: "gainer" | "loser";
  rank: number;
  symbol: string;
  company_name: string | null;
  extended_last: number;
  regular_close: number;
  change_percent: number;
  change_amount: number;
  volume: number | null;
  observation_source: "lastTrade" | "min";
  provider_as_of: string;
  updated_at: string;
};

export type AfterHoursView = {
  status: AfterHoursUiStatus;
  sessionDate: string | null;
  syncedAt: string | null;
  providerAsOfMax: string | null;
  gainers: AfterHoursMoverResult[];
  losers: AfterHoursMoverResult[];
};

function parseTs(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function isAfterHoursGenerationStale(syncedAt: string, nowMs: number): boolean {
  const syncedMs = parseTs(syncedAt);
  if (syncedMs === null) return true;
  return nowMs - syncedMs > AH_STALE_AFTER_MS;
}

export function viewAfterHoursGeneration(
  stateRows: AfterHoursFeedState[] | null,
  resultRows: AfterHoursMoverResult[] | null,
  nowMs: number,
): AfterHoursView {
  const empty: AfterHoursView = {
    status: "unavailable",
    sessionDate: null,
    syncedAt: null,
    providerAsOfMax: null,
    gainers: [],
    losers: [],
  };
  if (!stateRows || !resultRows || stateRows.length !== 1) return empty;
  const state = stateRows[0];
  if (state.state_key !== "current") return empty;
  if (state.status !== "available" && state.status !== "empty") return empty;
  const matching = resultRows.filter((r) => r.generation_id === state.generation_id);
  if (matching.length > AH_MAX_ROWS) return empty;
  const gainers = matching
    .filter((r) => r.side === "gainer")
    .sort((a, b) => a.rank - b.rank);
  const losers = matching
    .filter((r) => r.side === "loser")
    .sort((a, b) => a.rank - b.rank);
  if (gainers.length !== state.gainer_count || losers.length !== state.loser_count) {
    return empty;
  }
  const stale = isAfterHoursGenerationStale(state.synced_at, nowMs);
  if (state.status === "empty") {
    return {
      status: stale ? "stale" : "empty",
      sessionDate: state.session_date,
      syncedAt: state.synced_at,
      providerAsOfMax: state.provider_as_of_max,
      gainers: [],
      losers: [],
    };
  }
  return {
    status: stale ? "stale" : "available",
    sessionDate: state.session_date,
    syncedAt: state.synced_at,
    providerAsOfMax: state.provider_as_of_max,
    gainers,
    losers,
  };
}
