import { parseDecimal } from "../calc/decimal";
import { derivedJournalEquity, reconcileBalances } from "../calc/reconciliation";
import type { Micros } from "../calc/decimal";
import type { ReconciliationResult } from "../calc/types";
import type { CashLedgerEntry } from "../calc/reconciliation";

export function unavailableJournalReconciliation(reportedBalance: number | null): ReconciliationResult {
  const reportedMicros =
    reportedBalance != null && Number.isFinite(reportedBalance)
      ? parseDecimal(reportedBalance)
      : null;
  return {
    derivedEquity: 0n,
    reportedBalance: reportedMicros,
    difference: null,
    state: "pending_review",
  };
}

export interface JournalEquityView {
  equity: Micros | null;
  equityAvailable: boolean;
  reconciliationState: ReconciliationResult;
}

export function resolveJournalEquityView(params: {
  beginningBalance: number | null | undefined;
  reportedBalance: number | null | undefined;
  reportedAsOf?: string | null;
  realizedPnl: Micros;
  cashFlows?: CashLedgerEntry[];
}): JournalEquityView {
  const reported = params.reportedBalance ?? null;

  if (params.beginningBalance == null) {
    return {
      equity: null,
      equityAvailable: false,
      reconciliationState: unavailableJournalReconciliation(reported),
    };
  }

  const equity = derivedJournalEquity({
    beginningBalance: params.beginningBalance,
    cashFlows: params.cashFlows ?? [],
    realizedPnl: params.realizedPnl,
  });

  if (reported == null) {
    return {
      equity,
      equityAvailable: true,
      reconciliationState: unavailableJournalReconciliation(null),
    };
  }

  return {
    equity,
    equityAvailable: true,
    reconciliationState: reconcileBalances({
      derivedEquity: equity,
      reportedBalance: reported,
      reportedAsOf: params.reportedAsOf ?? null,
    }),
  };
}

export function formatBalanceDisplay(value: number | null | undefined, language = "en"): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(language === "es" ? "es-ES" : "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}
