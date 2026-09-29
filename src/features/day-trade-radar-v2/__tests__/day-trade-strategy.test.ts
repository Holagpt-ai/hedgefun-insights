import { describe, expect, it } from "vitest";
import type { RadarRankedRow } from "../types";
import {
  DAY_TRADE_RADAR_MAX_ROWS,
  compareDayTradeOpportunity,
  dayTradeOpportunityScore,
  evaluateDayTradeEligibility,
  filterDayTradePanelRows,
  qualifiesDayTradeMomentum,
  rankDayTradeOpportunities,
} from "../day-trade-strategy";
import { qualifyPanelRows } from "../multi-radar";

const NOW = Date.parse("2026-09-24T16:00:00.000Z");

function row(
  overrides: Partial<RadarRankedRow> & Pick<RadarRankedRow, "symbol" | "rank">,
): RadarRankedRow {
  return {
    tab_id: "day_trade_radar",
    company_name: overrides.symbol,
    price: 8,
    change_percent: 15,
    volume: 5_000_000,
    avg_volume: null,
    rvol: null,
    avg_volume_20d: 1_000_000,
    rvol_20d: 5,
    float_shares: 4_000_000,
    gap_percent: null,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: 500_000,
    volume_ratio_prior_session: 10,
    day_high: 9,
    day_low: 7,
    provider_as_of: "2026-09-24T15:00:00.000Z",
    sync_run_id: "11111111-1111-4111-8111-111111111111",
    updated_at: "2026-09-24T15:05:00.000Z",
    signal: "VOLUME LEADER",
    hod_distance_percent: 2,
    promoted_at: "2026-09-24T14:00:00.000Z",
    ...overrides,
  };
}

describe("Day Trade strategy eligibility", () => {
  it("allows a $2–$20 strong momentum name", () => {
    expect(qualifiesDayTradeMomentum(row({ symbol: "GOOD", rank: 1, price: 7.25, change_percent: 38 }))).toBe(true);
  });

  it("rejects >$20 under standard strategy", () => {
    expect(qualifiesDayTradeMomentum(row({ symbol: "RICH", rank: 1, price: 350, change_percent: 38 }))).toBe(false);
  });

  it("rejects <$2 under standard strategy", () => {
    expect(qualifiesDayTradeMomentum(row({ symbol: "PENNY", rank: 1, price: 1.5, change_percent: 38 }))).toBe(false);
  });

  it("rejects verified float above 10M", () => {
    expect(
      qualifiesDayTradeMomentum(row({ symbol: "HEAVY", rank: 1, float_shares: 12_000_000 })),
    ).toBe(false);
  });

  it("allows unknown float without fabricating low float", () => {
    const gate = evaluateDayTradeEligibility(row({ symbol: "UNK", rank: 1, float_shares: null }));
    expect(gate.floatGate).toBe("unknown");
    expect(gate.eligible).toBe(true);
  });

  it("scanner event does not rescue a name that fails Day Trade gates", () => {
    expect(
      qualifiesDayTradeMomentum(
        row({
          symbol: "EVENT",
          rank: 1,
          change_percent: 4,
          primary_scanner_event: "VOLUME_EXPLOSION",
          scanner_events: [{ type: "VOLUME_EXPLOSION", triggered_at: "2026-09-24T15:00:00.000Z", active: true }],
        }),
      ),
    ).toBe(false);
  });

  it("rejects negative movers", () => {
    expect(qualifiesDayTradeMomentum(row({ symbol: "DOWN", rank: 1, change_percent: -8 }))).toBe(false);
  });

  it("requires classic RVOL when baseline exists", () => {
    expect(
      qualifiesDayTradeMomentum(
        row({ symbol: "LOWRVOL", rank: 1, volume: 2_000_000, avg_volume_20d: 1_000_000, rvol_20d: 2 }),
      ),
    ).toBe(false);
  });

  it("uses session participation when classic RVOL is unavailable", () => {
    expect(
      qualifiesDayTradeMomentum(
        row({
          symbol: "SESSION",
          rank: 1,
          avg_volume_20d: null,
          rvol_20d: null,
          volume_ratio_prior_session: 6,
        }),
      ),
    ).toBe(true);
  });

  it("does not fabricate classic RVOL from vol/yday alone in eligibility metadata", () => {
    const evalRow = evaluateDayTradeEligibility(
      row({ symbol: "META", rank: 1, avg_volume_20d: null, rvol_20d: null, volume_ratio_prior_session: 8 }),
    );
    expect(evalRow.classicRvol).toBeNull();
    expect(evalRow.eligible).toBe(true);
  });
});

