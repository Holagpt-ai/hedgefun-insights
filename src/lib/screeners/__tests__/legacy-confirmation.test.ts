import { describe, expect, it } from "vitest";
import type { ScreenerResultRow } from "@/lib/screeners/contract";
import { rankRadarRows } from "@/features/day-trade-radar-v2/radar-metrics";
import {
  evaluateLegacyConfirmation,
  overlayLegacyConfirmation,
} from "@/lib/screeners/legacy-confirmation";

const GEN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const SYNCED = "2026-09-04T17:12:30.000Z";

function sentinel(symbol: string, volume: number): ScreenerResultRow {
  return {
    tab_id: "day_trade_radar",
    symbol,
    company_name: null,
    price: 8,
    change_percent: null,
    volume,
    avg_volume: null,
    rvol: null,
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
    provider_as_of: SYNCED,
    sync_run_id: GEN,
    updated_at: SYNCED,
  };
}

function legacy(
  symbol: string,
  overrides: Partial<ScreenerResultRow> = {},
): ScreenerResultRow {
  return {
    ...sentinel(symbol, 50_000),
    price: 10,
    change_percent: 12,
    volume_ratio_prior_session: 6,
    prior_session_volume: 10_000,
    rvol: 4.2,
    ...overrides,
  };
}

describe("legacy confirmation overlay (D13)", () => {
  it("4. matching Sentinel symbol + valid legacy criteria → confirmed", () => {
    const overlay = evaluateLegacyConfirmation(legacy("AAA"));
    expect(overlay.legacy_confirmed).toBe(true);
    expect(overlay.legacy_price_gate).toBe(true);
    expect(overlay.legacy_move_gate).toBe(true);
    expect(overlay.legacy_volume_gate).toBe(true);
  });

  it("5. missing legacy field → no false confirmation", () => {
    expect(evaluateLegacyConfirmation(legacy("AAA", { change_percent: null })).legacy_confirmed).toBe(
      false,
    );
    expect(evaluateLegacyConfirmation(legacy("AAA", { change_percent: null })).legacy_move_gate).toBeNull();
    expect(evaluateLegacyConfirmation(legacy("AAA", { price: null })).legacy_price_gate).toBeNull();
    expect(
      evaluateLegacyConfirmation(legacy("AAA", { volume_ratio_prior_session: null })).legacy_volume_gate,
    ).toBeNull();
    expect(evaluateLegacyConfirmation(undefined).legacy_confirmed).toBe(false);
  });

  it("does not fabricate RVOL / prior-close / gap onto Sentinel honesty columns", () => {
    const [row] = overlayLegacyConfirmation([sentinel("AAA", 9_000_000)], [legacy("AAA")]);
    expect(row.rvol).toBeNull();
    expect(row.change_percent).toBeNull();
    expect(row.gap_percent).toBeNull();
    expect(row.prior_session_volume).toBeNull();
    expect(row.legacy_confirmed).toBe(true);
  });

  it("3 & 19. overlay never reorders Sentinel volume-first ranks", () => {
    const sentinelRows = [sentinel("A", 9_000_000), sentinel("B", 1_000_000)];
    const overlaid = overlayLegacyConfirmation(sentinelRows, [
      legacy("B"),
      legacy("A", { change_percent: 1, volume_ratio_prior_session: 1.1 }),
    ]);
    expect(overlaid.map((r) => r.symbol)).toEqual(["A", "B"]);
    expect(overlaid[0].legacy_confirmed).toBe(false);
    expect(overlaid[1].legacy_confirmed).toBe(true);

    const ranked = rankRadarRows(overlaid, "available");
    expect(ranked[0].symbol).toBe("A");
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].symbol).toBe("B");
    expect(ranked[1].rank).toBe(2);
    expect(ranked[1].legacy_confirmed).toBe(true);
  });

  it("does not insert legacy-only symbols into the Sentinel board", () => {
    const overlaid = overlayLegacyConfirmation([sentinel("A", 9_000_000)], [legacy("ZZZ")]);
    expect(overlaid.map((r) => r.symbol)).toEqual(["A"]);
    expect(overlaid[0].legacy_confirmed).toBe(false);
  });

  it("price / move / volume gates fail independently without guessing", () => {
    expect(evaluateLegacyConfirmation(legacy("AAA", { price: 1.5 })).legacy_price_gate).toBe(false);
    expect(evaluateLegacyConfirmation(legacy("AAA", { price: 21 })).legacy_confirmed).toBe(false);
    expect(evaluateLegacyConfirmation(legacy("AAA", { change_percent: 9.9 })).legacy_move_gate).toBe(
      false,
    );
    expect(
      evaluateLegacyConfirmation(legacy("AAA", { volume_ratio_prior_session: 4.9 })).legacy_volume_gate,
    ).toBe(false);
  });
});
