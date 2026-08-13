// Pure validated-generation contract for Screeners P1-R4.
// Retry + fail-closed load live here; the React hook only wires fetchers + UI state.

export const MANAGED_TAB_IDS = [
  "day_trade_radar",
  "gappers",
  "volume_spikes",
  "gainers_losers",
  "unusual_volume",
  "new_highs_lows",
] as const;

export type ManagedTabId = (typeof MANAGED_TAB_IDS)[number];

export const RATIO_TAB_IDS = new Set<ManagedTabId>([
  "day_trade_radar",
  "volume_spikes",
  "unusual_volume",
]);

export const SCREENER_STALE_AFTER_MS = 20 * 60_000;
export const PROVIDER_FUTURE_SLACK_MS = 5 * 60_000;
export const MAX_GENERATION_ROWS = 120;
export const MAX_TAB_ROWS = 20;
export const MAX_ROWS_FETCH = 121;
export const NHL_TAB_ID: ManagedTabId = "new_highs_lows";
export const RANGE_EVENTS = ["new_high", "new_low", "both"] as const;
export type RangeEvent = (typeof RANGE_EVENTS)[number];
export const NHL_BASELINE_STATUSES = ["available", "initializing", "unavailable"] as const;
export type NhlBaselineStatus = (typeof NHL_BASELINE_STATUSES)[number];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SYMBOL_RE = /^[A-Z][A-Z0-9.-]*$/;

export type ScreenerUiStatus =
  | "loading"
  | "available"
  | "empty"
  | "stale"
  | "unavailable"
  | "initializing";

export interface ScreenerFeedState {
  state_key: string;
  sync_run_id: string;
  status: string;
  synced_at: string;
  provider_as_of_min: string | null;
  provider_as_of_max: string | null;
  rows_inserted: number;
  tab_counts: unknown;
  nhl_baseline_status?: unknown;
  updated_at: string;
}

export interface ScreenerResultRow {
  tab_id: string;
  symbol: string;
  company_name: string | null;
  price: number | null;
  change_percent: number | null;
  volume: number | null;
  avg_volume: number | null;
  rvol: number | null;
  float_shares: number | null;
  gap_percent: number | null;
  high_52w: number | null;
  low_52w: number | null;
  range_event: RangeEvent | null;
  market_cap: number | null;
  prior_session_volume: number | null;
  volume_ratio_prior_session: number | null;
  day_high: number | null;
  day_low: number | null;
  provider_as_of: string;
  sync_run_id: string;
  updated_at: string;
}

export interface ValidatedGeneration {
  status: "available" | "empty";
  state: ScreenerFeedState;
  rows: ScreenerResultRow[];
  synced_at: string;
  provider_as_of_max: string | null;
  provider_as_of_min: string | null;
}

export type ValidationOutcome =
  | { ok: true; generation: ValidatedGeneration }
  | { ok: false; reason: string };

export interface ScreenerTabView {
  status: Exclude<ScreenerUiStatus, "loading">;
  rows: ScreenerResultRow[];
  synced_at: string | null;
  provider_as_of_max: string | null;
  attempts: number;
}

export interface GenerationFetchResult {
  stateRows: ScreenerFeedState[] | null;
  resultRows: ScreenerResultRow[] | null;
  stateError: unknown;
  resultError: unknown;
}

export type GenerationFetcher = () => Promise<GenerationFetchResult>;

export function isManagedTabId(value: unknown): value is ManagedTabId {
  return typeof value === "string" && (MANAGED_TAB_IDS as readonly string[]).includes(value);
}

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && UUID_RE.test(value);
}

export function parseTimestampMs(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function sameInstant(a: unknown, b: unknown): boolean {
  const am = parseTimestampMs(a);
  const bm = parseTimestampMs(b);
  return am !== null && bm !== null && am === bm;
}

export function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function expectedVolumeRatio(volume: number, prior: number): number {
  return Math.round((volume / prior) * 10) / 10;
}

function emptyTabCounts(): Record<ManagedTabId, number> {
  return {
    day_trade_radar: 0,
    gappers: 0,
    volume_spikes: 0,
    gainers_losers: 0,
    unusual_volume: 0,
    new_highs_lows: 0,
  };
}

export function parseNhlBaselineStatus(raw: unknown): NhlBaselineStatus {
  if (raw === "available" || raw === "initializing" || raw === "unavailable") {
    return raw;
  }
  return "initializing";
}

export function isRangeEvent(value: unknown): value is RangeEvent {
  return typeof value === "string" && (RANGE_EVENTS as readonly string[]).includes(value);
}

export function formatRangeEvent(value: RangeEvent | null | undefined): string {
  if (value === "new_high") return "New High";
  if (value === "new_low") return "New Low";
  if (value === "both") return "Both";
  return "—";
}

export function parseTabCounts(raw: unknown): Record<ManagedTabId, number> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length !== MANAGED_TAB_IDS.length) return null;
  const out = emptyTabCounts();
  for (const tab of MANAGED_TAB_IDS) {
    if (!(tab in obj)) return null;
    const n = obj[tab];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > MAX_TAB_ROWS) {
      return null;
    }
    out[tab] = n;
  }
  for (const key of keys) {
    if (!isManagedTabId(key)) return null;
  }
  return out;
}

