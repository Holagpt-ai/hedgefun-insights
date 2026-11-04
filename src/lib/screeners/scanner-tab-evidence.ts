/**
 * Scanner-specific qualification evidence — answers "why is this ticker here?"
 */

import type { ScreenerResultRow } from "@/lib/screeners/contract";
import type { ManagedTabId } from "@/lib/screeners/contract";
import { formatScreenerMetric } from "@/lib/screeners/screener-metric-display";
import {
  resolveUnusualVolumeQualificationSignal,
  type RadarTabCandidate,
} from "@/lib/screeners/scanner-tab-qualification";

function screenerRowAsRadarTabCandidate(row: ScreenerResultRow): RadarTabCandidate {
  const extended = row as ScreenerResultRow & { time_adjusted_rvol?: number | null };
  return {
    symbol: row.symbol,
    last_price: row.price,
    session_volume: row.volume,
    prior_session_volume: row.prior_session_volume,
    volume_velocity: null,
    volume_acceleration_pct: null,
    volume_60s: null,
    time_adjusted_rvol: extended.time_adjusted_rvol ?? null,
  };
}

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
      const candidate = screenerRowAsRadarTabCandidate(row);
      const { signal, priorRatio, timeAdjustedRvol } =
        resolveUnusualVolumeQualificationSignal(candidate);
      if (signal === "prior_session_ratio" && priorRatio !== null) {
        return {
          tabId,
          primaryLabel: `Vol/Yday ${formatScreenerMetric(priorRatio, "multiplier")}`,
          detail: "Verified prior-session volume ratio ≥4×",
        };
      }
      if (signal === "time_adjusted_rvol" && timeAdjustedRvol !== null) {
        return {
          tabId,
          primaryLabel: `Time-adjusted RVOL ${formatScreenerMetric(timeAdjustedRvol, "multiplier")}`,
          detail: "Session participation vs same-time-of-day baseline (≥2×)",
        };
      }
      if (priorRatio !== null && priorRatio > 0) {
        return {
          tabId,
          primaryLabel: `Vol/Yday ${formatScreenerMetric(priorRatio, "multiplier")}`,
          detail:
            "Tab membership may use radar fields not shown here — qualifying signal unavailable on this row",
        };
      }
      if (timeAdjustedRvol !== null) {
        return {
          tabId,
          primaryLabel: `Time-adjusted RVOL ${formatScreenerMetric(timeAdjustedRvol, "multiplier")}`,
          detail:
            "Tab membership may use radar fields not shown here — qualifying signal unavailable on this row",
        };
      }
      return {
        tabId,
        primaryLabel: "Unusual volume",
        detail:
          "Qualifying signal not available on this row — prior-session ratio and time-adjusted RVOL are missing",
      };
    }
    default:
      return null;
  }
}
