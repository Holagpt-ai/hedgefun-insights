import { isFiniteNumber } from "@/lib/screeners/contract";

/** Today volume / float. Null when either input is missing or float is not positive. */
export function computeFloatTurnover(
  volume: number | null | undefined,
  floatShares: number | null | undefined,
): number | null {
  if (!isFiniteNumber(volume) || !isFiniteNumber(floatShares)) return null;
  if ((floatShares as number) <= 0) return null;
  return Math.round(((volume as number) / (floatShares as number)) * 100) / 100;
}

export function formatFloatTurnover(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  return `${value.toFixed(2)}×`;
}
