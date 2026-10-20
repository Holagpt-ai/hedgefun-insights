import { describe, expect, it } from "vitest";
import { parseRadarEngineEventTypes } from "@/lib/screeners/parse-radar-engine-events";
import {
  encodeRvolCaptureEvidenceLabels,
  parseRvolCaptureFromEvidenceLabels,
} from "@/lib/am-inbox/rvol-capture-evidence";
import { continuationRankingRvolFromContext } from "@/lib/am-inbox/continuation-rvol-ranking";
import { compareAmInboxLateSessionCandidates } from "@/lib/am-inbox/am-inbox-late-session-priority";
import type { AmInboxLateSessionCandidate } from "@/lib/am-inbox/late-session-continuation-types";
import { evaluateContinuation } from "@/lib/screeners/continuation";
import { resolveContinuationRvolConfidenceInput } from "@/lib/screeners/continuation-rvol-confidence";
import type { ContinuationInput } from "@/types/continuation";

describe("Batch 28 — momentum & continuation", () => {
  it("parses radar_engine_events objects with type field", () => {
    const types = parseRadarEngineEventTypes([
      { type: "RE_ACCELERATION", at: "2026-01-01T00:00:00Z" },
      "SECOND_LEG",
    ]);
    expect(types.has("RE_ACCELERATION")).toBe(true);
    expect(types.has("SECOND_LEG")).toBe(true);
  });

  it("round-trips RVOL capture evidence labels for AM Inbox ranking", () => {
    const labels = encodeRvolCaptureEvidenceLabels({
      metricKind: "time_adjusted",
      baselineVolume: 1_000_000,
      baselineSampleSize: 12,
    });
    const parsed = parseRvolCaptureFromEvidenceLabels(labels);
    expect(parsed.metricKind).toBe("time_adjusted");
    expect(parsed.baselineVolume).toBe(1_000_000);
    expect(parsed.baselineSampleSize).toBe(12);
  });

  it("AM Inbox RVOL ranking uses neutral tier without metadata penalty", () => {
    const ranking = continuationRankingRvolFromContext({
      symbol: "AAA",
      sourceSessionDate: "2026-08-12",
      sourceTimestamp: "2026-08-12T20:00:00Z",
      sourceCategory: "POWER_HOUR_MOMENTUM",
      rvol: 3,
      rvolMetricKind: null,
      rvolBaselineVolume: null,
      rvolBaselineSampleSize: null,
      volume: 500_000,
      dollarVolume: null,
      lastPrice: 10,
      sessionMovePct: null,
      closeDistanceFromHodPct: 1,
      afterHoursExtends: null,
      catalystPresent: null,
      floatTurnover: null,
      historicalContextAvailable: false,
      evidenceLabels: [],
      sampleSizeQuality: null,
      comparableEpisodeCount: null,
      mostRecentComparableDate: null,
      profileFreshness: "UNKNOWN",
      validFromSessionDate: "2026-08-13",
      validThroughSessionDate: "2026-08-13",
      expiryState: "active",
      securityId: null,
    });
    expect(ranking).toBeGreaterThan(1.5);
  });

  it("sort tie-break uses derived dollar volume when persisted dollarVolume is null", () => {
    const mk = (symbol: string, price: number, vol: number): AmInboxLateSessionCandidate => ({
      context: {
        symbol,
        sourceSessionDate: "2026-08-12",
        sourceTimestamp: "2026-08-12T20:00:00Z",
        sourceCategory: "POWER_HOUR_MOMENTUM",
        lastPrice: price,
        volume: vol,
        dollarVolume: null,
        rvol: 2,
        rvolMetricKind: null,
        rvolBaselineVolume: null,
        rvolBaselineSampleSize: null,
        sessionMovePct: null,
        closeDistanceFromHodPct: 1,
        afterHoursExtends: null,
        catalystPresent: null,
        floatTurnover: null,
        historicalContextAvailable: false,
        evidenceLabels: [],
        sampleSizeQuality: null,
        comparableEpisodeCount: null,
        mostRecentComparableDate: null,
        profileFreshness: "UNKNOWN",
        validFromSessionDate: "2026-08-13",
        validThroughSessionDate: "2026-08-13",
        expiryState: "active",
        securityId: null,
      },
      sourceCategories: ["POWER_HOUR_MOMENTUM"],
      workflow: null,
    });
    const high = mk("HIGH", 20, 100_000);
    const low = mk("LOW", 5, 100_000);
    expect(compareAmInboxLateSessionCandidates(high, low)).toBeLessThan(0);
  });

  it("20d RVOL with verified avg baseline scores without TARVOL-only dampening gap", () => {
    const input: ContinuationInput = {
      symbol: "XYZ",
      sessionDate: "2026-08-12",
      observedAt: "2026-08-12T19:30:00Z",
      rvol20d: 3,
      rvolBaselineVolume: 1_000_000,
      volumeVelocity: "STRONG",
      distanceFromHodPct: 0.5,
      dollarVolume: 5_000_000,
    };
    const confidence = resolveContinuationRvolConfidenceInput(input);
    expect(confidence?.metricKind).toBe("rvol_20d");
    const result = evaluateContinuation(input);
    expect(result.components.rvol20d.available).toBe(true);
    expect(result.components.rvol20d.score).toBeGreaterThanOrEqual(2);
  });
});
