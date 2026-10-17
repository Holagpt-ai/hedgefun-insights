import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { RadarRankedRow } from "../types";
import {
  BREAKOUT_VOLUME_DOMINANCE_RATIO,
  buildRecordedBreakoutEvents,
  compareBreakoutLeaderVolumeFirst,
} from "../breakout-event-evidence";
import { BreakoutMomentumEvidence } from "../BreakoutMomentumEvidence";
import {
  qualifiesBreakouts,
  selectBreakoutLeader,
  sortPanelRows,
} from "../multi-radar";

const NOW = Date.parse("2026-09-24T16:00:00.000Z");
const RECENT = "2026-09-24T15:50:00.000Z";
const OLD = "2026-09-24T13:00:00.000Z";
const FUTURE = "2026-09-24T17:00:00.000Z";

function row(overrides: Partial<RadarRankedRow> & Pick<RadarRankedRow, "symbol" | "rank">): RadarRankedRow {
  return {
    tab_id: "day_trade_radar",
    company_name: overrides.symbol,
    price: 8,
    change_percent: 12,
    volume: 2_000_000,
    avg_volume: null,
    rvol: null,
    avg_volume_20d: null,
    rvol_20d: null,
    float_shares: null,
    gap_percent: null,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: null,
    volume_ratio_prior_session: null,
    day_high: 9,
    day_low: 7,
    provider_as_of: RECENT,
    sync_run_id: "11111111-1111-4111-8111-111111111111",
    updated_at: RECENT,
    signal: "BUILDING",
    hod_distance_percent: 1.2,
    radar_trading_date: "2026-09-24",
    ...overrides,
  };
}

describe("Batch 15 — volume-first breakout leadership", () => {
  it("prefers high-volume qualified breakout over low-volume HOD", () => {
    const highVol = row({
      symbol: "LIQ",
      rank: 2,
      volume: 5_000_000,
      primary_scanner_event: "GAP_CONTINUATION",
      scanner_events: [{ type: "GAP_CONTINUATION", triggered_at: RECENT, active: true }],
    });
    const lowHod = row({
      symbol: "HOD",
      rank: 1,
      volume: 100,
      primary_scanner_event: "HOD_BREAK",
      scanner_events: [{ type: "HOD_BREAK", triggered_at: RECENT, active: true }],
    });
    expect(compareBreakoutLeaderVolumeFirst(highVol, lowHod, NOW)).toBeLessThan(0);
    expect(selectBreakoutLeader([lowHod, highVol], NOW)?.symbol).toBe("LIQ");
  });

  it("uses event priority within comparable liquidity", () => {
    const a = row({
      symbol: "RUN",
      rank: 1,
      volume: 1_000_000,
      scanner_events: [{ type: "RUNNING_UP", triggered_at: RECENT, active: true }],
    });
    const b = row({
      symbol: "HOD",
      rank: 2,
      volume: 1_100_000,
      scanner_events: [{ type: "HOD_BREAK", triggered_at: RECENT, active: true }],
    });
    expect(BREAKOUT_VOLUME_DOMINANCE_RATIO).toBeGreaterThan(1);
    expect(selectBreakoutLeader([a, b], NOW)?.symbol).toBe("HOD");
  });

  it("treats missing volume as unavailable in leader ordering", () => {
    const missing = row({
      symbol: "NA",
      rank: 1,
      volume: null,
      scanner_events: [{ type: "HOD_BREAK", triggered_at: RECENT, active: true }],
    });
    const withVol = row({
      symbol: "OK",
      rank: 2,
      volume: 500_000,
      scanner_events: [{ type: "RUNNING_UP", triggered_at: RECENT, active: true }],
    });
    expect(selectBreakoutLeader([missing, withVol], NOW)?.symbol).toBe("OK");
  });
});

describe("Batch 15 — event sequence and freshness", () => {
  it("orders distinct events and dedupes identical canonical identity", () => {
    const events = buildRecordedBreakoutEvents(
      row({
        symbol: "STACK",
        rank: 1,
        scanner_events: [
          { type: "RUNNING_UP", triggered_at: OLD, active: true },
          { type: "HOD_BREAK", triggered_at: RECENT, active: true },
          { type: "HOD_BREAK", triggered_at: RECENT, active: true },
        ],
      }),
      NOW,
    );
    expect(events.map((event) => event.type)).toEqual(["RUNNING_UP", "HOD_BREAK"]);
    expect(events[0]?.freshness).toBe("historical");
    expect(events[1]?.freshness).toBe("recent");
  });

  it("rejects future timestamps and keeps inactive recorded events qualified", () => {
    const recorded = buildRecordedBreakoutEvents(
      row({
        symbol: "OFF",
        rank: 1,
        scanner_events: [
          { type: "RUNNING_UP", triggered_at: FUTURE, active: true },
          { type: "VWAP_RECLAIM", triggered_at: OLD, active: false },
        ],
      }),
      NOW,
    );
    expect(recorded.map((event) => event.type)).toEqual(["VWAP_RECLAIM"]);
    expect(qualifiesBreakouts(row({
      symbol: "OFF",
      rank: 1,
      scanner_events: [{ type: "RUNNING_UP", triggered_at: OLD, active: false }],
    }), NOW)).toBe(true);
  });

  it("renders desktop/mobile momentum evidence with ET timestamps", () => {
    render(
      <BreakoutMomentumEvidence
        nowMs={NOW}
        row={row({
          symbol: "DUAL",
          rank: 1,
          scanner_events: [
            { type: "RUNNING_UP", triggered_at: OLD, active: true },
            { type: "HOD_BREAK", triggered_at: RECENT, active: true },
          ],
        })}
      />,
    );
    expect(screen.getByTestId("breakout-momentum-evidence")).toBeInTheDocument();
    expect(screen.getByText(/RUNNING UP/i)).toBeInTheDocument();
    expect(screen.getByText(/HOD BREAK/i)).toBeInTheDocument();
    expect(screen.getByText(/Historical/)).toBeInTheDocument();
    expect(screen.getByText(/11:50 AM ET/)).toBeInTheDocument();
  });

  it("keeps rank sort default while leader uses volume-first policy", () => {
    const rows = [
      row({
        symbol: "LOW",
        rank: 1,
        volume: 100,
        scanner_events: [{ type: "HOD_BREAK", triggered_at: RECENT, active: true }],
      }),
      row({
        symbol: "HIGH",
        rank: 2,
        volume: 4_000_000,
        scanner_events: [{ type: "GAP_CONTINUATION", triggered_at: RECENT, active: true }],
      }),
    ];
    expect(sortPanelRows(rows, "breakouts", "rank").map((item) => item.symbol)).toEqual(["LOW", "HIGH"]);
    expect(selectBreakoutLeader(rows, NOW)?.symbol).toBe("HIGH");
  });
});
