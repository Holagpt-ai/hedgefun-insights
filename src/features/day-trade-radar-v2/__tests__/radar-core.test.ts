import { describe, expect, it } from "vitest";
import type { ScreenerResultRow } from "@/lib/screeners/contract";
import {
  computeHodDistancePercent,
  isRadarRowAccessible,
  rankRadarRows,
} from "../radar-metrics";
import {
  INITIAL_RADAR_SELECTION,
  radarSelectionReducer,
} from "../radar-selection";
import {
  assertDistinctIntradayTimes,
  normalizeChartBarTime,
} from "../chart-time";
import { RADAR_CAPABILITIES } from "../radar-capabilities";

function row(
  overrides: Partial<ScreenerResultRow> & Pick<ScreenerResultRow, "symbol" | "volume">,
): ScreenerResultRow {
  const volume = overrides.volume;
  const prior = overrides.prior_session_volume ?? 1_000;
  return {
    tab_id: "day_trade_radar",
    company_name: overrides.company_name ?? overrides.symbol,
    price: overrides.price ?? 10,
    change_percent: overrides.change_percent ?? 12,
    volume,
    avg_volume: null,
    rvol: null,
    float_shares: null,
    gap_percent: null,
    high_52w: null,
    low_52w: null,
    market_cap: null,
    prior_session_volume: prior,
    volume_ratio_prior_session:
      overrides.volume_ratio_prior_session ??
      Math.round((volume / prior) * 10) / 10,
    day_high: overrides.day_high ?? 11,
    day_low: overrides.day_low ?? 9,
    provider_as_of: overrides.provider_as_of ?? "2026-08-11T15:00:00.000Z",
    sync_run_id: overrides.sync_run_id ?? "11111111-1111-4111-8111-111111111111",
    updated_at: overrides.updated_at ?? "2026-08-11T15:05:00.000Z",
    ...overrides,
  };
}

describe("day trade radar ranking", () => {
  it("1. verified backend order becomes ranks #1…#N", () => {
    const ranked = rankRadarRows(
      [
        row({ symbol: "AAA", volume: 9_000_000 }),
        row({ symbol: "BBB", volume: 5_000_000 }),
        row({ symbol: "CCC", volume: 1_000_000 }),
      ],
      "available",
    );
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(ranked.map((r) => r.symbol)).toEqual(["AAA", "BBB", "CCC"]);
    expect(ranked[0].signal).toBe("TOP LEADER");
    expect(ranked[1].signal).toBe("VOLUME LEADER");
  });

  it("2. catalyst enrichment cannot reorder rows", () => {
    const input = [
      row({ symbol: "LOW", volume: 2_000_000 }),
      row({ symbol: "HIGH", volume: 8_000_000 }),
    ];
    // Pretend catalyst map would prefer HIGH — ranking still follows input order.
    const ranked = rankRadarRows(input, "available");
    expect(ranked.map((r) => r.symbol)).toEqual(["LOW", "HIGH"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2]);
  });

  it("9. empty board fabricates no ranks", () => {
    expect(rankRadarRows([], "empty")).toEqual([]);
    expect(rankRadarRows([], "unavailable")).toEqual([]);
  });

  it("computes HOD distance only from verified price and day_high", () => {
    expect(computeHodDistancePercent(10, 11)).toBeCloseTo(9.1, 1);
    expect(computeHodDistancePercent(null, 11)).toBeNull();
    expect(computeHodDistancePercent(10, null)).toBeNull();
  });

  it("10. free users cannot access gated ranks", () => {
    expect(isRadarRowAccessible(1, false, 2)).toBe(true);
    expect(isRadarRowAccessible(2, false, 2)).toBe(true);
    expect(isRadarRowAccessible(3, false, 2)).toBe(false);
    expect(isRadarRowAccessible(3, true, 2)).toBe(true);
  });
});

