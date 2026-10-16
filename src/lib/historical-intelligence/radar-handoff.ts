import {
  buildCurrentSetupFromRadarRow,
  rankHistoricalMatches,
} from "@/lib/historical-intelligence/historical-match-engine";
import {
  summarizeHistoricalMatches,
  type HistoricalMatchSummary,
} from "@/lib/historical-intelligence/historical-match-summary";
import type { RepeatMoverContext } from "@/types/repeat-mover";
import type { RadarRankedRow } from "@/features/day-trade-radar-v2/types";
import type { CurrentSetupSnapshot } from "@/lib/historical-intelligence/historical-match-engine";
import { HISTORICAL_MATCH } from "@/config/scanner-intelligence-v2.config";

export function historicalMatchSummaryFromContext(
  current: CurrentSetupSnapshot,
  context: RepeatMoverContext | null | undefined,
): HistoricalMatchSummary | null {
  if (!context?.profile?.profileAvailable) return null;
  const topMatches = rankHistoricalMatches(current, context);
  if (topMatches.length === 0) return null;
  return summarizeHistoricalMatches(topMatches, {
    profileEpisodeCount: context.profile.episodeCount ?? null,
  });
}

export function historicalMatchSummaryForRadarRow(
  row: RadarRankedRow,
): HistoricalMatchSummary | null {
  const context = row.historicalContext;
  const current = buildCurrentSetupFromRadarRow(row);
  return historicalMatchSummaryFromContext(current, context);
}

export function formatHistoricalMatchChip(summary: HistoricalMatchSummary | null): string | null {
  if (!summary || summary.matchCount === 0) return null;
  const parts: string[] = [
    summary.matchCount === 1 ? "1 match" : `${summary.matchCount} matches`,
  ];
  if (summary.outcomeObservedCount > 0) {
    parts.push(
      summary.outcomeObservedCount === 1
        ? "1 outcome"
        : `${summary.outcomeObservedCount} outcomes`,
    );
  } else {
    parts.push("Limited outcome history");
  }
  if (summary.continuationRate != null) {
    parts.push(`${Math.round(summary.continuationRate * 100)}% cont.`);
  } else if (
    summary.outcomeObservedCount > 0 &&
    summary.continuationKnownCount < HISTORICAL_MATCH.minKnownOutcomesForRate
  ) {
    parts.push("Cont. rate unavailable");
  }
  if (summary.sampleQuality === "LIMITED") parts.push("limited");
  if (summary.matchSimilarityQuality === "SPARSE") parts.push("sparse match");
  return parts.join(" · ");
}

export function formatHistoricalOutcomeDetail(summary: HistoricalMatchSummary): string[] {
  const lines: string[] = [];
  lines.push(
    `${summary.matchCount} comparable episode${summary.matchCount === 1 ? "" : "s"}`,
  );
  lines.push(
    `${summary.outcomeObservedCount} with observed next-session outcomes`,
  );
  if (summary.continuationRate != null) {
    lines.push(
      `${summary.continuationSuccessCount}/${summary.continuationKnownCount} continued (${Math.round(summary.continuationRate * 100)}%)`,
    );
  } else if (summary.matchCount > 0) {
    lines.push("Continuation rate unavailable — insufficient known outcomes");
  }
  if (summary.medianNextSessionReturn != null) {
    lines.push(
      `Median next-session return ${summary.medianNextSessionReturn > 0 ? "+" : ""}${summary.medianNextSessionReturn.toFixed(1)}%`,
    );
  }
  if (summary.medianMfe != null) {
    lines.push(`Median favorable excursion ${summary.medianMfe.toFixed(1)}%`);
  }
  if (summary.medianMae != null) {
    lines.push(`Median adverse excursion ${summary.medianMae.toFixed(1)}%`);
  }
  if (summary.strongestComparableDates.length > 0) {
    lines.push(`Closest dates: ${summary.strongestComparableDates.join(", ")}`);
  }
  lines.push(`Match evidence: ${summary.matchSimilarityQuality.toLowerCase()}`);
  lines.push(`Outcome confidence: ${summary.outcomeConfidence.toLowerCase()}`);
  if (summary.profileEpisodeCount != null) {
    lines.push(`Profile episodes: ${summary.profileEpisodeCount}`);
  }
  return lines;
}