describe("Day Trade Top-10 cap and ranking", () => {
  it("never returns more than 10 Day Trade rows", () => {
    const universe = Array.from({ length: 100 }, (_, index) =>
      row({
        symbol: `T${index}`,
        rank: index + 1,
        vol_velocity: 100_000 - index * 500,
      }),
    );
    const panel = filterDayTradePanelRows(universe, NOW);
    expect(panel.length).toBe(DAY_TRADE_RADAR_MAX_ROWS);
  });

  it("shows fewer than 10 when fewer qualify", () => {
    const panel = filterDayTradePanelRows(
      [
        row({ symbol: "A", rank: 1 }),
        row({ symbol: "B", rank: 2, price: 50 }),
        row({ symbol: "C", rank: 3, change_percent: 5 }),
      ],
      NOW,
    );
    expect(panel.length).toBe(1);
    expect(panel[0]?.symbol).toBe("A");
  });

  it("assigns Day Trade ranks 1..n independent of Radar rank", () => {
    const panel = rankDayTradeOpportunities(
      [
        row({ symbol: "LOWRADAR", rank: 95, vol_velocity: 900_000, change_percent: 40 }),
        row({ symbol: "HIGHRADAR", rank: 3, vol_velocity: 100_000, change_percent: 12 }),
      ],
      NOW,
    );
    expect(panel.map((item) => item.day_trade_rank)).toEqual([1, 2]);
    expect(panel[0]?.symbol).toBe("LOWRADAR");
    expect(panel[0]?.rank).toBe(95);
  });

  it("ranks stronger participation ahead among qualified names", () => {
    const slow = row({ symbol: "SLOW", rank: 1, vol_velocity: 10_000, change_percent: 12 });
    const fast = row({ symbol: "FAST", rank: 2, vol_velocity: 500_000, change_percent: 12 });
    expect(compareDayTradeOpportunity(slow, fast, NOW)).toBeGreaterThan(0);
    expect(dayTradeOpportunityScore(fast, NOW)).toBeGreaterThan(dayTradeOpportunityScore(slow, NOW));
  });

  it("prefers fresh momentum over cooling when otherwise comparable", () => {
    const fresh = row({
      symbol: "FRESH",
      rank: 1,
      freshness_class: "fresh",
      promoted_at: "2026-09-24T15:50:00.000Z",
      vol_velocity: 200_000,
      change_percent: 15,
    });
    const cooling = row({
      symbol: "COOL",
      rank: 2,
      freshness_class: "cooling",
      promoted_at: "2026-09-24T10:00:00.000Z",
      vol_velocity: 200_000,
      change_percent: 15,
    });
    expect(compareDayTradeOpportunity(cooling, fresh, NOW)).toBeGreaterThan(0);
  });

  it("leaves underlying Radar universe unchanged in qualifyPanelRows for other panels", () => {
    const universe = [
      row({ symbol: "BRK", rank: 4, primary_scanner_event: "HOD_BREAK", scanner_events: [{ type: "HOD_BREAK", triggered_at: "2026-09-24T15:00:00.000Z", active: true }] }),
      row({ symbol: "P99", rank: 2, price: 0.99 }),
      row({ symbol: "PENNY", rank: 5, price: 0.4 }),
    ];
    expect(qualifyPanelRows(universe, "breakouts").map((item) => item.symbol)).toEqual(["BRK"]);
    expect(qualifyPanelRows(universe, "penny").map((item) => item.symbol)).toEqual(["P99", "PENNY"]);
    expect(qualifyPanelRows(universe, "day_trade", "under_1", NOW).length).toBeLessThanOrEqual(10);
  });
});

describe("Day Trade strategy test totals", () => {
  it("reports universe vs survival counts for the fixture", () => {
    const universe = Array.from({ length: 100 }, (_, index) =>
      row({
        symbol: `T${index}`,
        rank: index + 1,
        price: index % 5 === 0 ? 25 : 8,
        change_percent: index % 7 === 0 ? 5 : 15,
        float_shares: index % 11 === 0 ? 20_000_000 : 4_000_000,
      }),
    );
    const eligible = universe.filter(qualifiesDayTradeMomentum);
    const panel = filterDayTradePanelRows(universe, NOW);
    expect(universe.length).toBe(100);
    expect(eligible.length).toBeGreaterThan(10);
    expect(panel.length).toBe(10);
  });
});
