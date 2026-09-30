/**
 * Scanner-specific qualification evidence — answers "why is this ticker here?"
 */

import type { ScreenerResultRow } from "@/lib/screeners/contract";
import type { ManagedTabId } from "@/lib/screeners/contract";
import { formatScreenerMetric } from "@/lib/screeners/screener-metric-display";

export interface ScannerTabEvidence {
  tabId: ManagedTabId | string;
  primaryLabel: string;
  detail?: string;
}

export function buildScannerTabEvidence(
  tabId: string,
  row: ScreenerResultRow,
): ScannerTabEvidence | null {
  switch (tabId) {
    case "gappers": {
      if (row.gap_percent === null) return null;
      const text = formatScreenerMetric(row.gap_percent, "percent");
      return {
        tabId,
        primaryLabel: `Gap ${text} vs prior close`,
      };
    }
    case "new_highs_lows": {
      if (!row.range_event) return null;
      const baseline =
        row.range_event === "new_low"
          ? row.low_52w
          : row.high_52w;
      const event =
        row.range_event === "both"
          ? "New 52W high and low"
          : row.range_event === "new_high"
            ? "New 52W high"
            : "New 52W low";
      const baselineText =
        baseline !== null ? formatScreenerMetric(baseline, "price") : "—";
      return {
        tabId,
        primaryLabel: event,
        detail: `Baseline ${baselineText}`,
      };
    }
    case "gainers_losers": {
      if (row.change_percent === null) return null;
      return {
        tabId,
        primaryLabel: `Move ${formatScreenerMetric(row.change_percent, "percent")}`,
      };
    }
    case "volume_spikes": {
      const accel = (row as ScreenerResultRow & { volume_acceleration_pct?: number | null })
        .volume_acceleration_pct;
      if (accel !== null && accel !== undefined && Number.isFinite(accel)) {
        return {
          tabId,
          primaryLabel: `Volume acceleration ${accel.toFixed(0)}%`,
        };
      }
      if (row.volume_ratio_prior_session !== null) {
        return {
          tabId,
          primaryLabel: `Vol/Yday ${formatScreenerMetric(row.volume_ratio_prior_session, "multiplier")}`,
          detail: "Short-window expansion context",
        };
      }
      return null;
    }
    case "unusual_volume": {
      if (row.rvol_20d !== null) {
        return {
          tabId,
          primaryLabel: `RVOL 20D ${formatScreenerMetric(row.rvol_20d, "multiplier")}`,
        };
      }
      if (row.volume_ratio_prior_session !== null) {
        return {
          tabId,
          primaryLabel: `Cumulative vol ${formatScreenerMetric(row.volume_ratio_prior_session, "multiplier")}× prior day`,
          detail: "Same-time RVOL unavailable — cumulative context only",
        };
      }
      return null;
    }
    default:
      return null;
  }
}