function fail(reason: string): ValidationOutcome {
  return { ok: false, reason };
}

export function validateGeneration(
  stateRows: ScreenerFeedState[] | null,
  resultRows: ScreenerResultRow[] | null,
  nowMs: number,
): ValidationOutcome {
  if (stateRows === null || resultRows === null) {
    return fail("query_returned_null");
  }
  if (stateRows.length !== 1) {
    return fail(stateRows.length === 0 ? "missing_state_row" : "duplicate_state_row");
  }

  const state = stateRows[0];
  if (state.state_key !== "current") return fail("invalid_state_key");
  if (state.status !== "available" && state.status !== "empty") {
    return fail("invalid_state_status");
  }
  if (!isValidUuid(state.sync_run_id)) return fail("invalid_sync_run_id");

  const syncedMs = parseTimestampMs(state.synced_at);
  const updatedMs = parseTimestampMs(state.updated_at);
  if (syncedMs === null || updatedMs === null) return fail("invalid_state_timestamps");
  if (syncedMs > nowMs + PROVIDER_FUTURE_SLACK_MS) return fail("synced_at_too_far_future");
  if (syncedMs !== updatedMs) return fail("updated_at_mismatch");

  if (
    typeof state.rows_inserted !== "number" ||
    !Number.isInteger(state.rows_inserted) ||
    state.rows_inserted < 0 ||
    state.rows_inserted > MAX_GENERATION_ROWS
  ) {
    return fail("invalid_rows_inserted");
  }

  const tabCounts = parseTabCounts(state.tab_counts);
  if (!tabCounts) return fail("invalid_tab_counts");
  const nhlBaselineStatus = parseNhlBaselineStatus(state.nhl_baseline_status);
  if (nhlBaselineStatus !== "available" && tabCounts.new_highs_lows > 0) {
    return fail("nhl_rows_without_available_baseline");
  }

  const countSum = MANAGED_TAB_IDS.reduce((sum, id) => sum + tabCounts[id], 0);
  if (countSum !== state.rows_inserted) return fail("tab_counts_sum_mismatch");

  if (resultRows.length > MAX_GENERATION_ROWS) {
    return fail("over_limit_generation");
  }

  if (state.status === "empty") {
    if (state.rows_inserted !== 0) return fail("empty_nonzero_rows_inserted");
    if (MANAGED_TAB_IDS.some((id) => tabCounts[id] !== 0)) {
      return fail("empty_nonzero_tab_counts");
    }
    if (resultRows.length !== 0) return fail("empty_with_result_rows");
    if (state.provider_as_of_min !== null || state.provider_as_of_max !== null) {
      return fail("empty_provider_bounds_present");
    }
    return {
      ok: true,
      generation: {
        status: "empty",
        state,
        rows: [],
        synced_at: state.synced_at,
        provider_as_of_max: null,
        provider_as_of_min: null,
      },
    };
  }

  // available
  if (state.rows_inserted <= 0) return fail("available_zero_rows_inserted");
  if (resultRows.length !== state.rows_inserted) {
    return fail("result_count_mismatch");
  }

  const providerMinMs = parseTimestampMs(state.provider_as_of_min);
  const providerMaxMs = parseTimestampMs(state.provider_as_of_max);
  if (providerMinMs === null || providerMaxMs === null) {
    return fail("invalid_provider_bounds");
  }
  if (providerMinMs > providerMaxMs) return fail("provider_bounds_inverted");

  const seen = new Set<string>();
  const actualCounts = emptyTabCounts();
  let actualMin: number | null = null;
  let actualMax: number | null = null;
  const byTab = new Map<ManagedTabId, ScreenerResultRow[]>();

  for (const row of resultRows) {
    if (!isManagedTabId(row.tab_id)) return fail("unmanaged_tab_id");
    if (row.sync_run_id !== state.sync_run_id) return fail("row_sync_run_id_mismatch");
    if (!sameInstant(row.updated_at, state.synced_at)) {
      return fail("row_updated_at_mismatch");
    }
    if (typeof row.symbol !== "string" || !SYMBOL_RE.test(row.symbol)) {
      return fail("invalid_symbol");
    }
    const key = `${row.tab_id}::${row.symbol}`;
    if (seen.has(key)) return fail("duplicate_tab_symbol");
    seen.add(key);

    if (!isPositiveFinite(row.volume)) return fail("invalid_volume");

    const providerMs = parseTimestampMs(row.provider_as_of);
    if (providerMs === null) return fail("invalid_provider_as_of");
    if (providerMs > nowMs + PROVIDER_FUTURE_SLACK_MS) {
      return fail("provider_as_of_too_far_future");
    }
    // Old provider timestamps are allowed (closed-market snapshots).

    if (row.avg_volume !== null) return fail("legacy_avg_volume_present");
    if (row.rvol !== null) return fail("legacy_rvol_present");
    if (row.float_shares !== null) return fail("float_shares_present");
    if (row.market_cap !== null) return fail("market_cap_present");

    if (row.tab_id === NHL_TAB_ID) {
      if (!isPositiveFinite(row.high_52w) || !isPositiveFinite(row.low_52w)) {
        return fail("nhl_52w_required");
      }
      if (row.low_52w > row.high_52w) return fail("nhl_52w_inverted");
      if (!isRangeEvent(row.range_event)) return fail("nhl_range_event_required");
      if (row.day_high === null || row.day_low === null) {
        return fail("nhl_day_range_required");
      }
    } else {
      if (row.high_52w !== null) return fail("high_52w_present");
      if (row.low_52w !== null) return fail("low_52w_present");
      if (row.range_event !== null) return fail("range_event_present");
    }

    const prior = row.prior_session_volume;
    const ratio = row.volume_ratio_prior_session;
    const priorNull = prior === null;
    const ratioNull = ratio === null;
    if (priorNull !== ratioNull) return fail("prior_ratio_pair_incomplete");
    if (!priorNull) {
      if (!isPositiveFinite(prior) || !isPositiveFinite(ratio)) {
        return fail("prior_ratio_not_positive");
      }
      if (expectedVolumeRatio(row.volume, prior) !== ratio) {
        return fail("ratio_inconsistent");
      }
    }
    if (RATIO_TAB_IDS.has(row.tab_id) && (priorNull || ratioNull)) {
      return fail("ratio_tab_missing_prior_metrics");
    }

    const high = row.day_high;
    const low = row.day_low;
    const highNull = high === null;
    const lowNull = low === null;
    if (highNull !== lowNull) return fail("day_range_pair_incomplete");
    if (!highNull) {
      if (!isPositiveFinite(high) || !isPositiveFinite(low)) {
        return fail("day_range_not_positive");
      }
      if (low > high) return fail("day_range_inverted");
    }

    if (row.price !== null && !isFiniteNumber(row.price)) return fail("invalid_price");
    if (row.change_percent !== null && !isFiniteNumber(row.change_percent)) {
      return fail("invalid_change_percent");
    }
    if (row.gap_percent !== null && !isFiniteNumber(row.gap_percent)) {
      return fail("invalid_gap_percent");
    }

    actualCounts[row.tab_id] += 1;
    actualMin = actualMin === null ? providerMs : Math.min(actualMin, providerMs);
    actualMax = actualMax === null ? providerMs : Math.max(actualMax, providerMs);

    const list = byTab.get(row.tab_id) ?? [];
    list.push(row);
    byTab.set(row.tab_id, list);
  }

  for (const tab of MANAGED_TAB_IDS) {
    if (actualCounts[tab] !== tabCounts[tab]) return fail("actual_tab_count_mismatch");
  }
  if (actualMin !== providerMinMs || actualMax !== providerMaxMs) {
    return fail("provider_min_max_mismatch");
  }

  for (const [, rows] of byTab) {
    if (rows.length > MAX_TAB_ROWS) return fail("tab_over_limit");
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const cur = rows[i];
      const pv = prev.volume as number;
      const cv = cur.volume as number;
      if (cv > pv) return fail("volume_order_invalid");
      if (cv === pv && cur.symbol < prev.symbol) {
        return fail("symbol_tiebreak_order_invalid");
      }
    }
  }

  return {
    ok: true,
    generation: {
      status: "available",
      state,
      rows: resultRows,
      synced_at: state.synced_at,
      provider_as_of_max: state.provider_as_of_max,
      provider_as_of_min: state.provider_as_of_min,
    },
  };
}

