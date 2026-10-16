import type {
  ContinuationRvolMetricKind,
  LateSessionContinuationContext,
} from "@/lib/am-inbox/late-session-continuation-types";
import { formatEtClock } from "@/lib/screeners/screener-trigger-time";

const METRIC_LABEL: Record<ContinuationRvolMetricKind, string> = {
  rvol_5m: "5m RVOL",
  time_adjusted: "Time-adjusted RVOL",
  rvol_20d: "20-day RVOL",
};

/** User-facing RVOL metric name — never infer 5m/20d when kind is unknown. */
export function continuationRvolMetricLabel(
  kind: ContinuationRvolMetricKind | null | undefined,
): string {
  if (kind && METRIC_LABEL[kind]) return METRIC_LABEL[kind];
  return "RVOL (window unverified)";
}

export function formatContinuationCapturedRvolValue(
  rvol: number | null | undefined,
  digits = 2,
): string {
  if (rvol === null || rvol === undefined || !Number.isFinite(rvol)) return "—";
  return rvol.toFixed(digits);
}

export function formatContinuationCaptureTimestampEt(
  sourceTimestamp: string | null | undefined,
): string | null {
  if (!sourceTimestamp || !Number.isFinite(Date.parse(sourceTimestamp))) return null;
  return formatEtClock(sourceTimestamp);
}

export interface ContinuationCapturedRvolDisplay {
  metricLabel: string;
  value: string;
  line: string;
}

export function buildContinuationCapturedRvolDisplay(
  context: Pick<LateSessionContinuationContext, "rvol" | "rvolMetricKind">,
): ContinuationCapturedRvolDisplay {
  const metricLabel = continuationRvolMetricLabel(context.rvolMetricKind);
  const value = formatContinuationCapturedRvolValue(context.rvol);
  return {
    metricLabel,
    value,
    line: value === "—" ? `${metricLabel}: —` : `${metricLabel}: ${value}`,
  };
}
