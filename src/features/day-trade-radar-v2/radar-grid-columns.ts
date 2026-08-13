/** Desktop Day Trade Radar columns. Combined cells keep the board at 1280px without a horizontal scrollbar. */
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