export function isGenerationStale(syncedAt: string, nowMs: number): boolean {
  const syncedMs = parseTimestampMs(syncedAt);
  if (syncedMs === null) return true;
  return nowMs - syncedMs > SCREENER_STALE_AFTER_MS;
}

/**
 * Milliseconds until a validated generation must flip to stale under the
 * strict rule `nowMs - syncedAtMs > SCREENER_STALE_AFTER_MS`.
 * Returns null for an invalid timestamp.
 */
export function msUntilStaleTransition(syncedAt: string, nowMs: number): number | null {
  const syncedMs = parseTimestampMs(syncedAt);
  if (syncedMs === null) return null;
  const age = nowMs - syncedMs;
  if (age > SCREENER_STALE_AFTER_MS) return 0;
  return SCREENER_STALE_AFTER_MS - age + 1;
}

export function viewForActiveTab(
  generation: ValidatedGeneration,
  activeTabId: string,
  nowMs: number,
  attempts: number,
): ScreenerTabView {
  if (activeTabId === NHL_TAB_ID) {
    const nhlStatus = parseNhlBaselineStatus(generation.state.nhl_baseline_status);
    if (nhlStatus === "initializing") {
      return {
        status: "initializing",
        rows: [],
        synced_at: generation.synced_at,
        provider_as_of_max: generation.provider_as_of_max,
        attempts,
      };
    }
    if (nhlStatus === "unavailable") {
      return {
        status: "unavailable",
        rows: [],
        synced_at: generation.synced_at,
        provider_as_of_max: generation.provider_as_of_max,
        attempts,
      };
    }
  }

  const tabRows = generation.rows.filter((r) => r.tab_id === activeTabId);
  const stale = isGenerationStale(generation.synced_at, nowMs);

  if (stale) {
    return {
      status: "stale",
      rows: tabRows,
      synced_at: generation.synced_at,
      provider_as_of_max: generation.provider_as_of_max,
      attempts,
    };
  }

  if (generation.status === "empty" || tabRows.length === 0) {
    return {
      status: "empty",
      rows: [],
      synced_at: generation.synced_at,
      provider_as_of_max: generation.provider_as_of_max,
      attempts,
    };
  }

  return {
    status: "available",
    rows: tabRows,
    synced_at: generation.synced_at,
    provider_as_of_max: generation.provider_as_of_max,
    attempts,
  };
}

