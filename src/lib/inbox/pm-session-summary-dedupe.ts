import type { PmSessionSummaryRow } from "@/lib/inbox/pm-session-summary";

const FRESHNESS_PRIORITY: Record<PmSessionSummaryRow["freshness"], number> = {
  late_confirmed: 0,
  historical_same_session: 1,
  unverified: 2,
  prior_session_snapshot: 3,
};

/** Dedupe repeated symbols; keep the highest-authority row at the best volume rank. */
export function dedupePmSessionSummaryRows(rows: readonly PmSessionSummaryRow[]): PmSessionSummaryRow[] {
  const bySymbol = new Map<string, PmSessionSummaryRow>();
  for (const row of rows) {
    const sym = row.symbol.trim().toUpperCase();
    if (!sym) continue;
    const existing = bySymbol.get(sym);
    if (!existing) {
      bySymbol.set(sym, row);
      continue;
    }
    const existingPriority = FRESHNESS_PRIORITY[existing.freshness];
    const nextPriority = FRESHNESS_PRIORITY[row.freshness];
    if (
      nextPriority < existingPriority ||
      (nextPriority === existingPriority && row.rank < existing.rank)
    ) {
      bySymbol.set(sym, row);
    }
  }
  return [...bySymbol.values()].sort((a, b) => a.rank - b.rank);
}
