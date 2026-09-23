import {
  displayScreenerMetricValue,
  toScreenerDollarVolumeValue,
  toScreenerRvol20dValue,
  type ScreenerMetricObservation,
} from "@/lib/screeners/screener-data-quality";

export function finiteMetric(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function formatCompactNumber(value: string | number | null | undefined): string {
  const n = finiteMetric(value);
  if (n === null) return "—";
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
}

export function formatScreenerDollarVolumeValue(value: string | number | null | undefined): string {
  const n = finiteMetric(value);
  if (n === null) return "—";
  return `$${formatCompactNumber(n)}`;
}

export function formatScreenerDollarVolume(
  price: number | null | undefined,
  volume: number | null | undefined,
  observation?: ScreenerMetricObservation,
): string {
  return displayScreenerMetricValue(toScreenerDollarVolumeValue(price, volume, observation), (n) =>
    formatScreenerDollarVolumeValue(n),
  );
}

export function formatScreenerRvol20d(
  value: string | number | null | undefined,
  observation?: ScreenerMetricObservation,
): string {
  return displayScreenerMetricValue(toScreenerRvol20dValue(value, observation), (n) => `${n.toFixed(1)}×`);
}

/** Short-window 5m RVOL from Radar V2 (distinct from 20d daily RVOL). */
export function formatScreenerRvol5m(
  value: string | number | null | undefined,
): string {
  const n = finiteMetric(value);
  if (n === null) return "—";
  return `${n.toFixed(1)}×`;
}

/** Shares per minute over the latest 5m window. */
export function formatScreenerVolumeVelocity(
  value: string | number | null | undefined,
): string {
  const n = finiteMetric(value);
  if (n === null) return "—";
  return `${formatCompactNumber(n)}/min`;
}

/** Percent change in volume velocity vs the prior 5m window. */
export function formatScreenerVolumeAccelerationPct(
  value: string | number | null | undefined,
): string {
  const n = finiteMetric(value);
  if (n === null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(0)}%`;
}

export function formatScreenerMetric(
  value: string | number | null | undefined,
  format: string,
): string {
  const n = finiteMetric(value);
  switch (format) {
    case "price":
      return n === null ? "—" : `$${n.toFixed(2)}`;
    case "percent": {
      if (n === null) return "—";
      const sign = n > 0 ? "+" : "";
      return `${sign}${n.toFixed(1)}%`;
    }
    case "multiplier":
    case "daily_rvol":
      return formatScreenerRvol20d(value);
    case "rvol_5m":
      return formatScreenerRvol5m(value);
    case "vol_velocity":
      return formatScreenerVolumeVelocity(value);
    case "vol_acceleration":
      return formatScreenerVolumeAccelerationPct(value);
    case "dollar_volume":
      return formatScreenerDollarVolumeValue(value);
    case "volume":
    case "shares":
      return formatCompactNumber(value);
    case "rank":
      return n === null ? "—" : `#${n.toFixed(0)}`;
    case "trade_quality":
      return n === null ? "—" : String(Math.round(n));
    case "trigger_time":
      return value === null || value === undefined || value === "" ? "—" : String(value);
    case "text":
    default:
      return value === null || value === undefined || value === "" ? "—" : String(value);
  }
}
