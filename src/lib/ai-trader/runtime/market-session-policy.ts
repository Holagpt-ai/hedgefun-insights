import {
  fallbackOpenSchedule,
  sessionKindAtMsOfDay,
  type ResolvedSessionSchedule,
} from "@/lib/equities-session-calendar";
import { easternParts } from "@/lib/market-session";
import { surveillanceTradingDateFromMs } from "@/lib/screeners/screener-session";
import type { AiTraderMarketSession } from "@/lib/ai-trader/runtime/contracts";

export function resolveAiTraderMarketSession(
  nowMs: number,
  schedule?: ResolvedSessionSchedule | null,
): AiTraderMarketSession {
  const parts = easternParts(nowMs);
  if (!parts) return "UNKNOWN";
  const sessionDate = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  const resolved = schedule ?? fallbackOpenSchedule(sessionDate);
  if (resolved.marketStatus === "closed") return "HOLIDAY";
  const kind = sessionKindAtMsOfDay(parts.msOfDay, resolved);
  if (resolved.marketStatus === "early_close" && kind !== "pre-market" && kind !== "market") {
    return "EARLY_CLOSE";
  }
  if (kind === "pre-market") return "PREMARKET";
  if (kind === "market") return "REGULAR";
  if (kind === "after-hours") return "AFTER_HOURS";
  if (kind === "closed") return "CLOSED";
  return "UNKNOWN";
}

export function resolveSurveillanceDate(nowMs: number): string | null {
  return surveillanceTradingDateFromMs(nowMs);
}
