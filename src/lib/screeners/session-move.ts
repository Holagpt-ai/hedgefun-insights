import { expectedVolumeRatio, isFiniteNumber, isPositiveFinite } from "@/lib/screeners/contract";

/**
 * Recover the previous regular-session close from a verified price and a
 * change that was computed as (price - previousClose) / previousClose * 100.
 * Returns null when the pair cannot be inverted. Does not invent a close.
 */
export function previousCloseFromVerifiedMove(
  price: number | null | undefined,
  changePercent: number | null | undefined,
): number | null {
  if (!isPositiveFinite(price) || !isFiniteNumber(changePercent)) return null;
  const denominator = 1 + changePercent / 100;
  if (!Number.isFinite(denominator) || !(denominator > 0)) return null;
  const previousClose = price / denominator;
  if (!Number.isFinite(previousClose) || !(previousClose > 0)) return null;
  return previousClose;
}

/** (last - previous regular close) / previous regular close * 100. */
export function sessionMovePercent(
  lastPrice: number | null | undefined,
  previousClose: number | null | undefined,
): number | null {
  if (!isPositiveFinite(lastPrice) || !isPositiveFinite(previousClose)) return null;
  const pct = ((lastPrice - previousClose) / previousClose) * 100;
  if (!Number.isFinite(pct)) return null;
  return pct;
}

/**
 * True when two prices differ by a near-integer factor of 2× or more.
 * Ordinary session drift stays eligible. Split-scale jumps stay unjoined.
 */
export function pricesImplyCorporateActionScale(
  donorPrice: number | null | undefined,
  lastPrice: number | null | undefined,
): boolean {
  if (!isPositiveFinite(donorPrice) || !isPositiveFinite(lastPrice)) return false;
  const ratio = Math.max(donorPrice, lastPrice) / Math.min(donorPrice, lastPrice);
  if (!Number.isFinite(ratio) || ratio < 2) return false;
  const rounded = Math.round(ratio);
  if (rounded < 2) return false;
  return Math.abs(ratio - rounded) / rounded <= 0.03;
}

/**
 * Today cumulative volume / previous completed session volume.
 * Either side missing → null. Never substitutes 0 for a missing side.
 */
export function volumeVersusPriorSession(
  todayVolume: number | null | undefined,
  priorVolume: number | null | undefined,
): number | null {
  if (!isFiniteNumber(todayVolume) || todayVolume < 0) return null;
  if (!isPositiveFinite(priorVolume)) return null;
  return expectedVolumeRatio(todayVolume, priorVolume);
}
