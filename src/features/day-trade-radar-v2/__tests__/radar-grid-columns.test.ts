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
  it("keeps default columns with a sticky-right Actions contract", () => {
    expect(RADAR_GRID_COLUMN_COUNT).toBe(19);
    expect([...RADAR_GRID_COLUMNS][0]).toBe("Triggered");
    expect([...RADAR_GRID_COLUMNS]).toContain("History");
    expect([...RADAR_GRID_COLUMNS]).not.toContain("Trade Quality");
    expect([...DEFAULT_RADAR_COLUMN_IDS][0]).toBe("trigger_time");
    expect([...DEFAULT_RADAR_COLUMN_IDS]).toEqual([
      "trigger_time",
      "rank",
      "symbol",
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
      "catalyst",
      "history",
      "actions",
    ]);
    expect(defaultRadarColumns()).toEqual([...DEFAULT_RADAR_COLUMN_IDS]);
    expect(RADAR_ACTIONS_MIN_WIDTH_PX).toBe(160);
    expect(RADAR_ACTIONS_STICKY_HEADER_CLASS).toMatch(/sticky right-0/);
    expect(RADAR_ACTIONS_STICKY_CELL_CLASS).toMatch(/sticky right-0/);
  });

  it("keeps optional truthful metrics off by default", () => {
    expect([...OPTIONAL_RADAR_COLUMN_IDS]).toEqual(
      expect.arrayContaining(["signal", "range_hod", "daily_rvol", "trade_quality"]),
    );
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
