import {
  evaluateMorningRadarEligibility,
  morningBoardConfirmedPremarket,
  type MorningRejectionCode,
} from "@/lib/am-inbox/morning-opportunity-eligibility";
import type { MorningRadarRow } from "@/lib/am-inbox/morning-opportunity-types";

const REJECTION_LABELS: Record<MorningRejectionCode, string> = {
  BELOW_MIN_VOLUME: "Below session volume minimum",
  VOLUME_ONLY_NO_EVENT: "Volume only — no momentum, gap, or participation path",
  PREMARKET_NOT_CONFIRMED: "Gap/participation requires confirmed pre-market",
  GAP_BELOW_THRESHOLD: "Session gap below continuation threshold",
  NO_POSITIVE_MOVE: "No positive short-window or session move",
  MISSING_RVOL_PARTICIPATION: "Missing 5m RVOL / acceleration / velocity for participation",
  CONTINUATION_EXPIRED: "Prior-session handoff expired",
  GENERATION_STALE: "Radar generation stale",
};

/** Top exclusion reasons for high-volume radar rows (defensible empty-state copy). */
export function summarizeMorningRadarExclusions(input: {
  radarRows?: readonly MorningRadarRow[] | null;
  polygonPremarketActive?: boolean;
  limit?: number;
}): string[] {
  const confirmedPremarket = morningBoardConfirmedPremarket(input.polygonPremarketActive === true);
  const counts = new Map<MorningRejectionCode, number>();

  for (const row of input.radarRows ?? []) {
    const eligibility = evaluateMorningRadarEligibility(row, confirmedPremarket);
    if (eligibility.accepted) continue;
    for (const code of eligibility.rejectionCodes) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }

  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const limit = input.limit ?? 3;
  return ranked.slice(0, limit).map(([code, count]) => {
    const label = REJECTION_LABELS[code] ?? code;
    return `${count} name${count === 1 ? "" : "s"}: ${label}`;
  });
}
