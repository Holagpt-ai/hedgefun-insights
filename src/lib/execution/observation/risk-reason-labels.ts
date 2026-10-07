import type { RiskReasonCode } from "@/lib/execution/risk/reason-codes";

/** Display labels for RiskGateway reason codes (observation UI only). */
export const RISK_REASON_LABELS: Record<RiskReasonCode, string> = {
  APPROVED: "Approved",
  TRADING_DISABLED: "Trading disabled",
  GLOBAL_KILL_SWITCH: "Kill switch",
  STRATEGY_KILL_SWITCH: "Strategy kill switch",
  SYMBOL_KILL_SWITCH: "Symbol kill switch",
  STALE_MARKET_DATA: "Stale market data",
  MARKET_HALTED: "Market halted",
  SYMBOL_NOT_ALLOWED: "Symbol not allowed",
  STRATEGY_NOT_ALLOWED: "Strategy not allowed",
  SPREAD_TOO_WIDE: "Spread too wide",
  INSUFFICIENT_LIQUIDITY: "Insufficient liquidity",
  MAX_DAILY_LOSS: "Daily loss limit",
  MAX_POSITION_RISK: "Position risk limit",
  MAX_POSITION_NOTIONAL: "Position notional limit",
  MAX_TRADE_NOTIONAL: "Trade notional limit",
  MAX_PORTFOLIO_EXPOSURE: "Portfolio exposure limit",
  MAX_OPEN_POSITIONS: "Open position limit",
  DUPLICATE_ORDER: "Duplicate intent",
  SYMBOL_COOLDOWN: "Symbol cooldown",
  INSUFFICIENT_BUYING_POWER: "Insufficient buying power",
  INVALID_TRADE_INTENT: "Invalid trade intent",
  EXECUTION_MODE_OBSERVE: "Observe mode",
  LIVE_EXECUTION_DISABLED: "Live execution disabled",
};

export function labelRiskReason(code: string): string {
  return (RISK_REASON_LABELS as Record<string, string>)[code] ?? code;
}
