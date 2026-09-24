/**
 * Multi-Radar Workspace V1.
 * View layer over the existing Radar candidate universe.
 * Does not create a second scanner, rank, or market feed.
 */

import { toCanonicalUtcTimestamp } from "@/lib/screeners/trigger-time";
import { formatCompactNumber, finiteMetric } from "@/lib/screeners/screener-metric-display";
import { formatScannerEventLabel } from "@/lib/screeners/scanner-events-display";
import { RADAR_COLUMN_STORAGE_KEY } from "./radar-grid-columns";
import type { RadarRankedRow } from "./types";

export const MULTI_RADAR_DESK_NAME = "DAY TRADE DESK";
export const MULTI_RADAR_STORAGE_KEY = "stocksist.day-trade-radar.workspace.v1";
export const MULTI_RADAR_STORAGE_VERSION = 1;
export const PANEL_NEW_WINDOW_MS = 3 * 60 * 1000;

export const BREAKOUT_EVENT_TYPES = [
  "HOD_BREAK",
  "HOD_MOMENTUM",
  "RUNNING_UP",
  "VWAP_RECLAIM",
  "GAP_CONTINUATION",
] as const;

export type BreakoutEventType = (typeof BREAKOUT_EVENT_TYPES)[number];

const BREAKOUT_PRIORITY = new Map<string, number>(
  BREAKOUT_EVENT_TYPES.map((type, index) => [type, index]),
);

export type RadarPanelId = "day_trade" | "breakouts" | "penny";

export type PennyPriceBandId = "under_1" | "band_1_2" | "band_2_5";

export const PENNY_PRICE_BANDS: readonly { id: PennyPriceBandId; label: string }[] = [
  { id: "under_1", label: "Under $1" },
  { id: "band_1_2", label: "$1–$2" },
  { id: "band_2_5", label: "$2–$5" },
];

export type PanelSortId = "rank" | "volume_speed" | "move" | "time";

export type PanelColumnId =
  | "time"
  | "rank"
  | "symbol"
  | "last"
  | "move"
  | "float"
  | "today_vol"
  | "yday_vol"
  | "vol_yday"
  | "rvol_5m"
  | "volume_speed"
  | "volume_trend"
  | "hod"
  | "vwap"
  | "catalyst"
  | "history"
  | "actions";

export interface PanelColumnDef {
  id: PanelColumnId;
  label: string;
  required: boolean;
}

export const PANEL_COLUMN_DEFS: readonly PanelColumnDef[] = [
  { id: "time", label: "TIME", required: true },
  { id: "rank", label: "RANK", required: true },
  { id: "symbol", label: "SYMBOL / SIGNAL", required: true },
  { id: "last", label: "LAST", required: false },
  { id: "move", label: "MOVE", required: false },
  { id: "float", label: "FLOAT", required: false },
  { id: "today_vol", label: "TODAY VOL", required: false },
  { id: "yday_vol", label: "YDAY VOL", required: false },
  { id: "vol_yday", label: "VOL/YDAY", required: false },
  { id: "rvol_5m", label: "5M RVOL", required: false },
  { id: "volume_speed", label: "VOLUME SPEED", required: false },
  { id: "volume_trend", label: "VOLUME TREND", required: false },
  { id: "hod", label: "HOD", required: false },
  { id: "vwap", label: "VWAP", required: false },
  { id: "catalyst", label: "CATALYST", required: false },
  { id: "history", label: "HISTORY", required: false },
  { id: "actions", label: "ACTIONS", required: true },
];

const COLUMN_ORDER = PANEL_COLUMN_DEFS.map((column) => column.id);

export const DAY_TRADE_DEFAULT_COLUMNS: readonly PanelColumnId[] = [
  "time",
  "rank",
  "symbol",
  "last",
  "move",
  "float",
  "today_vol",
  "yday_vol",
  "vol_yday",
  "rvol_5m",
  "volume_speed",
  "volume_trend",
  "hod",
  "catalyst",
  "history",
  "actions",
];

export const BREAKOUT_DEFAULT_COLUMNS: readonly PanelColumnId[] = [
  "time",
  "rank",
  "symbol",
  "last",
  "move",
  "today_vol",
  "rvol_5m",
  "volume_speed",
  "volume_trend",
  "hod",
  "vwap",
  "float",
  "catalyst",
  "history",
  "actions",
];

export const PENNY_DEFAULT_COLUMNS: readonly PanelColumnId[] = [
  "time",
  "rank",
  "symbol",
  "last",
  "move",
  "float",
  "today_vol",
  "yday_vol",
  "vol_yday",
  "rvol_5m",
  "volume_speed",
  "volume_trend",
  "hod",
  "catalyst",
  "history",
  "actions",
];

