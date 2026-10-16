import type { PmSessionSummaryRow } from "@/lib/inbox/pm-session-summary";

/** Dedupe repeated symbols within the PM session summary list only (preserves volume-first order). */
export function dedupePmSessionSummaryRows(rows: readonly PmSessionSummaryRow[]): PmSessionSummaryRow[] {
  const seen = new Set<string>();
  const out: PmSessionSummaryRow[] = [];
  for (const row of rows) {
    const sym = row.symbol.trim().toUpperCase();
    if (!sym || seen.has(sym)) continue;
    seen.add(sym);
    out.push(row);
  }
  return out;
}
