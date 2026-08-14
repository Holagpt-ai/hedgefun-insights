import { describe, expect, it } from "vitest";
import {
  RADAR_ACTIONS_MIN_WIDTH_PX,
  RADAR_ACTIONS_STICKY_CELL_CLASS,
  RADAR_ACTIONS_STICKY_HEADER_CLASS,
  RADAR_GRID_COLUMN_COUNT,
  RADAR_GRID_COLUMNS,
} from "../radar-grid-columns";

describe("Day Trade Radar desktop grid", () => {
  it("keeps nine columns with a sticky-right Actions contract", () => {
    expect(RADAR_GRID_COLUMN_COUNT).toBe(9);
    expect([...RADAR_GRID_COLUMNS]).toEqual([
      "#",
      "Symbol",
      "Signal",
      "Last / Move",
      "Range / HOD",
      "Volume",
      "Prior / Ratio",
      "Catalyst",
      "Actions",
    ]);
    expect(RADAR_ACTIONS_MIN_WIDTH_PX).toBe(160);
    expect(RADAR_ACTIONS_STICKY_HEADER_CLASS).toMatch(/sticky right-0/);
    expect(RADAR_ACTIONS_STICKY_CELL_CLASS).toMatch(/sticky right-0/);
  });
});