export interface PanelFilterDraft {
  minPrice: string;
  maxPrice: string;
  minVolume: string;
  minMovePct: string;
}

export const EMPTY_PANEL_FILTERS: PanelFilterDraft = {
  minPrice: "",
  maxPrice: "",
  minVolume: "",
  minMovePct: "",
};

export interface PanelWorkspaceState {
  columns: PanelColumnId[];
  sort: PanelSortId;
  filters: PanelFilterDraft;
  priceBand: PennyPriceBandId;
}

export interface MultiRadarWorkspaceState {
  version: number;
  desk: typeof MULTI_RADAR_DESK_NAME;
  mobilePanel: RadarPanelId;
  panels: Record<RadarPanelId, PanelWorkspaceState>;
}

export interface ScannerEventRecord {
  type: string;
  triggeredAt: string | null;
  active: boolean;
}

export type VolumeTrendLabel = "COOLING ↓" | "STEADY" | "RISING ↑" | "SURGING ↑↑" | "EXTREME ↑↑";

export interface VolumeTrendView {
  label: VolumeTrendLabel | "—";
  title: string;
}

export interface PanelTimeView {
  iso: string | null;
  source: string;
}

const PANEL_META: Record<
  RadarPanelId,
  { title: string; subtitle: string; leaderLabel: string; columns: readonly PanelColumnId[] }
> = {
  day_trade: {
    title: "DAY TRADE",
    subtitle: "Active stocks in play today",
    leaderLabel: "TOP LEADER",
    columns: DAY_TRADE_DEFAULT_COLUMNS,
  },
  breakouts: {
    title: "BREAKOUTS",
    subtitle: "Stocks attacking or crossing key intraday levels",
    leaderLabel: "TOP BREAKOUT",
    columns: BREAKOUT_DEFAULT_COLUMNS,
  },
  penny: {
    title: "PENNY STOCKS",
    subtitle: "UNDER $1",
    leaderLabel: "HOT PENNY",
    columns: PENNY_DEFAULT_COLUMNS,
  },
};

export function panelMeta(id: RadarPanelId) {
  return PANEL_META[id];
}

export function defaultPanelState(id: RadarPanelId): PanelWorkspaceState {
  return {
    columns: [...PANEL_META[id].columns],
    sort: "rank",
    filters: { ...EMPTY_PANEL_FILTERS },
    priceBand: "under_1",
  };
}

export function defaultWorkspaceState(): MultiRadarWorkspaceState {
  return {
    version: MULTI_RADAR_STORAGE_VERSION,
    desk: MULTI_RADAR_DESK_NAME,
    mobilePanel: "day_trade",
    panels: {
      day_trade: defaultPanelState("day_trade"),
      breakouts: defaultPanelState("breakouts"),
      penny: defaultPanelState("penny"),
    },
  };
}

function isPanelColumnId(value: unknown): value is PanelColumnId {
  return typeof value === "string" && COLUMN_ORDER.includes(value as PanelColumnId);
}

function isSortId(value: unknown): value is PanelSortId {
  return value === "rank" || value === "volume_speed" || value === "move" || value === "time";
}

function isBandId(value: unknown): value is PennyPriceBandId {
  return value === "under_1" || value === "band_1_2" || value === "band_2_5";
}

function isPanelId(value: unknown): value is RadarPanelId {
  return value === "day_trade" || value === "breakouts" || value === "penny";
}

export function canonicalizePanelColumns(ids: readonly string[]): PanelColumnId[] {
  const wanted = new Set<PanelColumnId>(["time", "rank", "symbol", "actions"]);
  for (const id of ids) {
    if (isPanelColumnId(id)) wanted.add(id);
  }
  return COLUMN_ORDER.filter((id) => wanted.has(id));
}

function readFilters(value: unknown): PanelFilterDraft {
  if (!value || typeof value !== "object") return { ...EMPTY_PANEL_FILTERS };
  const raw = value as Record<string, unknown>;
  const text = (key: keyof PanelFilterDraft) => (typeof raw[key] === "string" ? raw[key] : "");
  return {
    minPrice: text("minPrice"),
    maxPrice: text("maxPrice"),
    minVolume: text("minVolume"),
    minMovePct: text("minMovePct"),
  };
}

function readPanelState(id: RadarPanelId, value: unknown): PanelWorkspaceState {
  const fallback = defaultPanelState(id);
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  const columns = Array.isArray(raw.columns)
    ? canonicalizePanelColumns(raw.columns.filter((item): item is string => typeof item === "string"))
    : fallback.columns;
  return {
    columns,
    sort: isSortId(raw.sort) ? raw.sort : fallback.sort,
    filters: readFilters(raw.filters),
    priceBand: isBandId(raw.priceBand) ? raw.priceBand : "under_1",
  };
}

