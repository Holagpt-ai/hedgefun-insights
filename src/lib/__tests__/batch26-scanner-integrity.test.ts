import { describe, expect, it } from "vitest";
import { buildMorningOpportunityBoard } from "@/lib/am-inbox/morning-opportunity-board";
import { evaluateMorningRadarEligibility } from "@/lib/am-inbox/morning-opportunity-eligibility";
import type { MorningRadarRow } from "@/lib/am-inbox/morning-opportunity-types";
import { collectScannerEventTypes } from "@/lib/scanner-intelligence/scanner-event-handoff";
import { buildParticipationTriggerEvidence } from "@/lib/scanner-intelligence/participation-trigger-evidence";
import {
  isHistoricalPrimaryScannerTrigger,
  resolveVolumeTrendForDisplay,
} from "@/features/day-trade-radar-v2/multi-radar";
import { dedupeEpisodesBySessionDate } from "@/lib/historical-intelligence/historical-market-intelligence";
import type { RepeatMoverComparableEpisode } from "@/types/repeat-mover";
import type { RadarRankedRow } from "@/features/day-trade-radar-v2/types";
import { formatScreenerRvol5m } from "@/lib/screeners/screener-metric-display";

function radar(partial: Partial<MorningRadarRow> & Pick<MorningRadarRow, "symbol" | "volume">): MorningRadarRow {
  return {
    price: 4,
    primary_scanner_event: null,
    primary_scanner_event_at: null,
    scanner_events: [],
    rvol_5m: null,
    time_adjusted_rvol: null,
    vol_velocity: null,
    volume_acceleration_pct: null,
    gap_percent: null,
    change_percent: null,
    ...partial,
  };
}

describe("Batch 26 — scanner integrity", () => {
  it("Morning Opportunity accepts active scanner events without stale primary", () => {
    const events = collectScannerEventTypes({
      primary_scanner_event: "RUNNING_UP",
      scanner_events: [
        { type: "RUNNING_UP", active: false },
        { type: "VOLUME_EXPLOSION", active: true },
      ],
    });
    expect(events).toEqual(["VOLUME_EXPLOSION"]);
    const eligibility = evaluateMorningRadarEligibility(
      radar({
        symbol: "ACTIVE",
        volume: 2_000_000,
        scanner_events: [
          { type: "RUNNING_UP", active: false },
          { type: "VOLUME_EXPLOSION", active: true },
        ],
        primary_scanner_event: "RUNNING_UP",
      }),
      true,
    );
    expect(eligibility.accepted).toBe(true);
    expect(eligibility.section).toBe("top_momentum");
  });

  it("Morning Opportunity rejects orphaned primary when explicitly inactive", () => {
    const eligibility = evaluateMorningRadarEligibility(
      radar({
        symbol: "STALE",
        volume: 2_000_000,
        scanner_events: [{ type: "RUNNING_UP", active: false }],
        primary_scanner_event: "RUNNING_UP",
      }),
      true,
    );
    expect(eligibility.accepted).toBe(false);
    expect(eligibility.rejectionCodes).toContain("VOLUME_ONLY_NO_EVENT");
  });

  it("qualifies premarket participation from stored time-adjusted RVOL", () => {
    const eligibility = evaluateMorningRadarEligibility(
      radar({
        symbol: "TARVOL",
        volume: 1_500_000,
        change_percent: 2,
        rvol_5m: null,
        time_adjusted_rvol: 1.4,
      }),
      true,
    );
    expect(eligibility.accepted).toBe(true);
    expect(eligibility.section).toBe("premarket_continuation");
  });

  it("surfaces exclusion hints when volume leaders fail Morning rules", () => {
    const board = buildMorningOpportunityBoard({
      radarRows: [radar({ symbol: "VOL", volume: 2_000_000, change_percent: 0.2 })],
      polygonPremarketActive: true,
      radarStatus: "available",
      radarSession: "pre-market",
    });
    expect(board.sections).toHaveLength(0);
    expect(board.exclusionHints.length).toBeGreaterThan(0);
    expect(board.radarSessionLabel).toBe("pre-market");
  });

  it("treats stale COOLING acceleration as non-actionable trend display", () => {
    const nowMs = Date.parse("2026-10-14T12:00:00.000Z");
    const trend = resolveVolumeTrendForDisplay({
      accelerationPct: -30,
      primaryScannerEventAt: "2026-10-14T08:00:00.000Z",
      nowMs,
    });
    expect(trend.label).toBe("STEADY");
    expect(isHistoricalPrimaryScannerTrigger("2026-10-14T08:00:00.000Z", nowMs)).toBe(true);
  });

  it("labels stale SURGING participation as last observed, not current", () => {
    const nowMs = Date.parse("2026-10-14T12:00:00.000Z");
    const evidence = buildParticipationTriggerEvidence(
      {
        symbol: "OLD",
        primary_scanner_event: "RUNNING_UP",
        primary_scanner_event_at: "2026-10-14T08:00:00.000Z",
        provider_as_of: "2026-10-14T08:05:00.000Z",
        participation_state: "SURGING",
        volume_acceleration_pct: 80,
      } as RadarRankedRow,
      nowMs,
    );
    expect(evidence.headline).toMatch(/Last observed SURGING/i);
    expect(evidence.participationSupported).toBe(false);
  });

  it("dedupes repeat-mover session appearances across polls", () => {
    const episode = (
      partial: Partial<RepeatMoverComparableEpisode> & Pick<RepeatMoverComparableEpisode, "episodeId">,
    ): RepeatMoverComparableEpisode => ({
      sessionDate: "2026-10-14",
      tier: "NOTABLE",
      direction: "POSITIVE",
      movePct: 8,
      volume: 1_000_000,
      rvol: 2,
      dollarVolume: null,
      closePosition: null,
      nextSessionMovePct: null,
      nextSessionContinuation: null,
      similarity: { sameDirection: true, sameTier: true, movePctDelta: 0 },
      ...partial,
    });
    const deduped = dedupeEpisodesBySessionDate([
      episode({ episodeId: "a", sessionDate: "2026-10-14" }),
      episode({ episodeId: "b", sessionDate: "2026-10-14" }),
    ]);
    expect(deduped).toHaveLength(1);
  });

  it("distinguishes missing RVOL from zero in display formatting", () => {
    expect(formatScreenerRvol5m(null)).toBe("—");
    expect(formatScreenerRvol5m(0)).toBe("0.0×");
  });
});
