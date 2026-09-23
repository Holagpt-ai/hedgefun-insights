import type { ScannerEventType } from "../radar-v22/scanner-events.ts";

/** One transition = one alert (symbol + type + canonical triggered_at). */
export function scannerAlertDedupeKey(input: {
  trading_date: string;
  symbol: string;
  event_type: ScannerEventType;
  event_at: string;
}): string {
  const sym = input.symbol.trim().toUpperCase();
  const at = input.event_at.trim();
  return `scanner_v1:${input.trading_date}:${sym}:${input.event_type}:${at}`;
}
