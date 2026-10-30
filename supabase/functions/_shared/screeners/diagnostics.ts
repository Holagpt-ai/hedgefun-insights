// Structured Day-Trade Radar rejection diagnostics.
// Does not loosen production prerequisites in selection.ts.

import {
  dayVolume,
  normalizeSymbol,
  parseProviderAsOf,
  priorSessionVolume,
  type PolygonTicker,
  qualifiesDayTradeRadar,
  regularChangePercent,
  regularClose,
} from "./selection.ts";
import { resolveSyncSessionKind, type SyncSessionKind } from "./session-sync-context.ts";

export type RadarRejectReason =
  | "missing_invalid_snapshot"
  | "price_range_failure"
  | "minimum_volume_failure"
  | "percentage_move_failure"
  | "volume_ratio_failure";

export interface RadarCandidateDiagnostic {
  symbol: string | null;
  qualified: boolean;
  reasons: RadarRejectReason[];
}

export interface RadarRejectionSummary {
  evaluated: number;
  qualified: number;
  rejected: number;
  counts: Record<RadarRejectReason, number>;
}

function rawVolumeRatio(t: PolygonTicker): number | null {
  const dayVol = dayVolume(t);
  const priorVol = priorSessionVolume(t);
  if (dayVol === null || !(dayVol > 0) || priorVol === null) return null;
  const ratio = dayVol / priorVol;
  if (!Number.isFinite(ratio) || !(ratio > 0)) return null;
  return ratio;
}

export function evaluateDayTradeRadar(
  t: PolygonTicker,
  nowMs: number,
  opts?: { syncSessionKind?: SyncSessionKind },
): RadarCandidateDiagnostic {
  const symbol = normalizeSymbol(t?.ticker);
  const reasons: RadarRejectReason[] = [];
  const price = regularClose(t);
  const chg = regularChangePercent(t);
  const vol = dayVolume(t);
  const ratio = rawVolumeRatio(t);
  const asOf = parseProviderAsOf(t.updated, nowMs);
  const sessionKind = opts?.syncSessionKind ?? resolveSyncSessionKind(nowMs);
  const requiresRegularSnapshotFields = sessionKind === "market";

  if (!symbol || asOf === null) reasons.push("missing_invalid_snapshot");
  else if (requiresRegularSnapshotFields && price === null) {
    reasons.push("missing_invalid_snapshot");
  }
  if (vol === null || !(vol > 0)) reasons.push("minimum_volume_failure");
  if (price !== null && (price < 2 || price > 20)) reasons.push("price_range_failure");
  if (chg === null || chg < 10) reasons.push("percentage_move_failure");
  if (ratio === null || ratio < 5) reasons.push("volume_ratio_failure");

  const qualified = qualifiesDayTradeRadar(t) && asOf !== null && symbol !== null;
  return { symbol, qualified, reasons: qualified ? [] : reasons };
}

export function createEmptyRadarRejectionSummary(): RadarRejectionSummary {
  return {
    evaluated: 0,
    qualified: 0,
    rejected: 0,
    counts: {
      missing_invalid_snapshot: 0,
      price_range_failure: 0,
      minimum_volume_failure: 0,
      percentage_move_failure: 0,
      volume_ratio_failure: 0,
    },
  };
}

/** Incremental summary — avoids materializing one diagnostic object per universe symbol. */
export function accumulateRadarDiagnostic(
  summary: RadarRejectionSummary,
  t: PolygonTicker,
  nowMs: number,
  opts?: { syncSessionKind?: SyncSessionKind },
): void {
  summary.evaluated += 1;
  const diag = evaluateDayTradeRadar(t, nowMs, opts);
  if (diag.qualified) {
    summary.qualified += 1;
    return;
  }
  summary.rejected += 1;
  for (const r of diag.reasons) summary.counts[r] += 1;
}

export function summarizeRadarDiagnostics(
  diags: RadarCandidateDiagnostic[],
): RadarRejectionSummary {
  const counts: Record<RadarRejectReason, number> = {
    missing_invalid_snapshot: 0,
    price_range_failure: 0,
    minimum_volume_failure: 0,
    percentage_move_failure: 0,
    volume_ratio_failure: 0,
  };
  let qualified = 0;
  for (const d of diags) {
    if (d.qualified) {
      qualified += 1;
      continue;
    }
    for (const r of d.reasons) counts[r] += 1;
  }
  return {
    evaluated: diags.length,
    qualified,
    rejected: diags.length - qualified,
    counts,
  };
}

/** Merge incremental radar summaries from chunked universe processing. */
export function mergeRadarRejectionSummaries(
  a: RadarRejectionSummary,
  b: RadarRejectionSummary,
): RadarRejectionSummary {
  const counts = { ...a.counts };
  for (const key of Object.keys(b.counts) as RadarRejectReason[]) {
    counts[key] += b.counts[key];
  }
  return {
    evaluated: a.evaluated + b.evaluated,
    qualified: a.qualified + b.qualified,
    rejected: a.rejected + b.rejected,
    counts,
  };
}

export function formatRadarRejectionLog(summary: RadarRejectionSummary): string {
  return [
    "day_trade_radar_diagnostics",
    `evaluated=${summary.evaluated}`,
    `qualified=${summary.qualified}`,
    `rejected=${summary.rejected}`,
    `missing_invalid_snapshot=${summary.counts.missing_invalid_snapshot}`,
    `price_range_failure=${summary.counts.price_range_failure}`,
    `minimum_volume_failure=${summary.counts.minimum_volume_failure}`,
    `percentage_move_failure=${summary.counts.percentage_move_failure}`,
    `volume_ratio_failure=${summary.counts.volume_ratio_failure}`,
  ].join(" ");
}
