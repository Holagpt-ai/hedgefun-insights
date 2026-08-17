import { formatMoney, microsToNumber } from "../calc";
import type { Micros } from "../calc/decimal";
import type { TradeInput } from "../calc/types";

export function localeFor(language: string): string {
  return language === "es" ? "es-ES" : "en-US";
}

export function money(value: Micros, language = "en"): string {
  return formatMoney(value, localeFor(language));
}

export function moneyNumber(value: number, language = "en"): string {
  return new Intl.NumberFormat(localeFor(language), {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function signedMoney(value: Micros, language = "en"): string {
  const n = microsToNumber(value);
  const formatted = moneyNumber(Math.abs(n), language);
  if (n > 0) return `+${formatted}`;
  if (n < 0) return `−${formatted}`;
  return formatted;
}

export function pnlClass(value: Micros | number): "journal-gain" | "journal-loss" | "" {
  const n = typeof value === "number" ? value : microsToNumber(value);
  if (n > 0) return "journal-gain";
  if (n < 0) return "journal-loss";
  return "";
}

export function pct(value: number | null, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function ratio(value: number | null, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

/** Engine-derived Average R only. Never substitute HTML-mock Average R constants. */
export function formatAverageR(value: number | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}R`;
}

export function sampleLabel(n: number, language: string): string {
  return language === "es" ? `n=${n}` : `n=${n}`;
}

export function sessionOf(trade: TradeInput): string | null {
  return trade.sessionDate ?? trade.executions[0]?.timestampUtc.slice(0, 10) ?? null;
}

export function inRange(date: string | null, from: string, to: string): boolean {
  if (!date) return false;
  return date >= from && date <= to;
}
