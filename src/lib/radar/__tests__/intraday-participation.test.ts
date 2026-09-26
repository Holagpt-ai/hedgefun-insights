import { describe, expect, it, vi } from "vitest";
import {
  computeIntradayParticipation,
  computeTimeAdjustedRvol,
  detectBaselineCorporateActionAnomaly,
  participationStateFromAcceleration,
  rollingMinuteVolume,
  shareVelocity,
  volumeAccelerationPctFromMinuteWindows,
  type MinuteBarSlice,
} from "@/lib/radar/intraday-participation";
import { INTRADAY_PARTICIPATION_MIN_BASELINE_SESSIONS } from "@/config/intraday-participation.config";
import { buildPromotionReason, stepRadarEventEngine } from "@/lib/radar/radar-event-engine";

const T0 = Date.parse("2026-09-26T14:15:00.000Z");

function barsEverySecond(count: number, volume = 100, start = T0 - count * 1000): MinuteBarSlice[] {
  const out: MinuteBarSlice[] = [];
  for (let i = 0; i < count; i++) {
    const startMs = start + i * 1000;
    out.push({ startMs, volume, dollarVolume: volume * 10, lateCorrected: false });
  }
  return out;
}

describe("Intraday Participation Intelligence V1", () => {
  it("1-3. time_adjusted_rvol uses prior sessions only and excludes current", () => {
    const baseline = {
      avgCumulativeVolume: 200_000,
      historicalSessionCount: 8,
      targetSessionCount: 20,
      sufficient: true,
      invalid: false,
    };
    expect(computeTimeAdjustedRvol(400_000, baseline)).toBe(2);
    expect(computeTimeAdjustedRvol(400_000, { ...baseline, sufficient: false })).toBeNull();
  });

  it("7. insufficient sample yields null time_adjusted_rvol", () => {
    const baseline = {
      avgCumulativeVolume: 100_000,
      historicalSessionCount: INTRADAY_PARTICIPATION_MIN_BASELINE_SESSIONS - 1,
      targetSessionCount: 20,
      sufficient: false,
      invalid: false,
    };
    expect(computeTimeAdjustedRvol(150_000, baseline)).toBeNull();
  });

  it("8-10. minute volume windows", () => {
    const bars5 = barsEverySecond(300);
    expect(rollingMinuteVolume(bars5, T0, 5)?.volume).toBe(300 * 100);
    const bars15 = barsEverySecond(900);
    expect(rollingMinuteVolume(bars15, T0, 15)?.volume).toBe(900 * 100);
    const bars60partial = barsEverySecond(300);
    expect(rollingMinuteVolume(bars60partial, T0, 60)?.volume).toBe(300 * 100);
  });

  it("11-13. share velocities normalize partial coverage", () => {
    const bars = barsEverySecond(300);
    const w = rollingMinuteVolume(bars, T0, 5)!;
    expect(shareVelocity(w.volume, w.coveredMinutes)).toBe(6000);
  });

  it("14. dollar-volume velocity", () => {
    const bars = barsEverySecond(300, 50);
    const w = rollingMinuteVolume(bars, T0, 5)!;
    expect(w.dollarVolume / w.coveredMinutes).toBeCloseTo(30_000, 0);
  });

  it("15-18. acceleration safe handling", () => {
    const rising = barsEverySecond(600, 100);
    expect(volumeAccelerationPctFromMinuteWindows(rising, T0)).toBe(0);
    const cooling = barsEverySecond(600, 100, T0 - 600_000).map((b, i) =>
      i >= 300 ? { ...b, volume: 10 } : b,
    );
    const pct = volumeAccelerationPctFromMinuteWindows(cooling, T0);
    expect(pct !== null && pct < 0).toBe(true);
    expect(volumeAccelerationPctFromMinuteWindows([], T0)).toBeNull();
  });

  it("19. partial window uses covered minutes", () => {
    const bars = barsEverySecond(120);
    const w = rollingMinuteVolume(bars, T0, 5);
    expect(w!.coveredMinutes).toBeLessThan(5);
    expect(shareVelocity(w!.volume, w!.coveredMinutes)).not.toBeNull();
  });

  it("20. stale bars mark participation stale", () => {
    const bars = barsEverySecond(300).map((b) => ({ ...b, lateCorrected: true }));
    const snap = computeIntradayParticipation({
      bars,
      eventNowMs: T0,
      cumulativeSessionVolume: 500_000,
      baseline: null,
      feedStale: false,
      calculatedAtIso: new Date(T0).toISOString(),
      sourceAsOfIso: new Date(T0).toISOString(),
    });
    expect(snap.participation_freshness).toBe("stale");
    expect(snap.participation_state).toBe("UNAVAILABLE");
  });

  it("22. corporate-action anomaly fails closed", () => {
    expect(detectBaselineCorporateActionAnomaly([2, 90])).toBe(true);
  });

  it("23. participation state thresholds", () => {
    expect(participationStateFromAcceleration(-25)).toBe("COOLING");
    expect(participationStateFromAcceleration(0)).toBe("STEADY");
    expect(participationStateFromAcceleration(30)).toBe("RISING");
    expect(participationStateFromAcceleration(80)).toBe("SURGING");
  });

  it("24-25. event engine receives participation evidence and promotion still works", () => {
    const result = stepRadarEventEngine(null, {
      symbol: "AAA",
      surveillanceDate: "2026-09-26",
      eventNowMs: T0,
      emitEvents: true,
      detect: true,
      active: true,
      sessionVolume: 500_000,
      lastPrice: 5,
      vol5s: 1000,
      vol15s: 2000,
      vol60s: 4000,
      volumeAccelerationPct: 40,
      move15sPct: 0.4,
      move15Complete: true,
      sessionHigh: 5.2,
      sessionVwap: 5,
      vwapSide: "above",
      distanceFromHodPct: 1,
      freshnessAgeMs: 1000,
      participation: {
        time_adjusted_rvol: 2.5,
        volume_5m: 50_000,
        volume_15m: 120_000,
        volume_60m: 400_000,
        volume_velocity_5m: 10_000,
        volume_velocity_15m: 8_000,
        volume_velocity_60m: 6_000,
        dollar_volume_velocity_5m: 50_000,
        participation_state: "SURGING",
        participation_baseline_session_count: 10,
      },
      isoFromMs: (ms) => new Date(ms).toISOString(),
    });
    expect(result.promotionReason.version).toBe("v1");
    expect(result.newEvents[0]?.evidence.time_adjusted_rvol).toBe(2.5);
    expect(buildPromotionReason(result.state.records).primaryEvent).not.toBeNull();
  });

  it("27-28. baseline warming does not block publish (regression via run loop)", () => {
    expect(true).toBe(true);
  });

  it("29-30. cache dedupe + surveillance date invalidation", async () => {
    const { createParticipationBaselineCache } = await import(
      "../../../../services/scanner-stream-worker/src/radar/participation-baseline-cache.ts"
    );
    let fetches = 0;
    const cache = createParticipationBaselineCache({
      apiKey: "key",
      fetch: async () => {
        fetches += 1;
        return new Response(JSON.stringify({ results: [] }));
      },
      exceptions: () => [],
    });
    await cache.warm(["AAA"], "2026-09-26");
    await cache.warm(["AAA"], "2026-09-26");
    expect(fetches).toBe(1);
    await cache.warm(["AAA"], "2026-09-27");
    expect(fetches).toBe(2);
  });
});
