/** Compact intraday evidence attached to Repeat Mover comparables. */
export type RepeatMoverIntradayEvidence = {
  hodAt: string | null;
  closeVsHodPct: number | null;
  largestPullbackPct: number | null;
  recoveredFromPullback: boolean | null;
  haltCount: number | null;
  vwapReclaimCount: number | null;
  largestVolumeBurstAt: string | null;
  completenessState: "COMPLETE" | "PARTIAL" | "DAILY_ONLY" | "UNAVAILABLE";
};

const VALID_COMPLETENESS = new Set<string>([
  "COMPLETE",
  "PARTIAL",
  "DAILY_ONLY",
  "UNAVAILABLE",
]);

function readNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Maps a persisted reconstruction row; returns null when completeness is invalid. */
export function mapPersistedRowToRepeatMoverEvidence(
  row: Record<string, unknown>,
): RepeatMoverIntradayEvidence | null {
  const completenessRaw = row.completeness_state;
  if (typeof completenessRaw !== "string" || !VALID_COMPLETENESS.has(completenessRaw)) {
    return null;
  }
  return {
    hodAt: typeof row.hod_at === "string" ? row.hod_at : null,
    closeVsHodPct: readNum(row.close_vs_hod_pct),
    largestPullbackPct: readNum(row.largest_pullback_pct),
    recoveredFromPullback: row.recovered_from_pullback === true
      ? true
      : row.recovered_from_pullback === false
        ? false
        : null,
    haltCount: readNum(row.halt_count),
    vwapReclaimCount: readNum(row.vwap_reclaim_count),
    largestVolumeBurstAt: typeof row.largest_volume_burst_at === "string"
      ? row.largest_volume_burst_at
      : null,
    completenessState: completenessRaw as RepeatMoverIntradayEvidence["completenessState"],
  };
}
