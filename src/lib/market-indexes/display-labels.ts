/**
 * Truthful display names for market-index strip instruments.
 * Values are ETF/security prices from Polygon via `market_indexes`, not
 * spot commodity, yield, or cash-index levels.
 */

export const INDEX_DISPLAY_LABELS: Readonly<Record<string, string>> = {
  SPY: "S&P 500 ETF",
  QQQ: "Nasdaq 100 ETF",
  DIA: "Dow Jones ETF",
  IWM: "Russell 2000 ETF",
  VIXY: "VIX ETF",
  GLD: "Gold ETF",
  SLV: "Silver ETF",
  IBIT: "Bitcoin ETF",
  BNO: "Brent Crude ETF",
  UNG: "Nat Gas ETF",
  TLT: "20Y Treasury ETF",
  UUP: "US Dollar ETF",
};

/** Known-symbol truthful label; otherwise stored name or the ticker itself. Never invents a commodity/yield. */
export function indexDisplayLabel(symbol: string, storedName?: string | null): string {
  const mapped = INDEX_DISPLAY_LABELS[symbol];
  if (mapped) return mapped;
  if (typeof storedName === "string" && storedName.trim().length > 0) return storedName.trim();
  return symbol;
}
