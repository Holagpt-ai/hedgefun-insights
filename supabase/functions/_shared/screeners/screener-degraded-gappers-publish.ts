/**
 * ISS-034 Option B — degraded Gappers publication policy (feature-flagged).
 * Default OFF. Exact env value `true` enables publish without Gappers rows when
 * only Gappers is `gap_input_coverage_incomplete`.
 */

import type { GappersTabEvidence, TabEvaluationEvidenceMap } from "./evaluation-evidence.ts";

export const SCREENER_ALLOW_DEGRADED_GAPPERS_PUBLISH_ENV =
  "SCREENER_ALLOW_DEGRADED_GAPPERS_PUBLISH";

export type DegradedGappersEnvGet = (key: string) => string | undefined;

export function isDegradedGappersPublishEnabled(
  envGet: DegradedGappersEnvGet = (key) => Deno.env.get(key),
): boolean {
  return envGet(SCREENER_ALLOW_DEGRADED_GAPPERS_PUBLISH_ENV) === "true";
}

export function gappersGapInputCoverageIncomplete(
  evidence: TabEvaluationEvidenceMap,
): boolean {
  const g = evidence.gappers as GappersTabEvidence | undefined;
  if (!g || g.status !== "prerequisite_unavailable") return false;
  return g.reason === "gap_input_coverage_incomplete";
}

export function omitGappersRowsForDegradedPublication<T extends { tab_id?: unknown }>(
  rows: readonly T[],
  evidence: TabEvaluationEvidenceMap,
  publishEnabled: boolean,
): T[] {
  if (!publishEnabled || !gappersGapInputCoverageIncomplete(evidence)) {
    return [...rows];
  }
  const gappers = evidence.gappers as GappersTabEvidence;
  if (gappers.status === "evaluated") return [...rows];
  return rows.filter((row) => row.tab_id !== "gappers");
}

export function countRowsByTab<T extends { tab_id?: unknown }>(
  rows: readonly T[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const tab = typeof row.tab_id === "string" ? row.tab_id : "unknown";
    out[tab] = (out[tab] ?? 0) + 1;
  }
  return out;
}

const PUBLISHED_TAB_ORDER = [
  "day_trade_radar",
  "gappers",
  "volume_spikes",
  "gainers_losers",
  "unusual_volume",
  "new_highs_lows",
] as const;

export type PublishedTabCounts = Record<
  (typeof PUBLISHED_TAB_ORDER)[number],
  number
>;

/** Tab counts for sync response JSON — reflects rows actually published (post Option B filter). */
export function publishedTabCountsFromRows<T extends { tab_id?: unknown }>(
  rows: readonly T[],
): PublishedTabCounts {
  const byTab = countRowsByTab(rows);
  return {
    day_trade_radar: byTab.day_trade_radar ?? 0,
    gappers: byTab.gappers ?? 0,
    volume_spikes: byTab.volume_spikes ?? 0,
    gainers_losers: byTab.gainers_losers ?? 0,
    unusual_volume: byTab.unusual_volume ?? 0,
    new_highs_lows: byTab.new_highs_lows ?? 0,
  };
}

/** Gappers/L gainers and NHL must be evaluated on the candidate — not merely unchanged from prior unavailability. */
export function preservationCompanionTabsEvaluatedOnCandidate(
  evidence: TabEvaluationEvidenceMap,
): boolean {
  for (const tabId of ["gainers_losers", "new_highs_lows"] as const) {
    const row = evidence[tabId];
    if (!row || row.status !== "evaluated") return false;
  }
  return true;
}

export function canAllowDegradedGappersPublication(input: {
  degradedTabs: readonly string[];
  nextEvidence: TabEvaluationEvidenceMap;
  allowDegradedGappersPublish: boolean | undefined;
}): boolean {
  if (input.allowDegradedGappersPublish !== true) return false;
  if (input.degradedTabs.length !== 1 || input.degradedTabs[0] !== "gappers") {
    return false;
  }
  if (!gappersGapInputCoverageIncomplete(input.nextEvidence)) return false;
  return preservationCompanionTabsEvaluatedOnCandidate(input.nextEvidence);
}