export function parseWorkspaceState(raw: string | null | undefined): MultiRadarWorkspaceState | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    if (record.version !== MULTI_RADAR_STORAGE_VERSION) return null;
    if (record.desk !== MULTI_RADAR_DESK_NAME) return null;
    const panels = record.panels;
    if (!panels || typeof panels !== "object") return null;
    const panelRecord = panels as Record<string, unknown>;
    return {
      version: MULTI_RADAR_STORAGE_VERSION,
      desk: MULTI_RADAR_DESK_NAME,
      mobilePanel: isPanelId(record.mobilePanel) ? record.mobilePanel : "day_trade",
      panels: {
        day_trade: readPanelState("day_trade", panelRecord.day_trade),
        breakouts: readPanelState("breakouts", panelRecord.breakouts),
        penny: readPanelState("penny", panelRecord.penny),
      },
    };
  } catch {
    return null;
  }
}

/** Drop legacy Day Trade Radar column layout. Leave every other preference key alone. */
export function retireLegacyRadarWorkspaceStorage(storage: Pick<Storage, "getItem" | "removeItem" | "setItem">): void {
  const current = parseWorkspaceState(storage.getItem(MULTI_RADAR_STORAGE_KEY));
  if (current) return;
  storage.removeItem(RADAR_COLUMN_STORAGE_KEY);
  storage.setItem(MULTI_RADAR_STORAGE_KEY, JSON.stringify(defaultWorkspaceState()));
}

export function loadWorkspaceState(storage: Pick<Storage, "getItem" | "removeItem" | "setItem">): MultiRadarWorkspaceState {
  retireLegacyRadarWorkspaceStorage(storage);
  return parseWorkspaceState(storage.getItem(MULTI_RADAR_STORAGE_KEY)) ?? defaultWorkspaceState();
}

export function qualifiesPennyPrice(price: number | null | undefined, band: PennyPriceBandId = "under_1"): boolean {
  if (price === null || price === undefined || !Number.isFinite(price)) return false;
  if (band === "under_1") return price < 1;
  if (band === "band_1_2") return price >= 1 && price < 2;
  return price >= 2 && price <= 5;
}

export function parseScannerEvents(raw: unknown): ScannerEventRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: ScannerEventRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type : "";
    if (!type) continue;
    const triggered = typeof record.triggered_at === "string" ? record.triggered_at : null;
    out.push({
      type,
      triggeredAt: toCanonicalUtcTimestamp(triggered),
      active: record.active !== false,
    });
  }
  return out;
}

export function activeBreakoutEvents(row: Pick<RadarRankedRow, "scanner_events" | "primary_scanner_event" | "primary_scanner_event_at" | "last_hod_break_at">): ScannerEventRecord[] {
  const fromList = parseScannerEvents(row.scanner_events).filter(
    (event) => event.active && BREAKOUT_PRIORITY.has(event.type),
  );
  const primary = row.primary_scanner_event;
  if (primary && BREAKOUT_PRIORITY.has(primary)) {
    const already = fromList.some((event) => event.type === primary);
    if (!already) {
      fromList.push({
        type: primary,
        triggeredAt: toCanonicalUtcTimestamp(row.primary_scanner_event_at ?? null),
        active: true,
      });
    }
  }
  return fromList;
}

export function qualifiesBreakouts(row: Pick<RadarRankedRow, "scanner_events" | "primary_scanner_event" | "primary_scanner_event_at" | "last_hod_break_at">): boolean {
  return activeBreakoutEvents(row).length > 0;
}

function earliestIso(values: Array<string | null | undefined>): string | null {
  const canonical = values
    .map((value) => toCanonicalUtcTimestamp(value ?? null))
    .filter((value): value is string => value !== null)
    .sort();
  return canonical[0] ?? null;
}

/** Day Trade clock is radar promotion. Never updated_at and never a scanner event. */
export function dayTradePanelTime(row: Pick<RadarRankedRow, "promoted_at" | "updated_at">): PanelTimeView {
  const iso = toCanonicalUtcTimestamp(row.promoted_at ?? null);
  return { iso, source: iso ? "promoted_at" : "unavailable" };
}

