import { computeDollarVolume } from "@/lib/screeners/dollar-volume";

export const SCREENER_UNAVAILABLE_DISPLAY = "—";

export function isDisplayableMetricNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Display-only RVOL 20D. Uses the persisted field only — never Vol/Prior,
 * float turnover, 5-minute ratios, or a recomputed substitute.
 */
export function resolveDisplayRvol20d(value: unknown): number | null {
  return isDisplayableMetricNumber(value) ? value : null;
}

export function formatScreenerRvol20d(value: unknown): string {
  const resolved = resolveDisplayRvol20d(value);
  if (resolved === null) return SCREENER_UNAVAILABLE_DISPLAY;
  return `${resolved.toFixed(1)}×`;
}

export function resolveDisplayDollarVolume(
  price: number | null | undefined,
  volume: number | null | undefined,
): number | null {
  return computeDollarVolume(price, volume);
}

export function formatScreenerDollarVolume(value: unknown): string {
  if (!isDisplayableMetricNumber(value)) return SCREENER_UNAVAILABLE_DISPLAY;
  if (value === 0) return "$0";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function formatScreenerDollarVolumeFromRow(
  price: number | null | undefined,
  volume: number | null | undefined,
): string {
  return formatScreenerDollarVolume(resolveDisplayDollarVolume(price, volume));
}
