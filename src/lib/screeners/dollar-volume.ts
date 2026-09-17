import { isFiniteNumber, isPositiveFinite } from "@/lib/screeners/contract";

/**
 * Dollar Volume = current price × current day/session volume.
 * Context metric only — does not affect Discovery Rank.
 */
export function computeDollarVolume(
  price: number | null | undefined,
  volume: number | null | undefined,
): number | null {
  if (!isPositiveFinite(price)) return null;
  if (!isFiniteNumber(volume) || (volume as number) < 0) return null;
  const product = (price as number) * (volume as number);
  if (!Number.isFinite(product)) return null;
  return product;
}

export function formatDollarVolume(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  const n = Number(value);
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
