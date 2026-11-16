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