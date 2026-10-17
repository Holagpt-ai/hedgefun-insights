import type { ChartGranularity } from "./chart-ranges";

export interface ChartDisplayMeta {
  granularity: ChartGranularity;
  lastObservedAt: string | null;
  usesPriorSessionFallback: boolean;
}

export function formatChartDataDisclosure(meta: ChartDisplayMeta | null): string | null {
  if (!meta?.lastObservedAt) return null;
  const observed = new Date(meta.lastObservedAt).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  if (meta.usesPriorSessionFallback) {
    return `Chart data as of ${observed} · Previous regular session (1D fallback)`;
  }
  return `Chart data as of ${observed}`;
}
