import { describe, expect, it } from "vitest";
import { attachIntradayReconstructionToComparables } from "@/lib/intraday-reconstruction/attach-intraday-to-comparables";
import { episodeIntradayEventId } from "@/lib/intraday-reconstruction/deterministic-ids";
import { classifyIntradaySegment } from "@/lib/intraday-reconstruction/normalize-minute-bars";
import { reconstructEpisodeIntraday } from "@/lib/intraday-reconstruction/reconstruct-episode-intraday";
import { computeRegularSessionVwapSeries } from "@/lib/intraday-reconstruction/vwap";
import type { NormalizedIntradayBar } from "@/lib/intraday-reconstruction/intraday-reconstruction-types";
import { buildHistoricalMemoryFromRepeatMoverContext } from "@/lib/ai-analyst/historical-memory";
import { assertHistoricalMemoryIsEvidenceOnly } from "@/lib/ai-analyst/historical-memory";
import type { RepeatMoverComparableEpisode } from "@/types/repeat-mover";
import type { SecurityId } from "@/types/security-identity";

const SECURITY_ID = "11111111-1111-4111-8111-111111111111" as SecurityId;
const EPISODE_ID = "22222222-2222-4222-8222-222222222222";

function etMs(isoDate: string, hour: number, minute: number): number {
  const guess = new Date(`${isoDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-04:00`);
  return guess.getTime();
}

function regBar(isoDate: string, minuteOffset: number, o: number, h: number, l: number, c: number, v: number): NormalizedIntradayBar {
  const tsMs = etMs(isoDate, 9, 30) + minuteOffset * 60_000;
  return { tsMs, open: o, high: h, low: l, close: c, volume: v, segment: classifyIntradaySegment(tsMs) };
}

describe("intraday reconstruction v1", () => {
  it("computes HOD/LOD timestamps on a synthetic full regular session", () => {
    const sessionDate = "2024-06-03";
    const bars: NormalizedIntradayBar[] = [];
    for (let i = 0; i < 390; i++) {
      const price = 10 + (i < 60 ? i * 0.05 : i < 120 ? 13 - (i - 60) * 0.02 : 11);
      bars.push(regBar(sessionDate, i, price, price + 0.1, price - 0.1, price, 1000 + i));
    }
    const { facts } = reconstructEpisodeIntraday({
      episodeId: EPISODE_ID,
      securityId: SECURITY_ID,
      sessionDate,
      direction: "POSITIVE",
      dailyOpen: 10,
      dailyHigh: 13,
      dailyLow: 10,
      dailyClose: 11,
      dailyVolume: 500_000,
      bars,
      barGranularity: "1m",
      source: "test",
      sourceAsOf: null,
      fetchedAt: "2026-01-01T00:00:00.000Z",
      computedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(facts.completenessState).toBe("COMPLETE");
    expect(facts.hodAt).not.toBeNull();
    expect(facts.lodAt).not.toBeNull();
    expect(facts.closeVsHodPct).not.toBeNull();
    expect(facts.hodSessionPhase).toBe("EARLY");
  });

  it("marks partial coverage when regular bars are sparse", () => {
    const sessionDate = "2024-06-03";
    const bars = [regBar(sessionDate, 0, 10, 10.5, 9.9, 10.2, 5000)];
    const { facts } = reconstructEpisodeIntraday({
      episodeId: EPISODE_ID,
      securityId: SECURITY_ID,
      sessionDate,
      direction: "POSITIVE",
      dailyOpen: null,
      dailyHigh: null,
      dailyLow: null,
      dailyClose: null,
      dailyVolume: null,
      bars,
      barGranularity: "1m",
      source: "test",
      sourceAsOf: null,
      fetchedAt: "2026-01-01T00:00:00.000Z",
      computedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(facts.completenessState).toBe("PARTIAL");
  });

  it("returns UNAVAILABLE without minute bars and without daily fallback fields", () => {
    const { facts } = reconstructEpisodeIntraday({
      episodeId: EPISODE_ID,
      securityId: SECURITY_ID,
      sessionDate: "2024-06-03",
      direction: "POSITIVE",
      dailyOpen: null,
      dailyHigh: null,
      dailyLow: null,
      dailyClose: null,
      dailyVolume: null,
      bars: [],
      barGranularity: "1m",
      source: "test",
      sourceAsOf: null,
      fetchedAt: "2026-01-01T00:00:00.000Z",
      computedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(facts.completenessState).toBe("UNAVAILABLE");
    expect(facts.haltDataAvailable).toBe(false);
    expect(facts.haltCount).toBeNull();
  });

  it("uses deterministic episode event ids for idempotent replay", () => {
    const a = episodeIntradayEventId(EPISODE_ID, "NEW_HOD", "2024-06-03T14:00:00.000Z", 1);
    const b = episodeIntradayEventId(EPISODE_ID, "NEW_HOD", "2024-06-03T14:00:00.000Z", 1);
    expect(a).toBe(b);
  });

  it("computes VWAP series on regular session bars", () => {
    const sessionDate = "2024-06-03";
    const bars = [
      regBar(sessionDate, 0, 10, 10.2, 9.9, 10.1, 1000),
      regBar(sessionDate, 1, 10.1, 10.4, 10, 10.3, 2000),
    ];
    const series = computeRegularSessionVwapSeries(bars);
    expect(series.length).toBe(2);
    expect(series[1]!.vwap).toBeGreaterThan(0);
  });

  it("exposes compact facts on Repeat Movers comparables without changing rank fields", () => {
    const episode: RepeatMoverComparableEpisode = {
      episodeId: EPISODE_ID,
      sessionDate: "2024-06-03",
      tier: "SIGNIFICANT",
      direction: "POSITIVE",
      movePct: 25,
      volume: 1,
      rvol: 2,
      dollarVolume: 3,
      closePosition: 0.5,
      nextSessionMovePct: null,
      nextSessionContinuation: null,
      similarity: { sameDirection: true, sameTier: true, movePctDelta: 1 },
    };
    const attached = attachIntradayReconstructionToComparables([episode], [{
      episode_id: EPISODE_ID,
      hod_at: "2024-06-03T14:00:00.000Z",
      close_vs_hod_pct: -8,
      largest_pullback_pct: 5,
      recovered_from_pullback: true,
      halt_count: null,
      vwap_reclaim_count: 2,
      largest_volume_burst_at: "2024-06-03T10:05:00.000Z",
      completeness_state: "COMPLETE",
    }]);
    expect(attached[0]?.observedIntradayReconstruction?.closeVsHodPct).toBe(-8);
  });

  it("keeps AI historical memory evidence-only with intraday guardrail", () => {
    const memory = buildHistoricalMemoryFromRepeatMoverContext(null, "TEST");
    assertHistoricalMemoryIsEvidenceOnly(memory);
    expect(memory.intradayGuardrail.length).toBeGreaterThan(20);
  });
});
