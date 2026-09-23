import { getScannerField } from "@/config/scanner-fields.config";

/** Default visible Day Trade Radar column headers (desktop). */
export const RADAR_GRID_COLUMNS = [
  "Triggered",
  "Rank",
  "Symbol / Signal",
  "Last / Move",
  "Today Vol",
  "Prior Vol",
  "Vol / Prior",
  "5m RVOL",
  "Vol Velocity",
  "Acceleration",
  "Float",
  "Float Turnover",
  "HOD Distance",
  "VWAP State",
  "Day Range",
  "Catalyst",
  "History",
  "Actions",
] as const;

export const RADAR_GRID_COLUMN_COUNT = RADAR_GRID_COLUMNS.length;

/** Four 32px actions + gaps + cell padding. */
export const RADAR_ACTIONS_MIN_WIDTH_PX = 160;

export const RADAR_ACTIONS_STICKY_HEADER_CLASS =
  "sticky right-0 z-30 min-w-[160px] w-[160px] bg-muted border-l border-border shadow-[-8px_0_12px_-8px_hsl(var(--foreground)/0.18)]";

export const RADAR_ACTIONS_STICKY_CELL_CLASS =
  "sticky right-0 z-20 min-w-[160px] w-[160px] border-l border-border shadow-[-8px_0_12px_-8px_hsl(var(--foreground)/0.18)]";

export const RADAR_COLUMN_IDS = [
  "trigger_time",
  "rank",
  "symbol",
  "signal",
  "price_move",
  "volume",
  "prior_volume",
  "volume_ratio",
  "dollar_volume",
  "rvol_5m",
  "vol_velocity",
  "acceleration_5m",
  "float",
  "float_turnover",
  "hod_distance",
  "vwap_state",
  "day_range",
  "range_hod",
  "volume_5s",
  "volume_15s",
  "volume_60s",
  "dollar_volume_60s",
  "daily_rvol",
  "trade_quality",
  "freshness",
  "data_time",
  "move_15s",
  "move_60s",
  "catalyst",
  "history",
  "actions",
] as const;

export type RadarColumnId = (typeof RADAR_COLUMN_IDS)[number];

export interface RadarColumnDefinition {
  id: RadarColumnId;
  label: string;
  fieldId: string | null;
  defaultVisible: boolean;
  required: boolean;
  align: "left" | "right";
  optional: boolean;
}

export const RADAR_COLUMN_DEFINITIONS: readonly RadarColumnDefinition[] = [
  { id: "trigger_time", label: "Triggered", fieldId: "trigger_time", defaultVisible: true, required: false, align: "left", optional: false },
  { id: "rank", label: "Rank", fieldId: null, defaultVisible: true, required: true, align: "left", optional: false },
  { id: "symbol", label: "Symbol / Signal", fieldId: "symbol", defaultVisible: true, required: true, align: "left", optional: false },
  { id: "signal", label: "Signal", fieldId: null, defaultVisible: false, required: false, align: "left", optional: true },
  { id: "price_move", label: "Last / Move", fieldId: "price", defaultVisible: true, required: false, align: "right", optional: false },
  { id: "volume", label: "Today Vol", fieldId: "volume", defaultVisible: true, required: false, align: "right", optional: false },
  { id: "prior_volume", label: "Prior Vol", fieldId: "prior_volume", defaultVisible: true, required: false, align: "right", optional: false },
  { id: "volume_ratio", label: "Vol / Prior", fieldId: "volume_ratio", defaultVisible: true, required: false, align: "right", optional: false },
  { id: "dollar_volume", label: "$ Volume", fieldId: "dollar_volume", defaultVisible: false, required: false, align: "right", optional: true },
  { id: "rvol_5m", label: "5m RVOL", fieldId: "rvol_5m", defaultVisible: true, required: false, align: "right", optional: false },
  { id: "vol_velocity", label: "Vol Velocity", fieldId: "vol_velocity", defaultVisible: true, required: false, align: "right", optional: false },
  { id: "acceleration_5m", label: "Acceleration", fieldId: "acceleration_5m", defaultVisible: true, required: false, align: "right", optional: false },
  { id: "float", label: "Float", fieldId: "float", defaultVisible: false, required: false, align: "right", optional: true },
  { id: "float_turnover", label: "Float Turnover", fieldId: "float_turnover", defaultVisible: false, required: false, align: "right", optional: true },
  { id: "hod_distance", label: "HOD Distance", fieldId: "hod_distance", defaultVisible: true, required: false, align: "right", optional: false },
  { id: "vwap_state", label: "VWAP State", fieldId: "vwap_state", defaultVisible: false, required: false, align: "right", optional: true },
  { id: "day_range", label: "Day Range", fieldId: "day_range", defaultVisible: false, required: false, align: "left", optional: true },
  { id: "range_hod", label: "Range / HOD", fieldId: "day_range", defaultVisible: false, required: false, align: "left", optional: true },
  { id: "volume_5s", label: "5s Volume", fieldId: "volume_5s", defaultVisible: false, required: false, align: "right", optional: true },
  { id: "volume_15s", label: "15s Volume", fieldId: "volume_15s", defaultVisible: false, required: false, align: "right", optional: true },
  { id: "volume_60s", label: "60s Volume", fieldId: "volume_60s", defaultVisible: false, required: false, align: "right", optional: true },
  { id: "dollar_volume_60s", label: "60s Dollar Volume", fieldId: "dollar_volume_60s", defaultVisible: false, required: false, align: "right", optional: true },
  { id: "daily_rvol", label: "RVOL 20D", fieldId: "daily_rvol", defaultVisible: false, required: false, align: "right", optional: true },
  { id: "trade_quality", label: "Trade Quality", fieldId: "trade_quality", defaultVisible: false, required: false, align: "right", optional: true },
  { id: "freshness", label: "Freshness", fieldId: "freshness", defaultVisible: false, required: false, align: "right", optional: true },
  { id: "data_time", label: "Data Time", fieldId: "data_time", defaultVisible: false, required: false, align: "right", optional: true },
  { id: "move_15s", label: "15s Move", fieldId: "move_15s", defaultVisible: false, required: false, align: "right", optional: true },
  { id: "move_60s", label: "60s Move", fieldId: "move_60s", defaultVisible: false, required: false, align: "right", optional: true },
  { id: "catalyst", label: "Catalyst", fieldId: "catalyst", defaultVisible: true, required: false, align: "left", optional: false },
  { id: "history", label: "History", fieldId: "history", defaultVisible: true, required: false, align: "left", optional: false },
  { id: "actions", label: "Actions", fieldId: null, defaultVisible: true, required: true, align: "left", optional: false },
];

