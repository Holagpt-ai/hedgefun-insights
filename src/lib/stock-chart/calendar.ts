import { getEtParts, previousTradingDay as prevTradingDay } from "@/lib/market-calendar";

export function fmtEtDate(now: Date): string {
  return getEtParts(now).date;
}

export function previousTradingDay(date: string) {
  return prevTradingDay(date);
}
