import { HISTORICAL_MATCH } from "@/config/scanner-intelligence-v2.config";
import type { HistoricalTopMatch } from "@/lib/historical-intelligence/historical-match-engine";

export type HistoricalSampleQuality = "LIMITED" | "ADEQUATE";

export type HistoricalMatchEvidenceQuality = "INSUFFICIENT" | "SPARSE" | "MODERATE" | "STRONG";

export type HistoricalOutcomeConfidence = "INSUFFICIENT" | "LIMITED" | "ADEQUATE";

export interface HistoricalMatchSummary {
  matchCount: number;
  /** Episodes with any observed forward outcome field (return, MFE, MAE, or known continuation). */
  outcomeObservedCount: number;
  /** Episodes where continuation outcome is known (true/false), not null. */
  continuationKnownCount: number;
  /** Episodes that continued into the next session among known outcomes. */
  continuationSuccessCount: number;
  missingOutcomeCount: number;
  /** Share of comparable matches with at least one observed outcome metric. */
  outcomeCoverageRate: number | null;
  continuationCount: number;
  continuationRate: number | null;
  medianNextSessionReturn: number | null;
  medianMfe: number | null;
  medianMae: number | null;
  positiveOutcomeRate: number | null;
  sampleQuality: HistoricalSampleQuality;
  matchSimilarityQuality: HistoricalMatchEvidenceQuality;
  outcomeConfidence: HistoricalOutcomeConfidence;
  profileEpisodeCount: number | null;
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

function hasObservedOutcome(match: HistoricalTopMatch): boolean {
  return (
    match.continuation !== null ||
    match.nextDayReturn !== null ||
    match.mfe !== null ||
    match.mae !== null
  );
}

function deriveMatchSimilarityQuality(
  matches: HistoricalTopMatch[],
): HistoricalMatchEvidenceQuality {
  if (matches.length === 0) return "INSUFFICIENT";
  const avgFeatures =
    matches.reduce((sum, m) => sum + m.featuresWithBothSides, 0) / matches.length;
  if (avgFeatures >= HISTORICAL_MATCH.minFeaturesForStrongMatch) return "STRONG";
  if (avgFeatures <= HISTORICAL_MATCH.sparseFeatureThreshold) return "SPARSE";
  return "MODERATE";
}

function deriveOutcomeConfidence(observedCount: number): HistoricalOutcomeConfidence {
  if (observedCount === 0) return "INSUFFICIENT";
  if (observedCount < HISTORICAL_MATCH.minOutcomesForAdequateConfidence) return "LIMITED";
  return "ADEQUATE";
}

export function summarizeHistoricalMatches(
  topMatches: HistoricalTopMatch[],
  options: { profileEpisodeCount?: number | null } = {},
): HistoricalMatchSummary {
  const matchCount = topMatches.length;
  const outcomeObservedCount = topMatches.filter(hasObservedOutcome).length;
  const missingOutcomeCount = matchCount - outcomeObservedCount;
  const continuationKnown = topMatches.filter((m) => m.continuation !== null);
  const continuationKnownCount = continuationKnown.length;
  const continuationSuccessCount = continuationKnown.filter((m) => m.continuation === true).length;

  const nextReturns = topMatches
    .map((m) => m.nextDayReturn)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const mfes = topMatches.map((m) => m.mfe).filter((v): v is number => v != null && Number.isFinite(v));
  const maes = topMatches.map((m) => m.mae).filter((v): v is number => v != null && Number.isFinite(v));
  const positive = nextReturns.filter((r) => r > 0);

  const canShowContinuationRate =
    continuationKnownCount >= HISTORICAL_MATCH.minKnownOutcomesForRate;

  return {
    matchCount,
    outcomeObservedCount,
    continuationKnownCount,
    continuationSuccessCount,
    missingOutcomeCount,
    outcomeCoverageRate:
      matchCount > 0 ? Math.round((outcomeObservedCount / matchCount) * 100) / 100 : null,
    continuationCount: continuationSuccessCount,
    continuationRate: canShowContinuationRate
      ? Math.round((continuationSuccessCount / continuationKnownCount) * 100) / 100
      : null,
    medianNextSessionReturn: median(nextReturns),
    medianMfe: median(mfes),
    medianMae: median(maes),
    positiveOutcomeRate:
      nextReturns.length > 0 ? Math.round((positive.length / nextReturns.length) * 100) / 100 : null,
    sampleQuality:
      matchCount < HISTORICAL_MATCH.limitedSampleThreshold ? "LIMITED" : "ADEQUATE",
    matchSimilarityQuality: deriveMatchSimilarityQuality(topMatches),
    outcomeConfidence: deriveOutcomeConfidence(outcomeObservedCount),
    profileEpisodeCount: options.profileEpisodeCount ?? null,
    topMatches,
    strongestComparableDates: topMatches
      .slice(0, 3)
      .map((m) => m.date)
      .filter((d): d is string => d != null),
  };
}
