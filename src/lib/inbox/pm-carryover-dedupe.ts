import type { PmSessionSummaryRow } from "@/lib/inbox/pm-session-summary";

/** Avoid duplicate PM cards when Carryover Watch already surfaces the same symbol. */
export function filterPmSessionSummaryAgainstCarryover(
  rows: readonly PmSessionSummaryRow[],
  carryoverSymbols: ReadonlySet<string>,
): PmSessionSummaryRow[] {
  if (carryoverSymbols.size === 0) return [...rows];
  return rows.filter((row) => !carryoverSymbols.has(row.symbol.trim().toUpperCase()));
}
