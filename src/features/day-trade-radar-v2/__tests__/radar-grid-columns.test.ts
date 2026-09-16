import { describe, expect, it } from "vitest";
import {
  DEFAULT_RADAR_COLUMN_IDS,
  OPTIONAL_RADAR_COLUMN_IDS,
  RADAR_ACTIONS_MIN_WIDTH_PX,
  RADAR_ACTIONS_STICKY_CELL_CLASS,
  RADAR_ACTIONS_STICKY_HEADER_CLASS,
  RADAR_GRID_COLUMN_COUNT,
  RADAR_GRID_COLUMNS,
  canonicalizeRadarColumns,
  defaultRadarColumns,
  parseSavedRadarColumns,
} from "../radar-grid-columns";

describe("Day Trade Radar desktop grid", () => {
  it("keeps nine default columns with a sticky-right Actions contract", () => {
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
    expect([...DEFAULT_RADAR_COLUMN_IDS]).toEqual([
      "rank",
      "symbol",
      "signal",
      "price_move",
      "range_hod",
      "volume",
      "prior_ratio",
      "catalyst",
      "actions",
    ]);
    expect(defaultRadarColumns()).toEqual([...DEFAULT_RADAR_COLUMN_IDS]);
    expect(RADAR_ACTIONS_MIN_WIDTH_PX).toBe(160);
    expect(RADAR_ACTIONS_STICKY_HEADER_CLASS).toMatch(/sticky right-0/);
    expect(RADAR_ACTIONS_STICKY_CELL_CLASS).toMatch(/sticky right-0/);
  });

  it("keeps optional truthful metrics off by default", () => {
    expect([...OPTIONAL_RADAR_COLUMN_IDS]).toEqual([
      "volume_5s",
      "volume_15s",
      "volume_60s",
      "dollar_volume_60s",
      "acceleration_5m",
      "vwap_state",
      "freshness",
      "data_time",
    ]);
    for (const id of OPTIONAL_RADAR_COLUMN_IDS) {
      expect(DEFAULT_RADAR_COLUMN_IDS).not.toContain(id);
    }
  });
});

describe("saved Radar column choices", () => {
  it("parses local saved column choices safely", () => {
    expect(parseSavedRadarColumns(null)).toBeNull();
    expect(parseSavedRadarColumns("")).toBeNull();
    expect(parseSavedRadarColumns("{not json")).toBeNull();
    expect(parseSavedRadarColumns("{\"volume_5s\":true}")).toBeNull();
    expect(parseSavedRadarColumns("[]")).toBeNull();
    expect(parseSavedRadarColumns("[\"nope\"]")).toBeNull();
    expect(parseSavedRadarColumns("[\"volume_5s\"]")).toEqual([
      "rank",
      "symbol",
      "volume_5s",
      "actions",
    ]);
    expect(parseSavedRadarColumns("[\"data_time\",\"symbol\",\"rank\"]")).toEqual([
      "rank",
      "symbol",
      "data_time",
      "actions",
    ]);
  });

  it("cannot drop required identity columns", () => {
    expect(canonicalizeRadarColumns(["catalyst"])).toEqual([
      "rank",
      "symbol",
      "catalyst",
      "actions",
    ]);
  });
});
