import { describe, expect, it } from "vitest";
import {
  LEGACY_MOVE_MIN_PCT,
  LEGACY_PRICE_MAX,
  LEGACY_PRICE_MIN,
  LEGACY_VOLUME_RATIO_MIN,
} from "@/lib/screeners/legacy-confirmation";
import { buildDayTradeDeskWithVerifiedFloat, displayedFloatForRadarPanel, enrichDayTradeRowsWithVerifiedFloat } from "../day-trade-float-enrichment";
import {
  DAY_TRADE_FLOAT_MAX_SHARES,
  DAY_TRADE_RVOL_MIN,
  evaluateDayTradeEligibility,
  resolveDayTradeParticipationFact,
} from "../day-trade-strategy";
import type { RadarRankedRow } from "../types";

const NOW = Date.parse("2026-09-24T16:00:00.000Z");
const VERIFIED_HIGH_FLOAT = 24_100_000;
const VERIFIED_LOW_FLOAT = 4_000_000;

function row(
  overrides: Partial<RadarRankedRow> & Pick<RadarRankedRow, "symbol" | "rank">,
): RadarRankedRow {
  return {
    tab_id: "day_trade_radar",
    company_name: overrides.symbol,
    price: 3.35,
    change_percent: 71.8,
    volume: 5_000_000,
    avg_volume: null,
    rvol: null,
    avg_volume_20d: 1_000_000,
    rvol_20d: 5,
    float_shares: null,
    gap_percent: null,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: 500_000,
    volume_ratio_prior_session: 10,
    day_high: 3.5,
    day_low: 2,
    provider_as_of: "2026-09-24T15:59:00.000Z",
    sync_run_id: "11111111-1111-4111-8111-111111111111",
    updated_at: "2026-09-24T15:59:00.000Z",
    signal: "VOLUME LEADER",
    hod_distance_percent: 2,
    promoted_at: "2026-09-24T16:00:00.000Z",
    ...overrides,
  };
}

describe("Day Trade verified float enrichment", () => {
  it("keeps price, move, float, and participation thresholds unchanged", () => {
    expect(DAY_TRADE_FLOAT_MAX_SHARES).toBe(10_000_000);
    expect(DAY_TRADE_RVOL_MIN).toBe(LEGACY_VOLUME_RATIO_MIN);
    expect(LEGACY_VOLUME_RATIO_MIN).toBe(5);
    expect(LEGACY_PRICE_MIN).toBe(2);
    expect(LEGACY_PRICE_MAX).toBe(20);
    expect(LEGACY_MOVE_MIN_PCT).toBe(10);
  });

  it("fails the float gate and excludes a null-float row once verified float is 24.1M", () => {
    const source = row({ symbol: "HIGHF", rank: 1, float_shares: null });
    const [enriched] = enrichDayTradeRowsWithVerifiedFloat([source], () => VERIFIED_HIGH_FLOAT);

    expect(enriched.float_shares).toBe(VERIFIED_HIGH_FLOAT);
    const gate = evaluateDayTradeEligibility(enriched);
    expect(gate.floatGate).toBe("fail_high_float");
    expect(gate.eligible).toBe(false);

    const board = buildDayTradeDeskWithVerifiedFloat([source], NOW, () => VERIFIED_HIGH_FLOAT);
    expect(board.topOpportunities.map((item) => item.symbol)).not.toContain("HIGHF");
    expect(displayedFloatForRadarPanel("day_trade", enriched, 1)).toBe(VERIFIED_HIGH_FLOAT);
  });

  it("passes the float gate when the verified float is 4M", () => {
    const source = row({ symbol: "LOWF", rank: 1, float_shares: null });
    const [enriched] = enrichDayTradeRowsWithVerifiedFloat([source], () => VERIFIED_LOW_FLOAT);

    expect(enriched.float_shares).toBe(VERIFIED_LOW_FLOAT);
    const gate = evaluateDayTradeEligibility(enriched);
    expect(gate.floatGate).toBe("pass");
    expect(gate.eligible).toBe(true);

    const board = buildDayTradeDeskWithVerifiedFloat([source], NOW, () => VERIFIED_LOW_FLOAT);
    expect(board.topOpportunities.map((item) => item.symbol)).toContain("LOWF");
    expect(board.topOpportunities[0]?.float_shares).toBe(VERIFIED_LOW_FLOAT);
    expect(displayedFloatForRadarPanel("day_trade", board.topOpportunities[0], null)).toBe(
      VERIFIED_LOW_FLOAT,
    );
  });

  it("preserves unknown float when verified float is unavailable", () => {
    const source = row({ symbol: "UNKF", rank: 1, float_shares: null });
    const [enriched] = enrichDayTradeRowsWithVerifiedFloat([source], () => null);

    expect(enriched).toBe(source);
    expect(enriched.float_shares).toBeNull();
    const gate = evaluateDayTradeEligibility(enriched);
    expect(gate.floatGate).toBe("unknown");
    expect(gate.eligible).toBe(true);

    const board = buildDayTradeDeskWithVerifiedFloat([source], NOW, () => undefined);
    expect(board.topOpportunities.map((item) => item.symbol)).toContain("UNKF");
    expect(board.topOpportunities[0]?.float_shares).toBeNull();
    expect(displayedFloatForRadarPanel("day_trade", board.topOpportunities[0], VERIFIED_HIGH_FLOAT)).toBe(
      null,
    );
  });
});

describe("Day Trade participation fact", () => {
  it("passes participation via rvol_5m when cumulative classic and Vol/Yday are weak", () => {
    const fact = resolveDayTradeParticipationFact(
      row({
        symbol: "VOLY",
        rank: 1,
        avg_volume_20d: null,
        rvol_20d: null,
        volume_ratio_prior_session: 3.6,
        rvol_5m: 12,
        time_adjusted_rvol: 9,
      }),
    );
    expect(fact.source).toBe("rvol_5m");
    expect(fact.value).toBe(12);
    expect(fact.pass).toBe(true);
  });

  it("uses classic rvol_20d before the displayed vol/yday ratio", () => {
    const fact = resolveDayTradeParticipationFact(
      row({
        symbol: "RVOL",
        rank: 1,
        volume: 6_000_000,
        avg_volume_20d: 1_000_000,
        volume_ratio_prior_session: 3.6,
        rvol_5m: 2,
        time_adjusted_rvol: 2,
      }),
    );
    expect(fact.source).toBe("rvol_20d");
    expect(fact.value).toBe(6);
    expect(fact.pass).toBe(true);
  });
});
