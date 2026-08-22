import { add, parseDecimal, sub, type Micros } from "./decimal";
import { RECONCILIATION_TOLERANCE } from "./engine";
import type { ReconciliationResult } from "./types";

export interface CashLedgerEntry {
  type: string;
  amount: number | string;
  status?: "posted" | "pending" | "void";
}

export function derivedJournalEquity(params: {
  beginningBalance: number | string;
  cashFlows: CashLedgerEntry[];
  realizedPnl: Micros;
  markToMarket?: Micros | null;
}): Micros {
  let equity = parseDecimal(params.beginningBalance);
  for (const flow of params.cashFlows) {
    if (flow.status && flow.status !== "posted") continue;
    equity = add(equity, parseDecimal(flow.amount));
  }
  equity = add(equity, params.realizedPnl);
  if (params.markToMarket != null) {
    equity = add(equity, params.markToMarket);
  }
  return equity;
}

export function reconcileBalances(params: {
  derivedEquity: Micros;
  reportedBalance: number | string | null;
  reportedAsOf?: string | null;
  staleAfterHours?: number;
}): ReconciliationResult {
  if (params.reportedBalance == null || params.reportedBalance === "") {
    return {
      derivedEquity: params.derivedEquity,
      reportedBalance: null,
      difference: null,
      state: "missing_balance",
    };
  }
  const reported = parseDecimal(params.reportedBalance);
  const difference = sub(reported, params.derivedEquity);
  const absDiff = difference < 0n ? -difference : difference;
  if (params.reportedAsOf && params.staleAfterHours) {
    const ageMs = Date.now() - Date.parse(params.reportedAsOf);
    if (ageMs > params.staleAfterHours * 3600_000) {
      return {
        derivedEquity: params.derivedEquity,
        reportedBalance: reported,
        difference,
        state: "stale_balance",
      };
    }
  }
  if (absDiff === 0n) {
    return { derivedEquity: params.derivedEquity, reportedBalance: reported, difference, state: "reconciled" };
  }
  if (absDiff <= RECONCILIATION_TOLERANCE) {
    return { derivedEquity: params.derivedEquity, reportedBalance: reported, difference, state: "within_tolerance" };
  }
  return { derivedEquity: params.derivedEquity, reportedBalance: reported, difference, state: "mismatch" };
}