export function unavailableView(attempts: number): ScreenerTabView {
  return {
    status: "unavailable",
    rows: [],
    synced_at: null,
    provider_as_of_max: null,
    attempts,
  };
}

/**
 * Exactly two total attempts: initial read + one complete retry on validation failure.
 * Query failures also return unavailable. Never falls back to sample rows.
 */
export async function loadVerifiedScreenerGeneration(
  fetchOnce: GenerationFetcher,
  opts: { nowMs: number; activeTabId: string },
): Promise<ScreenerTabView> {
  let attempts = 0;
  let lastOk: ValidatedGeneration | null = null;

  while (attempts < 2) {
    attempts += 1;
    let fetched: GenerationFetchResult;
    try {
      fetched = await fetchOnce();
    } catch {
      return unavailableView(attempts);
    }

    if (fetched.stateError || fetched.resultError) {
      return unavailableView(attempts);
    }

    const outcome = validateGeneration(fetched.stateRows, fetched.resultRows, opts.nowMs);
    if (outcome.ok) {
      lastOk = outcome.generation;
      break;
    }
  }

  if (!lastOk) return unavailableView(attempts);
  return viewForActiveTab(lastOk, opts.activeTabId, opts.nowMs, attempts);
}

export function formatDayRange(
  dayLow: number | null | undefined,
  dayHigh: number | null | undefined,
): string {
  if (!isPositiveFinite(dayLow) || !isPositiveFinite(dayHigh)) {
    return "Range unavailable";
  }
  return `$${dayLow.toFixed(2)}–$${dayHigh.toFixed(2)}`;
}

export function volumeRatioBadgeClass(value: number): string {
  if (!Number.isFinite(value)) return "text-foreground";
  if (value >= 5) return "text-red-500 font-semibold";
  if (value >= 3) return "text-amber-500 font-semibold";
  return "text-foreground";
}
