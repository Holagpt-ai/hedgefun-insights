/**
 * Extended-session gap restoration from verified Radar previous closes.
 * Regular session still requires the opening print. Last price is not
 * treated as the open, and missing inputs stay unavailable.
 */

import { MAX_TAB_ROWS, type ScreenerResultRow } from "@/lib/screeners/contract";
import type { GappersTabEvidence } from "@/lib/screeners/tab-evaluation-evidence";
import { getTabEvaluationEvidence } from "@/lib/screeners/tab-evaluation-evidence";
import { isActionableScannerQuote } from "@/lib/screeners/scanner-tab-qualification";

/** Matches qualifiesGappers: absolute gap of at least 5%. */
export const GAPPER_MIN_ABS_PERCENT = 5;

export interface RadarGapperRestoreResult {
  rows: ScreenerResultRow[];
  status: "available" | "empty";
  evidence: GappersTabEvidence;
}

export function shouldRestoreGappersFromRadar(view: {
  status: string;
  rows: readonly { symbol?: string }[];
  tab_evaluation_evidence?: unknown;
}): boolean {
  const evidence = getTabEvaluationEvidence(
    (view.tab_evaluation_evidence ?? null) as Parameters<typeof getTabEvaluationEvidence>[0],
    "gappers",
  );
  if (evidence && "status" in evidence && evidence.status === "evaluated") return false;
  if (view.rows.length > 0 && view.status === "available") return false;
  return (
    view.status === "unavailable" ||
    view.status === "empty" ||
    evidence?.status === "prerequisite_unavailable" ||
    (view.rows.length === 0 && evidence === null)
  );
}

export function restoreExtendedSessionGappers(input: {
  session: string | null;
  radarRows: readonly ScreenerResultRow[];
}): RadarGapperRestoreResult | null {
  if (input.session !== "pre-market" && input.session !== "after-hours") return null;

  const actionable = input.radarRows.filter((row) =>
    isActionableScannerQuote(row.price, row.volume),
  );
  const calculable = actionable.filter(
    (row) => typeof row.change_percent === "number" && Number.isFinite(row.change_percent),
  );
  if (calculable.length === 0) return null;

  const unresolved = actionable.length - calculable.length;
  const qualified = [...calculable]
    .filter((row) => Math.abs(row.change_percent as number) >= GAPPER_MIN_ABS_PERCENT)
    .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0) || a.symbol.localeCompare(b.symbol))
    .slice(0, MAX_TAB_ROWS)
    .map((row) => ({
      ...row,
      tab_id: "gappers",
      gap_percent: row.change_percent,
    }));

  const evidence: GappersTabEvidence = {
    status: "evaluated",
    universe_count: input.radarRows.length,
    volume_positive_count: actionable.length,
    gap_calculable_count: calculable.length,
    no_prior_session_count: 0,
    unresolved_gap_input_count: unresolved,
    qualified_count: qualified.length,
    selected_count: qualified.length,
  };

  if (qualified.length === 0 && unresolved > 0) return null;

  return {
    rows: qualified,
    status: qualified.length > 0 ? "available" : "empty",
    evidence,
  };
}
