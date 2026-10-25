import {
  buildHistoricalMemoryFromRepeatMoverContext,
  type HistoricalMemoryFacts,
} from "@/lib/ai-analyst/historical-memory";
import {
  handoffIdentity,
  repeatMoverContextMatchesHandoff,
} from "@/lib/historical-workflow/historical-handoff-identity";
import type { RepeatMoverContext } from "@/types/repeat-mover";
import type { SecurityId } from "@/types/security-identity";

export const RADAR_HISTORICAL_SESSION_PREFIX = "stocksist-radar-historical:";
export const RADAR_HISTORICAL_FACTS_PREFIX = "stocksist-radar-historical-facts:";

/** Best-effort cache so AI Analyst can reuse Radar-fetched RepeatMoverContext. */
export function persistRadarHistoricalContextForAnalyst(
  symbol: string,
  context: RepeatMoverContext | null | undefined,
): void {
  if (!context || typeof sessionStorage === "undefined") return;
  const identity = handoffIdentity(symbol, context.securityId);
  if (!identity || !repeatMoverContextMatchesHandoff(identity, context)) return;
  const symbolKey = identity.symbol;
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

export function readRadarHistoricalFacts(
  symbol: string,
  hint?: { securityId?: SecurityId | null },
): HistoricalMemoryFacts | null {
  if (typeof sessionStorage === "undefined") return null;
  const identity = handoffIdentity(symbol, hint?.securityId);
  if (!identity) return null;
  try {
    const raw = sessionStorage.getItem(`${RADAR_HISTORICAL_FACTS_PREFIX}${identity.symbol}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HistoricalMemoryFacts;
    if (!parsed || parsed.contextLoaded !== true) return null;
    const factsSymbol = typeof parsed.symbol === "string" ? parsed.symbol.trim().toUpperCase() : null;
    if (factsSymbol && factsSymbol !== identity.symbol) return null;
    if (identity.securityId && parsed.securityId && parsed.securityId !== identity.securityId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