/** First qualifying breakout timestamp. Independent of Day Trade promotion. */
export function breakoutPanelTime(
  row: Pick<RadarRankedRow, "scanner_events" | "primary_scanner_event" | "primary_scanner_event_at" | "last_hod_break_at" | "promoted_at" | "updated_at">,
): PanelTimeView {
  const events = activeBreakoutEvents(row);
  const stamps = events.map((event) => event.triggeredAt);
  if (events.some((event) => event.type === "HOD_BREAK")) {
    stamps.push(toCanonicalUtcTimestamp(row.last_hod_break_at ?? null));
  }
  const iso = earliestIso(stamps);
  return { iso, source: iso ? "breakout_event" : "unavailable" };
}

/**
 * Penny panel has no separate persisted cross-under-$1 clock.
 * The only genuine first-seen timestamp on the candidate is promoted_at.
 */
export function pennyPanelTime(row: Pick<RadarRankedRow, "promoted_at" | "updated_at">): PanelTimeView {
  const iso = toCanonicalUtcTimestamp(row.promoted_at ?? null);
  return { iso, source: iso ? "promoted_at" : "unavailable" };
}

export function panelTime(id: RadarPanelId, row: RadarRankedRow): PanelTimeView {
  if (id === "breakouts") return breakoutPanelTime(row);
  if (id === "penny") return pennyPanelTime(row);
  return dayTradePanelTime(row);
}

