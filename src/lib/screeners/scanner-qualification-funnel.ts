/**
 * Shared detected → qualified → priority → displayed funnel types.
 */

export type ScannerQualificationReasonCode =
  | "PRICE_BELOW_MIN"
  | "PRICE_ABOVE_MAX"
  | "INSUFFICIENT_VOLUME"
  | "INSUFFICIENT_DOLLAR_VOLUME"
  | "INSUFFICIENT_RVOL"
  | "SPREAD_TOO_WIDE"
  | "LIQUIDITY_TOO_LOW"
  | "MOMENTUM_TOO_WEAK"
  | "MISSING_REQUIRED_DATA"
  | "CATALYST_REQUIRED"
  | "FLOAT_TOO_HIGH"
  | "FRESHNESS_REJECTED"
  | "OPPORTUNITY_SCORE_TOO_LOW"
  | "SUB_DOLLAR_MAIN_DESK";

export interface ScannerQualificationState {
  status: "DETECTED" | "QUALIFIED" | "PRIORITY" | "RANKED" | "DISPLAYED";
  qualified: boolean;
  reasonCodes: ScannerQualificationReasonCode[];
}

export interface ScannerFunnelStats {
  detectedCount: number;
  qualifiedCount: number;
  priorityCount: number;
  displayedCount: number;
  rejectionSummary: Partial<Record<ScannerQualificationReasonCode, number>>;
}

export function aggregateRejectionSummary(
  entries: readonly { reasonCodes: readonly ScannerQualificationReasonCode[] }[],
): Partial<Record<ScannerQualificationReasonCode, number>> {
  const summary: Partial<Record<ScannerQualificationReasonCode, number>> = {};
  for (const entry of entries) {
    for (const code of entry.reasonCodes) {
      summary[code] = (summary[code] ?? 0) + 1;
    }
  }
  return summary;
}

export function formatRejectionSummaryCompact(
  summary: Partial<Record<ScannerQualificationReasonCode, number>>,
  maxLines = 4,
): string[] {
  const labels: Record<ScannerQualificationReasonCode, string> = {
    PRICE_BELOW_MIN: "below minimum price",
    PRICE_ABOVE_MAX: "above maximum price",
    INSUFFICIENT_VOLUME: "insufficient volume",
    INSUFFICIENT_DOLLAR_VOLUME: "insufficient liquidity",
    INSUFFICIENT_RVOL: "insufficient relative volume",
    SPREAD_TOO_WIDE: "spread too wide",
    LIQUIDITY_TOO_LOW: "liquidity too low",
    MOMENTUM_TOO_WEAK: "momentum too weak",
    MISSING_REQUIRED_DATA: "missing required data",
    CATALYST_REQUIRED: "catalyst required",
    FLOAT_TOO_HIGH: "float too high",
    FRESHNESS_REJECTED: "freshness rejected",
    OPPORTUNITY_SCORE_TOO_LOW: "opportunity score too low",
    SUB_DOLLAR_MAIN_DESK: "sub-dollar main desk filter",
  };
  const sorted = Object.entries(summary)
    .filter(([, count]) => (count ?? 0) > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  return sorted.slice(0, maxLines).map(([code, count]) => {
    const label = labels[code as ScannerQualificationReasonCode] ?? code;
    return `${count} ${label}`;
  });
}
