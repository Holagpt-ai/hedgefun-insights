import type { SessionType } from "./contract.ts";
import type { AnalysisPresentation } from "./session.ts";

export type IntradayEmptyReason =
  | "NO_TRADING_SESSION"
  | "NO_BARS_YET"
  | "PROVIDER_EMPTY"
  | "PROVIDER_DELAYED"
  | "SYMBOL_UNSUPPORTED"
  | "SESSION_NOT_STARTED"
  | "SESSION_CLOSED_USE_PRIOR"
  | "REQUEST_ERROR"
  | "STALE_CACHE";

export interface IntradayRequestDiagnostic {
  symbol: string;
  requested_session: string;
  requested_date: string;
  provider_status: string;
  bars_returned: number;
  market_state: string;
  resolved_trading_day: string;
  cache_state: string;
  reason_code: IntradayEmptyReason | "ok";
}

/**
 * Empty provider arrays are not automatically errors.
 * A closed session that already resolved to the prior trading day and still
 * received zero bars is PROVIDER_EMPTY. SESSION_CLOSED_USE_PRIOR is reserved
 * for the successful prior-session path (bars present).
 */
export function classifyEmptyIntradayBars(input: {
  presentation: AnalysisPresentation;
  sessionType: SessionType;
  etMinutes: number;
  rawCount: number;
  keptCount: number;
  providerOk: boolean;
  providerDelayed: boolean;
}): IntradayEmptyReason | null {
  if (input.keptCount > 0) {
    return input.presentation === "last_completed" ? "SESSION_CLOSED_USE_PRIOR" : null;
  }
  if (!input.providerOk) return "REQUEST_ERROR";
  if (input.providerDelayed) return "PROVIDER_DELAYED";
  if (input.presentation === "last_completed") return "PROVIDER_EMPTY";
  if (input.etMinutes < 4 * 60) return "SESSION_NOT_STARTED";
  if (input.sessionType === "premarket") return "NO_BARS_YET";
  if (input.rawCount > 0) return "PROVIDER_EMPTY";
  return "PROVIDER_EMPTY";
}

export function intradayRequestDiagnostic(input: {
  symbol: string;
  sessionType: SessionType;
  sessionDate: string;
  presentation: AnalysisPresentation;
  providerStatus: string;
  barsReturned: number;
  cacheState: string;
  reason: IntradayEmptyReason | "ok";
}): IntradayRequestDiagnostic {
  return {
    symbol: input.symbol,
    requested_session: input.sessionType,
    requested_date: input.sessionDate,
    provider_status: input.providerStatus,
    bars_returned: input.barsReturned,
    market_state: input.presentation === "last_completed" ? "CLOSED" : "LIVE",
    resolved_trading_day: input.sessionDate,
    cache_state: input.cacheState,
    reason_code: input.reason,
  };
}
