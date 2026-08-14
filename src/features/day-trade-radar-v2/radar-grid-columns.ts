/** Desktop Day Trade Radar columns. Metric columns may scroll behind a sticky Actions column. */
export const RADAR_GRID_COLUMNS = [
  "#",
  "Symbol",
  "Signal",
  "Last / Move",
  "Range / HOD",
  "Volume",
  "Prior / Ratio",
  "Catalyst",
  "Actions",
] as const;

export const RADAR_GRID_COLUMN_COUNT = RADAR_GRID_COLUMNS.length;

/** Four 32px actions + gaps + cell padding. */
export const RADAR_ACTIONS_MIN_WIDTH_PX = 160;

export const RADAR_ACTIONS_STICKY_HEADER_CLASS =
  "sticky right-0 z-30 min-w-[160px] w-[160px] bg-muted border-l border-border shadow-[-8px_0_12px_-8px_hsl(var(--foreground)/0.18)]";

export const RADAR_ACTIONS_STICKY_CELL_CLASS =
  "sticky right-0 z-20 min-w-[160px] w-[160px] border-l border-border shadow-[-8px_0_12px_-8px_hsl(var(--foreground)/0.18)]";