export function panelAgeLabel(iso: string | null, nowMs: number): "NEW" | string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const age = Math.max(0, nowMs - at);
  if (age < PANEL_NEW_WINDOW_MS) return "NEW";
  const minutes = Math.floor(age / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function mapVolumeTrend(accelerationPct: number | null | undefined): VolumeTrendView {
  const n = finiteMetric(accelerationPct);
  if (n === null) return { label: "—", title: "Volume trend unavailable" };
  const signed = `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
  const title = `Volume rate is ${signed} versus the prior 5-minute window.`;
  if (n <= -20) return { label: "COOLING ↓", title };
  if (n < 20) return { label: "STEADY", title };
  if (n < 50) return { label: "RISING ↑", title };
  if (n < 100) return { label: "SURGING ↑↑", title };
  return { label: "EXTREME ↑↑", title };
}

export function formatVolumeSpeedCompact(value: number | null | undefined): string {
  const n = finiteMetric(value);
  if (n === null) return "—";
  return `${formatCompactNumber(n)}/min`;
}

export function formatVolumeSpeedExact(value: number | null | undefined): string {
  const n = finiteMetric(value);
  if (n === null) return "—";
  return `${Math.round(n).toLocaleString("en-US")} shares/min`;
}

/** Spotlight readout: full shares under 1M, compact millions above. */
export function formatVolumeSpeedSpotlight(value: number | null | undefined): { value: string; unit: string } | null {
  const n = finiteMetric(value);
  if (n === null) return null;
  if (Math.abs(n) >= 1_000_000) {
    return { value: `${(n / 1_000_000).toFixed(2)}M`, unit: "shares/min" };
  }
  return { value: Math.round(n).toLocaleString("en-US"), unit: "shares/min" };
}

export function formatDeskHod(row: Pick<RadarRankedRow, "hod_distance_percent" | "scanner_events" | "primary_scanner_event" | "last_hod_break_at">): string {
  const events = activeBreakoutEvents(row);
  const breaking = events.some((event) => event.type === "HOD_BREAK") || row.primary_scanner_event === "HOD_BREAK";
  if (breaking) return "BREAK";
  const distance = finiteMetric(row.hod_distance_percent);
  if (distance === null) return "—";
  if (distance <= 0.05) return "AT HOD";
  return `${distance.toFixed(1)}% away`;
}

export function formatDeskVwap(row: Pick<RadarRankedRow, "vwap_side" | "scanner_events" | "primary_scanner_event">): string {
  const events = parseScannerEvents(row.scanner_events).filter((event) => event.active);
  const types = new Set(events.map((event) => event.type));
  if (row.primary_scanner_event) types.add(row.primary_scanner_event);
  if (types.has("VWAP_RECLAIM")) return "Reclaim";
  if (types.has("VWAP_LOSS")) return "Lost";
  if (row.vwap_side === "above") return "Above";
  if (row.vwap_side === "below") return "Below";
  return "—";
}

export function breakoutSignalLabel(row: Pick<RadarRankedRow, "scanner_events" | "primary_scanner_event" | "primary_scanner_event_at" | "last_hod_break_at">): string | null {
  const events = activeBreakoutEvents(row);
  if (events.length === 0) return null;
  const best = [...events].sort((a, b) => (BREAKOUT_PRIORITY.get(a.type) ?? 99) - (BREAKOUT_PRIORITY.get(b.type) ?? 99))[0];
  return best ? formatScannerEventLabel(best.type) : null;
}

/** Row subtitle: a real scanner event, else NEW, else nothing. Never VOLUME LEADER. */
export function deskRowSignal(
  row: Pick<RadarRankedRow, "scanner_events" | "primary_scanner_event" | "primary_scanner_event_at" | "last_hod_break_at" | "signal">,
  ageLabel: string | null,
): string | null {
  const primary = formatScannerEventLabel(row.primary_scanner_event);
  if (primary) return primary;
  const active = parseScannerEvents(row.scanner_events).filter((event) => event.active);
  const labeled = active
    .map((event) => formatScannerEventLabel(event.type))
    .filter((label): label is string => Boolean(label));
  if (labeled[0]) return labeled[0];
  if (ageLabel === "NEW") return "NEW";
  return null;
}

function parseBound(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function rowMatchesPanelFilters(row: RadarRankedRow, filters: PanelFilterDraft): boolean {
  const minPrice = parseBound(filters.minPrice);
  const maxPrice = parseBound(filters.maxPrice);
  const minVolume = parseBound(filters.minVolume);
  const minMove = parseBound(filters.minMovePct);
  if (minPrice !== null && (row.price === null || row.price < minPrice)) return false;
  if (maxPrice !== null && (row.price === null || row.price > maxPrice)) return false;
  if (minVolume !== null && (row.volume === null || row.volume < minVolume)) return false;
  if (minMove !== null && (row.change_percent === null || row.change_percent < minMove)) return false;
  return true;
}

export function qualifyPanelRows(
  rows: readonly RadarRankedRow[],
  panel: RadarPanelId,
  band: PennyPriceBandId = "under_1",
): RadarRankedRow[] {
  if (panel === "breakouts") return rows.filter((row) => qualifiesBreakouts(row));
  if (panel === "penny") return rows.filter((row) => qualifiesPennyPrice(row.price, band));
  return [...rows];
}

export function sortPanelRows(rows: readonly RadarRankedRow[], panel: RadarPanelId, sort: PanelSortId): RadarRankedRow[] {
  const copy = [...rows];
  if (sort === "rank") {
    copy.sort((a, b) => a.rank - b.rank);
    return copy;
  }
  if (sort === "volume_speed") {
    copy.sort((a, b) => (finiteMetric(b.vol_velocity) ?? -1) - (finiteMetric(a.vol_velocity) ?? -1) || a.rank - b.rank);
    return copy;
  }
  if (sort === "move") {
    copy.sort((a, b) => (finiteMetric(b.change_percent) ?? -Infinity) - (finiteMetric(a.change_percent) ?? -Infinity) || a.rank - b.rank);
    return copy;
  }
  copy.sort((a, b) => {
    const at = panelTime(panel, a).iso;
    const bt = panelTime(panel, b).iso;
    if (at && bt && at !== bt) return bt.localeCompare(at);
    if (at && !bt) return -1;
    if (!at && bt) return 1;
    return a.rank - b.rank;
  });
  return copy;
}

export function selectDayTradeLeader(rows: readonly RadarRankedRow[]): RadarRankedRow | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => a.rank - b.rank)[0] ?? null;
}

export function selectPennyLeader(rows: readonly RadarRankedRow[]): RadarRankedRow | null {
  return selectDayTradeLeader(rows);
}

export function selectBreakoutLeader(rows: readonly RadarRankedRow[]): RadarRankedRow | null {
  if (rows.length === 0) return null;
  const ranked = [...rows].sort((a, b) => {
    const aEvents = activeBreakoutEvents(a);
    const bEvents = activeBreakoutEvents(b);
    const aPriority = Math.min(...aEvents.map((event) => BREAKOUT_PRIORITY.get(event.type) ?? 99));
    const bPriority = Math.min(...bEvents.map((event) => BREAKOUT_PRIORITY.get(event.type) ?? 99));
    if (aPriority !== bPriority) return aPriority - bPriority;
    const aTime = breakoutPanelTime(a).iso ?? "";
    const bTime = breakoutPanelTime(b).iso ?? "";
    if (aTime !== bTime) return bTime.localeCompare(aTime);
    if (a.rank !== b.rank) return a.rank - b.rank;
    return (finiteMetric(b.volume) ?? -1) - (finiteMetric(a.volume) ?? -1);
  });
  return ranked[0] ?? null;
}

export function selectPanelLeader(panel: RadarPanelId, rows: readonly RadarRankedRow[]): RadarRankedRow | null {
  if (panel === "breakouts") return selectBreakoutLeader(rows);
  if (panel === "penny") return selectPennyLeader(rows);
  return selectDayTradeLeader(rows);
}
