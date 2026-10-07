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

export function historicalMatchSummaryForRadarRow(
  row: RadarRankedRow,
): HistoricalMatchSummary | null {
  const context = row.historicalContext;
  if (!context?.profile?.profileAvailable) return null;
  const current = buildCurrentSetupFromRadarRow(row);
  const topMatches = rankHistoricalMatches(current, context);
  if (topMatches.length === 0) return null;
  return summarizeHistoricalMatches(topMatches);
}

export function formatHistoricalMatchChip(summary: HistoricalMatchSummary | null): string | null {
  if (!summary || summary.matchCount === 0) return null;
  const rate =
    summary.continuationRate != null
      ? `${Math.round(summary.continuationRate * 100)}% cont.`
      : null;
  const quality = summary.sampleQuality === "LIMITED" ? "limited" : null;
  return [summary.matchCount === 1 ? "1 match" : `${summary.matchCount} matches`, rate, quality]
    .filter(Boolean)
    .join(" · ");
}