const COLUMN_BY_ID: ReadonlyMap<RadarColumnId, RadarColumnDefinition> = new Map(
  RADAR_COLUMN_DEFINITIONS.map((column) => [column.id, column]),
);

export const DEFAULT_RADAR_COLUMN_IDS: readonly RadarColumnId[] = RADAR_COLUMN_DEFINITIONS
  .filter((column) => column.defaultVisible)
  .map((column) => column.id);

export const OPTIONAL_RADAR_COLUMN_IDS: readonly RadarColumnId[] = RADAR_COLUMN_DEFINITIONS
  .filter((column) => column.optional)
  .map((column) => column.id);

export const REQUIRED_RADAR_COLUMN_IDS: readonly RadarColumnId[] = RADAR_COLUMN_DEFINITIONS
  .filter((column) => column.required)
  .map((column) => column.id);

export const FUTURE_RADAR_COLUMN_FIELD_IDS = [
  "short_float",
  "spread",
  "market_cap",
  "ssr",
  "borrow_fee",
  "institutional_ownership",
  "latest_trigger",
  "catalyst_time",
] as const;

export const RADAR_COLUMN_STORAGE_KEY = "stocksist.trader-lens.radar-columns.v6";

export function isRadarColumnId(value: unknown): value is RadarColumnId {
  return typeof value === "string" && COLUMN_BY_ID.has(value as RadarColumnId);
}

export function getRadarColumn(id: RadarColumnId): RadarColumnDefinition {
  return COLUMN_BY_ID.get(id) as RadarColumnDefinition;
}

export function radarColumnHelpFieldId(id: RadarColumnId): string | null {
  return getRadarColumn(id).fieldId;
}

export function radarColumnHeaderLabel(id: RadarColumnId): string {
  return getRadarColumn(id).label;
}

const DISPLAY_ORDER = RADAR_COLUMN_DEFINITIONS.map((column) => column.id);

/**
 * Keep required columns, drop unknowns, restore compact default order.
 * Optional columns appear before Catalyst / Actions so Actions stays sticky-right.
 */
export function canonicalizeRadarColumns(ids: readonly string[]): RadarColumnId[] {
  const wanted = new Set<RadarColumnId>();
  for (const id of REQUIRED_RADAR_COLUMN_IDS) wanted.add(id);
  for (const id of ids) {
    if (isRadarColumnId(id)) wanted.add(id);
  }
  return DISPLAY_ORDER.filter((id) => wanted.has(id));
}

export function parseSavedRadarColumns(raw: string | null | undefined): RadarColumnId[] | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const known = parsed.filter(isRadarColumnId);
    if (known.length === 0) return null;
    return canonicalizeRadarColumns(known);
  } catch {
    return null;
  }
}

export function defaultRadarColumns(): RadarColumnId[] {
  return canonicalizeRadarColumns(DEFAULT_RADAR_COLUMN_IDS);
}

export function futureRadarColumnLabels(): { id: string; label: string }[] {
  return FUTURE_RADAR_COLUMN_FIELD_IDS.map((id) => {
    const field = getScannerField(id);
    return { id, label: field?.label ?? id };
  });
}

export function radarGridMinWidthPx(visibleCount: number): number {
  const extra = Math.max(0, visibleCount - RADAR_GRID_COLUMN_COUNT);
  return 1280 + extra * 88;
}
