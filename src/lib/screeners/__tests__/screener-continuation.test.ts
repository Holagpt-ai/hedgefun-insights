import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compareCandidatesVolumeFirst, type RadarV2CandidateRow } from "@/lib/screeners/radar-v2-adapter";
import {
  evaluateScreenerContinuation,
  formatScreenerContinuationFromRow,
  type ScreenerContinuationSource,
} from "@/lib/screeners/screener-continuation";

const FRESH = { freshnessState: "FRESH" as const };

function row(overrides: Partial<ScreenerContinuationSource> = {}): ScreenerContinuationSource {
  return {
    symbol: "AAA",
    price: 10,
    volume: 6_000_000,
    rvol_20d: 12,
    provider_as_of: "2026-09-21T19:30:00.000Z",
    updated_at: "2026-09-21T19:30:00.000Z",
    radar_trading_date: "2026-09-21",
    late_session_volume_velocity: "STRONG",
    close_distance_from_hod_pct: 0.4,
    ...overrides,
  };
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
    provider_as_of: "2026-09-21T19:30:00.000Z",
    updated_at: "2026-09-21T19:30:00.000Z",
  };
}

describe("Screener Continuation adapter", () => {
  it("1/4/6. qualifies Power Hour, Strong Close, and Day-Two together inside the ET window", () => {
    const view = evaluateScreenerContinuation(row(), FRESH);
    expect(view.result.window.isPowerHour).toBe(true);
    expect(view.result.window.isNearClose).toBe(true);
    expect(view.result.window.isAfterHours).toBe(false);
    expect(view.result.categories).toEqual([
      "POWER_HOUR_MOMENTUM",
      "STRONG_CLOSE_NEAR_HOD",
      "DAY_TWO_WATCH",
    ]);
    expect(view.display).toBe("Power Hour · Strong Close · Day-Two");
  });

  it("2. qualifies After Hours only from explicit after-hours evidence", () => {
    const view = evaluateScreenerContinuation(
      row({
        provider_as_of: "2026-09-21T21:00:00.000Z",
        after_hours_extends: "TRUE",
      }),
      FRESH,
    );
    expect(view.result.window.isAfterHours).toBe(true);
    expect(view.result.window.isPowerHour).toBe(false);
    expect(view.result.categories).toContain("AFTER_HOURS_CONTINUATION");
    expect(view.result.categories).toContain("DAY_TWO_WATCH");
    expect(view.result.categories).not.toContain("POWER_HOUR_MOMENTUM");
    expect(view.result.categories).not.toContain("STRONG_CLOSE_NEAR_HOD");
  });

  it("3. treats the same UTC hour differently across DST", () => {
    const summer = evaluateScreenerContinuation(
      row({
        radar_trading_date: "2026-07-15",
        provider_as_of: "2026-07-15T19:00:00.000Z",
      }),
      FRESH,
    );
    const winter = evaluateScreenerContinuation(
      row({
        radar_trading_date: "2026-01-15",
        provider_as_of: "2026-01-15T19:00:00.000Z",
      }),
      FRESH,
    );
    expect(summer.result.window.isPowerHour).toBe(true);
    expect(summer.result.categories).toContain("POWER_HOUR_MOMENTUM");
    expect(winter.result.window.isPowerHour).toBe(false);
    expect(winter.result.categories).not.toContain("POWER_HOUR_MOMENTUM");
    expect(winter.result.window.msOfDay).toBe(14 * 60 * 60 * 1000);
  });

  it("keeps 16:00 ET in Power Hour and 20:00 ET in After Hours", () => {
    const close = evaluateScreenerContinuation(
      row({
        radar_trading_date: "2026-07-15",
        provider_as_of: "2026-07-15T20:00:00.000Z",
      }),
      FRESH,
    );
    const afterHoursEnd = evaluateScreenerContinuation(
      row({
        radar_trading_date: "2026-07-15",
        provider_as_of: "2026-07-16T00:00:00.000Z",
        after_hours_extends: "TRUE",
      }),
      FRESH,
    );
    expect(close.result.window.isPowerHour).toBe(true);
    expect(close.result.window.isAfterHours).toBe(false);
    expect(afterHoursEnd.result.window.isAfterHours).toBe(true);
    expect(afterHoursEnd.result.window.isPowerHour).toBe(false);
  });

  it("5. withholds Day-Two when the normalized score is below 70 and no high-confidence category exists", () => {
    const view = evaluateScreenerContinuation(
      row({
        provider_as_of: "2026-09-21T16:00:00.000Z",
        volume: 400_000,
        rvol_20d: 1.5,
        late_session_volume_velocity: "WEAK",
        close_distance_from_hod_pct: 8,
      }),
      FRESH,
    );
    expect(view.result.window.isPowerHour).toBe(false);
    expect(view.result.label).toBe("READY");
    expect(view.result.coveragePct).toBe(60);
    expect(view.result.score).toBe(25);
    expect(view.result.categories).toEqual([]);
    expect(view.display).toBe("—");
  });

  it("7/8. normalizes earned weight and stays INCOMPLETE below 60% coverage", () => {
    const scored = evaluateScreenerContinuation(row(), FRESH);
    expect(scored.result.availableWeight).toBe(60);
    expect(scored.result.coveragePct).toBe(60);
    expect(scored.result.score).toBe(100);
    expect(scored.result.label).toBe("READY");

    const thin = evaluateScreenerContinuation(
      row({
        late_session_volume_velocity: undefined,
        close_distance_from_hod_pct: undefined,
        rvol_20d: null,
      }),
      FRESH,
    );
    expect(thin.result.coveragePct).toBe(15);
    expect(thin.result.label).toBe("INCOMPLETE");
    expect(thin.result.score).toBeNull();
    expect(thin.result.categories).toEqual([]);
    expect(thin.display).toBe("—");
  });

  it("9/12. does not treat missing RVOL as zero and preserves a usable zero", () => {
    const missing = evaluateScreenerContinuation(row({ rvol_20d: null }), FRESH);
    expect(missing.result.components.rvol20d.available).toBe(false);
    expect(missing.result.components.rvol20d.score).toBeNull();

    const zero = evaluateScreenerContinuation(row({ rvol_20d: 0 }), FRESH);
    expect(zero.result.components.rvol20d.available).toBe(true);
    expect(zero.result.components.rvol20d.rawValue).toBe(0);
    expect(zero.result.components.rvol20d.score).toBe(0);
  });

  it("10. excludes stale Data Quality inputs from scoring", () => {
    const view = evaluateScreenerContinuation(row(), { freshnessState: "STALE" });
    expect(view.result.components.dollarVolume.available).toBe(false);
    expect(view.result.components.rvol20d.available).toBe(false);
    expect(view.result.dollarVolume).toBeNull();
    expect(view.result.label).toBe("INCOMPLETE");
    expect(view.result.categories).toEqual([]);
  });

  it("11/17. does not fabricate a category from current hod distance, acceleration, or VWAP", () => {
    const view = evaluateScreenerContinuation(
      row({
        late_session_volume_velocity: undefined,
        close_distance_from_hod_pct: undefined,
        hod_distance_percent: 0.2,
        acceleration_5m: 9,
        rvol_5m: null,
        volume_velocity: null,
        volume_acceleration_pct: null,
        vwap_side: "above",
        session_vwap: 9.5,
        day_high: 10,
      }),
      FRESH,
    );
    expect(view.result.components.closeHodStrength.available).toBe(false);
    expect(view.result.components.lateSessionVelocity.available).toBe(false);
    expect(view.result.components.vwapHold.available).toBe(false);
    expect(view.result.categories).toEqual([]);
    expect(formatScreenerContinuationFromRow(row({
      late_session_volume_velocity: undefined,
      close_distance_from_hod_pct: undefined,
      rvol_20d: null,
      radar_trading_date: undefined,
    }))).toBe("—");
  });

  it("13/14. does not change Discovery volume-first order", () => {
    const low = candidate("LOW", 1_000_000);
    const high = candidate("HIGH", 9_000_000);
    expect(compareCandidatesVolumeFirst(low, high)).toBeGreaterThan(0);
    evaluateScreenerContinuation(row({ symbol: "HIGH" }), FRESH);
    expect(compareCandidatesVolumeFirst(high, low)).toBeLessThan(0);
  });

  it("is not imported by Discovery, Trade Quality, filters, Trigger Time, or Short Float", () => {
    const root = process.cwd();
    for (const file of [
      "src/lib/screeners/radar-v2-adapter.ts",
      "src/lib/screeners/screener-trade-quality.ts",
      "src/lib/screeners/screener-filters.ts",
      "src/lib/screeners/screener-trigger-time.ts",
      "src/lib/screeners/screener-short-float.ts",
    ]) {
      const source = readFileSync(resolve(root, file), "utf8");
      expect(source).not.toMatch(/continuation/);
    }
  });
});