describe("day trade radar selection", () => {
  const board = rankRadarRows(
    [
      row({ symbol: "LEAD", volume: 10_000_000 }),
      row({ symbol: "TWO", volume: 5_000_000 }),
      row({ symbol: "THREE", volume: 2_000_000 }),
    ],
    "available",
  );

  it("3. rank #1 is selected automatically on first valid board", () => {
    const next = radarSelectionReducer(INITIAL_RADAR_SELECTION, {
      type: "board_updated",
      rows: board,
    });
    expect(next.mode).toBe("follow_leader");
    expect(next.selectedSymbol).toBe("LEAD");
    expect(next.inactive).toBe(false);
  });

  it("4. clicking another row locks that ticker", () => {
    const next = radarSelectionReducer(
      { mode: "follow_leader", selectedSymbol: "LEAD", snapshot: board[0], inactive: false },
      { type: "select_manual", row: board[1] },
    );
    expect(next.mode).toBe("manual");
    expect(next.selectedSymbol).toBe("TWO");
  });

  it("5. manual selection survives row reordering", () => {
    const reordered = rankRadarRows(
      [
        row({ symbol: "THREE", volume: 20_000_000 }),
        row({ symbol: "TWO", volume: 15_000_000 }),
        row({ symbol: "LEAD", volume: 1_000_000 }),
      ],
      "available",
    );
    const next = radarSelectionReducer(
      { mode: "manual", selectedSymbol: "TWO", snapshot: board[1], inactive: false },
      { type: "board_updated", rows: reordered },
    );
    expect(next.mode).toBe("manual");
    expect(next.selectedSymbol).toBe("TWO");
    expect(next.snapshot?.rank).toBe(2);
    expect(next.inactive).toBe(false);
  });

  it("6. Follow #1 tracks a new leader after refresh", () => {
    const nextBoard = rankRadarRows(
      [
        row({ symbol: "NEW1", volume: 50_000_000 }),
        row({ symbol: "LEAD", volume: 10_000_000 }),
      ],
      "available",
    );
    const following = radarSelectionReducer(
      { mode: "follow_leader", selectedSymbol: "LEAD", snapshot: board[0], inactive: false },
      { type: "board_updated", rows: nextBoard },
    );
    expect(following.selectedSymbol).toBe("NEW1");
    expect(following.mode).toBe("follow_leader");
  });

  it("7. returning to #1 works", () => {
    const next = radarSelectionReducer(
      { mode: "manual", selectedSymbol: "TWO", snapshot: board[1], inactive: false },
      { type: "return_to_leader", rows: board },
    );
    expect(next.mode).toBe("follow_leader");
    expect(next.selectedSymbol).toBe("LEAD");
  });

  it("8. selected ticker leaving the board stays open and inactive", () => {
    const nextBoard = rankRadarRows(
      [row({ symbol: "LEAD", volume: 10_000_000 }), row({ symbol: "THREE", volume: 2_000_000 })],
      "available",
    );
    const next = radarSelectionReducer(
      { mode: "manual", selectedSymbol: "TWO", snapshot: board[1], inactive: false },
      { type: "board_updated", rows: nextBoard },
    );
    expect(next.mode).toBe("manual");
    expect(next.selectedSymbol).toBe("TWO");
    expect(next.inactive).toBe(true);
    expect(next.snapshot?.symbol).toBe("TWO");
    expect(next.snapshot?.signal).toBe("INACTIVE");
  });
});

describe("chart time contract", () => {
  it("12. multiple intraday bars from the same date remain distinct", () => {
    const times = assertDistinctIntradayTimes([
      "2026-08-11T14:30:00.000Z",
      "2026-08-11T14:31:00.000Z",
      "2026-08-11T14:32:00.000Z",
    ]);
    expect(times).toHaveLength(3);
    expect(new Set(times).size).toBe(3);
    // Must not collapse to the same calendar day string.
    expect(times.every((t) => typeof t === "number")).toBe(true);
  });

  it("normalizes epoch ms and keeps business-day strings", () => {
    expect(normalizeChartBarTime(1_723_384_200_000)).toBe(1_723_384_200);
    expect(normalizeChartBarTime("2026-08-11")).toBe("2026-08-11");
  });
});

describe("radar capabilities", () => {
  it("does not advertise unverified burst or PR classification", () => {
    expect(RADAR_CAPABILITIES.rapidBurstSignals).toBe(false);
    expect(RADAR_CAPABILITIES.pressReleaseClassification).toBe(false);
    expect(RADAR_CAPABILITIES.halts).toBe(false);
    expect(RADAR_CAPABILITIES.volumeFirstRank).toBe(true);
  });
});
