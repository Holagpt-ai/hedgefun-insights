import { derivedJournalEquity, reconcileBalances } from "../calc/reconciliation";
import type { Micros } from "../calc/decimal";
import type { ReconciliationResult } from "../calc/types";
import type { CashLedgerEntry } from "../calc/reconciliation";

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
      reconciliationState: reconcileBalances({
        derivedEquity: 0n,
        reportedBalance: reported,
        reportedAsOf: params.reportedAsOf ?? null,
      }),
    };
  }

  const equity = derivedJournalEquity({
    beginningBalance: params.beginningBalance,
    cashFlows: params.cashFlows ?? [],
    realizedPnl: params.realizedPnl,
  });

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
