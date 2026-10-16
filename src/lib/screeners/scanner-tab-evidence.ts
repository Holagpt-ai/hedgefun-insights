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
      const event =
        row.range_event === "both"
          ? "New 52W high and low"
          : row.range_event === "new_high"
            ? "New 52W high"
            : "New 52W low";
      const highBase =
        row.high_52w !== null ? formatScreenerMetric(row.high_52w, "price") : "—";
      const lowBase =
        row.low_52w !== null ? formatScreenerMetric(row.low_52w, "price") : "—";
      const detail =
        row.range_event === "both"
          ? `Prior 52W high ${highBase} · prior 52W low ${lowBase}`
          : row.range_event === "new_low"
            ? `Prior 52W low ${lowBase}`
            : `Prior 52W high ${highBase}`;
      return {
        tabId,
        primaryLabel: event,
        detail,
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
        if (accel < 0) {
          return {
            tabId,
            primaryLabel: `Historical volume spike · cooling ${accel.toFixed(0)}%`,
            detail: "The trigger remains. Current 5-minute acceleration is negative.",
          };
        }
        return {
          tabId,
          primaryLabel: `Accelerating ${accel.toFixed(0)}%`,
          detail: "Current 5-minute volume rate is above the prior window.",
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
