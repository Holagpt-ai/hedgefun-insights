import { PROCESS_SCORE_VERSION } from "./process-score";
import { resolveInitialRisk } from "./planned-risk";
import type {
  AuditEventType,
  TradeAuditRecord,
  TradeCalculation,
  TradeInput,
  TradeRiskEvidence,
  TradeStatus,
} from "./types";

function auditEventType(status: TradeStatus, remainingQuantity: bigint): AuditEventType {
  if (remainingQuantity > 0n && status === "partially_closed") return "partial_position";
  if (remainingQuantity > 0n || status === "open" || status === "planned" || status === "draft") {
    return "open_position";
  }
  if (status === "cancelled") return "unavailable";
  return "closed_position";
}

export function buildTradeRiskEvidence(trade: TradeInput, calc: TradeCalculation): TradeRiskEvidence {
  const resolved = resolveInitialRisk(trade);
  return {
    plannedEntry: resolved.plannedEntry,
    plannedStop: resolved.plannedStop,
    plannedQuantity: resolved.plannedQuantity,
    riskPerShare: resolved.riskPerShare,
    plannedRisk: calc.initialRisk,
    plannedRiskSource: calc.plannedRiskSource,
    netPnl: calc.netRealizedPnl,
    rMultiple: calc.rMultiple,
    calculationVersion: calc.calculationVersion,
    inputVersion: calc.inputVersion,
    processScoreVersion: PROCESS_SCORE_VERSION,
  };
}

export function buildTradeAuditRecord(
  trade: TradeInput,
  calc: TradeCalculation,
  options?: { demo?: boolean; demoLabel?: string },
): TradeAuditRecord {
  const lastExecution = [...trade.executions].sort((a, b) => a.timestampUtc.localeCompare(b.timestampUtc)).at(-1);
  return {
    calculationVersion: calc.calculationVersion,
    inputVersion: calc.inputVersion,
    eventType: auditEventType(calc.status, calc.remainingQuantity),
    inputSummary: {
      symbol: trade.symbol,
      direction: trade.direction,
      assetClass: trade.assetClass,
      plannedEntry: trade.plannedEntry ?? null,
      plannedStop: trade.plannedStop ?? null,
      plannedSize: trade.plannedSize ?? null,
      storedPlannedRisk: trade.plannedRisk ?? null,
      executionCount: trade.executions.length,
    },
    plannedRiskSource: calc.plannedRiskSource,
    grossPnl: calc.grossRealizedPnl,
    fees: calc.totalFees,
    netPnl: calc.netRealizedPnl,
    rMultiple: calc.rMultiple,
    timestamp: lastExecution?.timestampUtc ?? (trade.sessionDate ? `${trade.sessionDate}T20:00:00Z` : "2026-08-14T20:00:00Z"),
    demoLabel: options?.demo ? (options.demoLabel ?? "DEMO WORKSPACE — illustrative calculation evidence") : null,
    exclusions: calc.exclusions,
  };
}
