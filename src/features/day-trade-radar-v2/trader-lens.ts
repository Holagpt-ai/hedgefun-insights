import {
  CORE_MOMENTUM_SESSION_MOVE_MIN,
  type TraderLensPresetId,
  type TraderLensPriceBounds,
} from "@/config/scanner-presets.config";
import { isFiniteNumber } from "@/lib/screeners/contract";
import type { RadarRankedRow } from "./types";

/**
 * Inclusive price-band match against an already-ranked Radar row.
 * Missing/invalid price cannot honestly satisfy a restriction, so it is
 * excluded whenever a min or max is set. All Movers (no bounds) keeps it.
 */
export function matchesTraderLensPrice(
  price: number | null | undefined,
  bounds: TraderLensPriceBounds,
): boolean {
  const hasMin = bounds.min !== null;
  const hasMax = bounds.max !== null;
  if (!hasMin && !hasMax) return true;
  if (!isFiniteNumber(price)) return false;
  if (hasMin && (price as number) < (bounds.min as number)) return false;
  if (hasMax && (price as number) > (bounds.max as number)) return false;
  return true;
}

/**
 * Filter AFTER authoritative volume-first ranking.
 * Original rank numbers are preserved; this never re-sorts or re-numbers.
 */
export function applyTraderLensPriceFilter(
  rows: readonly RadarRankedRow[],
  bounds: TraderLensPriceBounds,
): RadarRankedRow[] {
  if (bounds.min === null && bounds.max === null) return rows.slice();
  return rows.filter((row) => matchesTraderLensPrice(row.price, bounds));
}

export function sourceHasVerifiedSessionMove(rows: readonly RadarRankedRow[]): boolean {
  return rows.some((row) => isFiniteNumber(row.change_percent));
}

export function matchesCoreMomentumSessionMove(
  changePercent: number | null | undefined,
): boolean {
  return isFiniteNumber(changePercent) && (changePercent as number) >= CORE_MOMENTUM_SESSION_MOVE_MIN;
}

export interface TraderLensFilterResult {
  rows: RadarRankedRow[];
  /** True only when verified regular-session change_percent was actually applied. */
  sessionMoveFilterApplied: boolean;
  /** True when Core Momentum is selected but the source has no verified session move. */
  sessionMoveUnavailable: boolean;
}

/**
 * Trader Lens view of the already-ranked Radar universe.
 * Core Momentum may enforce +10% only when change_percent is verified.
 * 15s/60s Radar moves are never used as a substitute.
 */
export function applyTraderLensFilter(
  rows: readonly RadarRankedRow[],
  presetId: TraderLensPresetId,
  bounds: TraderLensPriceBounds,
): TraderLensFilterResult {
  const priced = applyTraderLensPriceFilter(rows, bounds);
  if (presetId !== "momentum_2_20") {
    return {
      rows: priced,
      sessionMoveFilterApplied: false,
      sessionMoveUnavailable: false,
    };
  }
  const hasVerifiedMove = sourceHasVerifiedSessionMove(rows);
  if (!hasVerifiedMove) {
    return {
      rows: priced,
      sessionMoveFilterApplied: false,
      sessionMoveUnavailable: true,
    };
  }
  return {
    rows: priced.filter((row) => matchesCoreMomentumSessionMove(row.change_percent)),
    sessionMoveFilterApplied: true,
    sessionMoveUnavailable: false,
  };
}

export function traderLensShowingCopy(visibleCount: number, radarCount: number): string {
  return `Showing ${visibleCount} of ${radarCount} Radar candidates`;
}
