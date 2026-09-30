/**
 * Day Trade Radar qualification funnel with explicit rejection reason codes.
 */

import { finiteMetric } from "@/lib/screeners/screener-metric-display";
import {
  LEGACY_MOVE_MIN_PCT,
  LEGACY_PRICE_MAX,
  LEGACY_PRICE_MIN,
} from "@/lib/screeners/legacy-confirmation";
import {
  aggregateRejectionSummary,
  type ScannerFunnelStats,
  type ScannerQualificationReasonCode,
  type ScannerQualificationState,
} from "@/lib/screeners/scanner-qualification-funnel";
import {
  evaluateDayTradeEligibility,
  meetsDayTradeParticipation,
  qualifiesDayTradeMomentum,
} from "./day-trade-strategy";
import { qualifiesDayTradeFreshness } from "./day-trade-freshness";
import type { RadarRankedRow } from "./types";

export function dayTradeRejectionReasons(
  row: RadarRankedRow,
  nowMs: number,
): ScannerQualificationReasonCode[] {
  const reasons: ScannerQualificationReasonCode[] = [];
  const price = finiteMetric(row.price);
  if (price === null) {
    reasons.push("MISSING_REQUIRED_DATA");
  } else {
    if (price < LEGACY_PRICE_MIN) reasons.push("PRICE_BELOW_MIN");
    if (price > LEGACY_PRICE_MAX) reasons.push("PRICE_ABOVE_MAX");
  }

  const move = finiteMetric(row.change_percent);
  if (move === null) {
    reasons.push("MISSING_REQUIRED_DATA");
  } else if (move < LEGACY_MOVE_MIN_PCT) {
    reasons.push("MOMENTUM_TOO_WEAK");
  }

  const eligibility = evaluateDayTradeEligibility(row);
  if (eligibility.floatGate === "fail_high_float") reasons.push("FLOAT_TOO_HIGH");

  const participation = meetsDayTradeParticipation(row);
  const hasParticipation =
    participation.classicRvol !== null ||
    finiteMetric(row.volume_ratio_prior_session) !== null ||
    finiteMetric(row.rvol_5m) !== null ||
    finiteMetric(row.time_adjusted_rvol) !== null;
  if (!hasParticipation) {
    reasons.push("MISSING_REQUIRED_DATA");
  } else if (!participation.pass) {
    reasons.push("INSUFFICIENT_RVOL");
  }

  if (qualifiesDayTradeMomentum(row) && !qualifiesDayTradeFreshness(row, nowMs)) {
    reasons.push("FRESHNESS_REJECTED");
  }

  return [...new Set(reasons)];
}

export function evaluateDayTradeQualification(
  row: RadarRankedRow,
  nowMs: number,
  opts?: { ranked?: boolean; displayed?: boolean },
): ScannerQualificationState {
  const reasonCodes = dayTradeRejectionReasons(row, nowMs);
  const strategyPass = qualifiesDayTradeMomentum(row);
  const freshPass = strategyPass && qualifiesDayTradeFreshness(row, nowMs);
  const qualified = freshPass;

  let status: ScannerQualificationState["status"] = "DETECTED";
  if (qualified) status = "QUALIFIED";
  if (opts?.ranked) status = "RANKED";
  if (opts?.displayed) status = "DISPLAYED";

  return {
    status,
    qualified,
    reasonCodes: qualified ? [] : reasonCodes,
  };
}

export function buildDayTradeFunnelStats(input: {
  detected: readonly RadarRankedRow[];
  qualified: readonly RadarRankedRow[];
  priority: readonly RadarRankedRow[];
  displayed: readonly RadarRankedRow[];
  nowMs: number;
}): ScannerFunnelStats {
  const rejections = input.detected
    .filter((row) => !input.qualified.some((q) => q.symbol === row.symbol))
    .map((row) => ({ reasonCodes: dayTradeRejectionReasons(row, input.nowMs) }));

  return {
    detectedCount: input.detected.length,
    qualifiedCount: input.qualified.length,
    priorityCount: input.priority.length,
    displayedCount: input.displayed.length,
    rejectionSummary: aggregateRejectionSummary(rejections),
  };
}
