import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isUsableForDisplay, isUsableForFiltering, isUsableForScoring } from "@/lib/screeners/data-quality";
import { compareCandidatesVolumeFirst, type RadarV2CandidateRow } from "@/lib/screeners/radar-v2-adapter";
import {
  evaluateScreenerShortFloat,
  formatScreenerShortFloatFromRow,
  toScreenerShortFloatValue,
  type ScreenerShortFloatSource,
} from "@/lib/screeners/screener-short-float";

const EVALUATED_AT = "2026-09-21T14:30:00.000Z";
const DAY_MS = 24 * 60 * 60 * 1000;

function daysBefore(days: number): string {
  return new Date(Date.parse(EVALUATED_AT) - days * DAY_MS).toISOString();
}

function row(overrides: ScreenerShortFloatSource = {}): ScreenerShortFloatSource {
  return { symbol: "AAA", ...overrides };
}

function candidate(symbol: string, sessionVolume: number): RadarV2CandidateRow {
  return {
    symbol,
    generation_id: "11111111-1111-4111-8111-111111111111",
    trading_date: "2026-09-21",
    session_kind: "regular",
    lifecycle: "active",
    signal_status: "active",
    last_price: 10,
    move_15s_pct: null,
    move_60s_pct: null,
    volume_5s: null,
    volume_15s: null,
    volume_60s: null,
    session_volume: sessionVolume,
    dollar_volume_60s: null,
    acceleration_5m: null,
    rvol_5m: null,
    volume_velocity: null,
    volume_acceleration_pct: null,
    session_high: null,
    session_low: null,
    distance_from_hod_pct: null,
    session_vwap: null,
    vwap_side: null,
    freshness_class: null,
    provider_as_of: EVALUATED_AT,
    updated_at: EVALUATED_AT,
  };
}

