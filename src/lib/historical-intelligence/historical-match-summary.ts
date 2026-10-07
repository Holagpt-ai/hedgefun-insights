import { HISTORICAL_MATCH } from "@/config/scanner-intelligence-v2.config";
import type { HistoricalTopMatch } from "@/lib/historical-intelligence/historical-match-engine";

export type HistoricalSampleQuality = "LIMITED" | "ADEQUATE";

export interface HistoricalMatchSummary {
  matchCount: number;
  continuationCount: number;
  continuationRate: number | null;
  medianNextSessionReturn: number | null;
  medianMfe: number | null;
  medianMae: number | null;
  positiveOutcomeRate: number | null;
  sampleQuality: HistoricalSampleQuality;
  topMatches: HistoricalTopMatch[];
  strongestComparableDates: string[];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

export function summarizeHistoricalMatches(topMatches: HistoricalTopMatch[]): HistoricalMatchSummary {
  const matchCount = topMatches.length;
  const continuations = topMatches.filter((m) => m.continuation === true);
  const nextReturns = topMatches
    .map((m) => m.nextDayReturn)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const mfes = topMatches.map((m) => m.mfe).filter((v): v is number => v != null && Number.isFinite(v));
  const maes = topMatches.map((m) => m.mae).filter((v): v is number => v != null && Number.isFinite(v));
  const positive = nextReturns.filter((r) => r > 0);

  return {
    matchCount,
    continuationCount: continuations.length,
    continuationRate:
      matchCount > 0 ? Math.round((continuations.length / matchCount) * 100) / 100 : null,
    medianNextSessionReturn: median(nextReturns),
    medianMfe: median(mfes),
    medianMae: median(maes),
    positiveOutcomeRate:
      nextReturns.length > 0 ? Math.round((positive.length / nextReturns.length) * 100) / 100 : null,
    sampleQuality:
      matchCount < HISTORICAL_MATCH.limitedSampleThreshold ? "LIMITED" : "ADEQUATE",
    topMatches,
    strongestComparableDates: topMatches
      .slice(0, 3)
      .map((m) => m.date)
      .filter((d): d is string => d != null),
  };
}
