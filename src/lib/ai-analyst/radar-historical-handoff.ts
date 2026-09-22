import type { RepeatMoverContext } from "@/types/repeat-mover";

export const RADAR_HISTORICAL_SESSION_PREFIX = "stocksist-radar-historical:";

/** Best-effort cache so AI Analyst can reuse Radar-fetched RepeatMoverContext. */
export function persistRadarHistoricalContextForAnalyst(
  symbol: string,
  context: RepeatMoverContext | null | undefined,
): void {
  if (!context || typeof sessionStorage === "undefined") return;
  const key = `${RADAR_HISTORICAL_SESSION_PREFIX}${symbol.trim().toUpperCase()}`;
  try {
    sessionStorage.setItem(key, JSON.stringify(context));
  } catch {
    // Ignore quota / privacy mode failures.
  }
}