describe("Screener Short Float adapter", () => {
  it("leaves a production row unavailable and displays —", () => {
    const value = toScreenerShortFloatValue(row({ float_shares: null }));
    expect(value.qualityState).toBe("UNAVAILABLE");
    expect(value.metric).toBe("shortFloatPct");
    expect(value.freshnessState).toBe("UNKNOWN");
    expect(value.value).toBeNull();
    expect(value.provenance).toBe("UNKNOWN");
    expect(isUsableForDisplay(value)).toBe(false);
    expect(isUsableForScoring(value)).toBe(false);
    expect(isUsableForFiltering(value)).toBe(false);
    expect(formatScreenerShortFloatFromRow(row())).toBe("—");
  });

  it("does not treat public float_shares as short float", () => {
    const value = toScreenerShortFloatValue(
      row({
        float_shares: 25_000_000,
        short_interest_shares: 4_600_000,
      }),
    );
    expect(value.value).toBeNull();
    expect(value.value).not.toBe(18.4);
    expect(formatScreenerShortFloatFromRow(row({ float_shares: 25_000_000 }))).toBe("—");
  });

  it("does not substitute shares outstanding for float", () => {
    const value = toScreenerShortFloatValue(
      row({ short_interest_shares: 5_000_000, shares_outstanding: 50_000_000 }),
    );
    expect(value.qualityState).toBe("PARTIAL");
    expect(value.value).toBeNull();
    expect(formatScreenerShortFloatFromRow(row({ shares_outstanding: 50_000_000 }))).toBe("—");
  });

  it("derives short float as short interest / float × 100", () => {
    const source = row({
      short_interest_shares: 4_600_000,
      short_float_float_shares: 25_000_000,
      short_float_source: "existing-observation",
      short_float_source_as_of: daysBefore(2),
      short_float_fetched_at: EVALUATED_AT,
    });
    const value = toScreenerShortFloatValue(source, { evaluatedAt: EVALUATED_AT });
    expect(value.qualityState).toBe("DERIVED");
    expect(value.provenance).toBe("DERIVED");
    expect(value.value).toBe(18.4);
    expect(value.lineage?.inputs).toEqual(["shortInterestShares", "floatShares"]);
    expect(value.source).toBe("existing-observation");
    expect(value.freshnessState).toBe("FRESH");
    expect(formatScreenerShortFloatFromRow(source, { evaluatedAt: EVALUATED_AT })).toBe("18.4%");
  });

  it("keeps a provider percent and preserves zero", () => {
    const value = toScreenerShortFloatValue(row({ short_float_pct: 0 }), { evaluatedAt: EVALUATED_AT });
    expect(value.qualityState).toBe("AUTHORITATIVE");
    expect(value.provenance).toBe("PROVIDER");
    expect(value.value).toBe(0);
    expect(formatScreenerShortFloatFromRow(row({ short_float_pct: 0 }))).toBe("0.0%");
  });

  it("classifies freshness from sourceAsOf calendar age", () => {
    const fresh = toScreenerShortFloatValue(
      row({ short_float_pct: 12, short_float_source_as_of: daysBefore(10) }),
      { evaluatedAt: EVALUATED_AT },
    );
    const aging = toScreenerShortFloatValue(
      row({ short_float_pct: 12, short_float_source_as_of: daysBefore(11) }),
      { evaluatedAt: EVALUATED_AT },
    );
    const stale = toScreenerShortFloatValue(
      row({ short_float_pct: 12, short_float_source_as_of: daysBefore(21) }),
      { evaluatedAt: EVALUATED_AT },
    );
    const unknown = toScreenerShortFloatValue(row({ short_float_pct: 12 }), { evaluatedAt: EVALUATED_AT });

    expect(fresh.freshnessState).toBe("FRESH");
    expect(aging.freshnessState).toBe("AGING");
    expect(stale.freshnessState).toBe("STALE");
    expect(unknown.freshnessState).toBe("UNKNOWN");

    expect(isUsableForScoring(fresh)).toBe(true);
    expect(isUsableForScoring(aging)).toBe(true);
    expect(isUsableForScoring(stale)).toBe(false);
    expect(isUsableForFiltering(stale)).toBe(false);
    expect(isUsableForDisplay(stale)).toBe(true);
    expect(isUsableForScoring(unknown)).toBe(false);
    expect(formatScreenerShortFloatFromRow(
      row({ short_float_pct: 12, short_float_source_as_of: daysBefore(21) }),
      { evaluatedAt: EVALUATED_AT },
    )).toBe("12.0%");
  });

  it("rejects discrepancy and invalid numbers", () => {
    const discrepancy = toScreenerShortFloatValue(
      row({
        short_float_pct: 18.4,
        short_interest_shares: 10_000_000,
        short_float_float_shares: 25_000_000,
      }),
      { evaluatedAt: EVALUATED_AT },
    );
    expect(discrepancy.qualityState).toBe("DISCREPANCY");
    expect(discrepancy.value).toBeNull();
    expect(isUsableForScoring(discrepancy)).toBe(false);
    expect(isUsableForFiltering(discrepancy)).toBe(false);
    expect(formatScreenerShortFloatFromRow(row({ short_float_pct: Number.NaN }))).toBe("—");
    expect(toScreenerShortFloatValue(row({ short_float_pct: Number.NaN })).qualityState).toBe("INVALID");
  });

  it("does not change Discovery volume-first order", () => {
    const low = candidate("LOW", 1_000_000);
    const high = candidate("HIGH", 9_000_000);
    expect(compareCandidatesVolumeFirst(low, high)).toBeGreaterThan(0);
    evaluateScreenerShortFloat(row({ short_float_pct: 80 }));
    expect(compareCandidatesVolumeFirst(low, high)).toBeGreaterThan(0);
    expect(compareCandidatesVolumeFirst(high, low)).toBeLessThan(0);
  });

  it("is not imported by Trade Quality, filters, or Discovery ranking", () => {
    const root = process.cwd();
    const tradeQuality = readFileSync(resolve(root, "src/lib/screeners/screener-trade-quality.ts"), "utf8");
    const filters = readFileSync(resolve(root, "src/lib/screeners/screener-filters.ts"), "utf8");
    const ranking = readFileSync(resolve(root, "src/lib/screeners/radar-v2-adapter.ts"), "utf8");
    expect(tradeQuality).not.toMatch(/short-float|shortFloat|short_float/);
    expect(filters).not.toMatch(/short-float|shortFloat|short_float/);
    expect(ranking).not.toMatch(/short-float|shortFloat|short_float/);
  });
});
