import {
  buildHistoricalMemoryFromRepeatMoverContext,
  type HistoricalMemoryFacts,
} from "@/lib/ai-analyst/historical-memory";
import type { RepeatMoverContext } from "@/types/repeat-mover";

export const RADAR_HISTORICAL_SESSION_PREFIX = "stocksist-radar-historical:";
export const RADAR_HISTORICAL_FACTS_PREFIX = "stocksist-radar-historical-facts:";

/** Best-effort cache so AI Analyst can reuse Radar-fetched RepeatMoverContext. */
export function persistRadarHistoricalContextForAnalyst(
  symbol: string,
  context: RepeatMoverContext | null | undefined,
): void {
  if (!context || typeof sessionStorage === "undefined") return;
  const symbolKey = symbol.trim().toUpperCase();
  try {
    const facts = buildHistoricalMemoryFromRepeatMoverContext(context, symbolKey);
    sessionStorage.setItem(`${RADAR_HISTORICAL_FACTS_PREFIX}${symbolKey}`, JSON.stringify(facts));
  } catch {
    // Compact facts are best-effort; the raw context write below is independent.
  }
  try {
    sessionStorage.setItem(`${RADAR_HISTORICAL_SESSION_PREFIX}${symbolKey}`, JSON.stringify(context));
  } catch {
    // Ignore quota / privacy mode failures. Compact facts may still be readable.
  }
}

export function readRadarHistoricalFacts(symbol: string): HistoricalMemoryFacts | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${RADAR_HISTORICAL_FACTS_PREFIX}${symbol.trim().toUpperCase()}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HistoricalMemoryFacts;
    if (!parsed || parsed.contextLoaded !== true) return null;
    return parsed;
  } catch {
    return null;
  }
}
