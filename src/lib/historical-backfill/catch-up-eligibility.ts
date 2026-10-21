/**
 * Catch-up eligibility vs full-span session counts (Batch 33).
 */

export interface SymbolSessionCoverage {
  symbol: string;
  latestSession: string | null;
  sessionCount: number;
}

/** True when stored history reaches the requested target session date. */
export function symbolCoverageCurrentThroughTarget(
  coverage: SymbolSessionCoverage,
  targetSession: string,
): boolean {
  if (!coverage.latestSession) return false;
  return coverage.latestSession >= targetSession;
}

/** Symbols that still need catch-up for targetSession. */
export function filterSymbolsNeedingCatchUp(
  coverages: readonly SymbolSessionCoverage[],
  targetSession: string,
): string[] {
  return coverages
    .filter((row) => !symbolCoverageCurrentThroughTarget(row, targetSession))
    .map((row) => row.symbol);
}

/**
 * Legacy min-session rule: sufficient rows in span but can miss recent sessions.
 * Used only to document regression — catch-up must not rely on this alone.
 */
export function legacyMinSessionBackfilled(
  coverage: SymbolSessionCoverage,
  minSessions: number,
): boolean {
  return coverage.sessionCount >= minSessions;
}
