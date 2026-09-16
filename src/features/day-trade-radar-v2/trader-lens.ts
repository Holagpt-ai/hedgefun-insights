import type { TraderLensPriceBounds } from "@/config/scanner-presets.config";
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

export function traderLensShowingCopy(visibleCount: number, radarCount: number): string {
  return `Showing ${visibleCount} of ${radarCount} Radar candidates`;
}
