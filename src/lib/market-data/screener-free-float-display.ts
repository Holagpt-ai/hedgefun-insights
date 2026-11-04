import { formatRadarContextVolume } from "@/features/day-trade-radar-v2/radar-metrics";
import { parseFloatMeasurementMs } from "@/lib/market-data/float";

export function formatFloatMeasurementAsOfLabel(asOf: string | null | undefined): string | null {
  const ms = parseFloatMeasurementMs(asOf);
  if (ms === null) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(ms));
}

export function formatScreenerVerifiedFreeFloat(
  shares: number | null | undefined,
  opts?: { pending?: boolean; measurementAsOf?: string | null },
): string {
  if (opts?.pending && (shares === null || shares === undefined)) return "…";
  const volume = formatRadarContextVolume(shares);
  const asOfLabel = formatFloatMeasurementAsOfLabel(opts?.measurementAsOf);
  if (volume === "Unavailable" || !asOfLabel) return volume;
  return `${volume} (as of ${asOfLabel})`;
}
