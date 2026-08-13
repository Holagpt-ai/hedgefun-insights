import { describe, expect, it } from "vitest";
import {
  RADAR_GRID_COLUMN_COUNT,
  RADAR_GRID_COLUMNS,
} from "../radar-grid-columns";

describe("Day Trade Radar desktop grid", () => {
  it("compacts to nine columns that fit a 1280px board", () => {
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
  });
});
