import type { AmInboxLateSessionCandidate } from "@/lib/am-inbox/late-session-continuation-types";
import { CONTINUATION_CATEGORY_PRIORITY } from "@/config/continuation.config";
import type { ContinuationCategory } from "@/config/continuation.config";

const SCANNER_EVENT_PRIORITY: Readonly<Record<string, number>> = {
  "VOLUME EXPLOSION": 50,
  "RUNNING UP": 35,
};

function finiteOrZero(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  return value;
}

function bestCategoryRank(categories: readonly ContinuationCategory[]): number {
  let best = 0;
  for (const cat of categories) {
    const rank = CONTINUATION_CATEGORY_PRIORITY[cat] ?? 0;
    if (rank > best) best = rank;
  }
  return best;
}

function scannerEventBoost(labels: readonly string[]): number {
  let boost = 0;
  for (const label of labels) {
    const normalized = label.trim().toUpperCase();
    for (const [key, points] of Object.entries(SCANNER_EVENT_PRIORITY)) {
      if (normalized.includes(key)) {
        boost = Math.max(boost, points);
      }
    }
  }
  return boost;
}

function catalystBoost(present: boolean | null): number {
  if (present === true) return 8;
  if (present === null) return 0;
  return -2;
}

function evidenceSupportBoost(entry: AmInboxLateSessionCandidate): number {
  const { context } = entry;
  let boost = 0;
  if (context.historicalContextAvailable && context.comparableEpisodeCount > 0) {
    boost += Math.min(6, context.comparableEpisodeCount);
  }
  boost += Math.min(4, context.evidenceLabels.length);
  return boost;
}

/**
 * Presentation-only AM Inbox priority. Does not alter capture qualification or Discovery rank.
 * Higher score = show earlier in the inbox continuation module.
 */
export function computeAmInboxLateSessionPriorityScore(entry: AmInboxLateSessionCandidate): number {
  const { context } = entry;
  const categories =
    entry.sourceCategories.length > 0 ? entry.sourceCategories : [context.sourceCategory];

  const volume = finiteOrZero(context.volume);
  const dollarVolume = finiteOrZero(context.dollarVolume);
  const rvol = finiteOrZero(context.rvol);

  const volumeKing =
    Math.log10(Math.max(volume, 1)) * 12 + Math.log10(Math.max(dollarVolume, 1)) * 14;

  const rvolPoints = Math.min(40, rvol * 4);

  const categoryPoints = bestCategoryRank(categories) * 10;
  const multiCategoryPoints = Math.min(8, categories.length * 2);

  const hodPct = context.closeDistanceFromHodPct;
  const hodPoints =
    hodPct !== null && Number.isFinite(hodPct)
      ? Math.max(0, 12 - Math.min(hodPct, 12))
      : 0;

  const afterHoursPoints = context.afterHoursExtends === true ? 10 : 0;

  const scannerPoints = scannerEventBoost(context.evidenceLabels);

  const missingCoreMetrics =
    context.volume === null &&
    context.dollarVolume === null &&
    context.rvol === null &&
    scannerPoints === 0;

  const missingPenalty = missingCoreMetrics ? 25 : 0;

  return (
    volumeKing +
    rvolPoints +
    categoryPoints +
    multiCategoryPoints +
    hodPoints +
    afterHoursPoints +
    scannerPoints +
    catalystBoost(context.catalystPresent) +
    evidenceSupportBoost(entry) -
    missingPenalty
  );
}

export function compareAmInboxLateSessionCandidates(
  a: AmInboxLateSessionCandidate,
  b: AmInboxLateSessionCandidate,
): number {
  const volDiff = finiteOrZero(b.context.volume) - finiteOrZero(a.context.volume);
  if (volDiff !== 0) return volDiff;

  const dollarDiff = finiteOrZero(b.context.dollarVolume) - finiteOrZero(a.context.dollarVolume);
  if (dollarDiff !== 0) return dollarDiff;

  const rvolDiff = finiteOrZero(b.context.rvol) - finiteOrZero(a.context.rvol);
  if (rvolDiff !== 0) return rvolDiff;

  const scoreDiff =
    computeAmInboxLateSessionPriorityScore(b) - computeAmInboxLateSessionPriorityScore(a);
  if (scoreDiff !== 0) return scoreDiff;

  return a.context.symbol.localeCompare(b.context.symbol);
}

export function rankAmInboxLateSessionCandidates(
  entries: readonly AmInboxLateSessionCandidate[],
): AmInboxLateSessionCandidate[] {
  return [...entries].sort(compareAmInboxLateSessionCandidates);
}
