import { formatScannerEventLabel } from "@/lib/screeners/scanner-events-display";

const PM_SUMMARY_EVENTS = new Set([
  "LATE_DAY_ACCELERATION",
  "HOD_BREAK",
  "HOD_MOMENTUM",
  "VWAP_RECLAIM",
  "GAP_CONTINUATION",
  "RUNNING_UP",
]);

export interface PmSessionSummaryRow {
  symbol: string;
  rank: number;
  primaryEvent: string;
  primaryEventLabel: string;
  rvol5m: number | null;
  volumeVelocity: number | null;
  distanceFromHodPct: number | null;
}

export function buildPmSessionSummaryRows(
  rows: readonly {
    symbol: string;
    rank: number;
    primary_scanner_event?: string | null;
    rvol_5m?: number | null;
    vol_velocity?: number | null;
    hod_distance_percent?: number | null;
  }[],
  limit = 8,
): PmSessionSummaryRow[] {
  const out: PmSessionSummaryRow[] = [];
  for (const row of rows) {
    const event = row.primary_scanner_event?.trim();
    if (!event || !PM_SUMMARY_EVENTS.has(event)) continue;
    const label = formatScannerEventLabel(event) ?? event;
    out.push({
      symbol: row.symbol,
      rank: row.rank,
      primaryEvent: event,
      primaryEventLabel: label,
      rvol5m: finiteOrNull(row.rvol_5m),
      volumeVelocity: finiteOrNull(row.vol_velocity),
      distanceFromHodPct: finiteOrNull(row.hod_distance_percent),
    });
    if (out.length >= limit) break;
  }
  return out;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
