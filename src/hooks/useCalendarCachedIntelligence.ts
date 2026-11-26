import { useWatchlistAI } from "@/hooks/useWatchlistAI";

/** Cached watchlist AI rows — no live Anthropic on the calendar surface. */
export function useCalendarCachedIntelligence(symbols: string[]) {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))].slice(0, 8);
  return useWatchlistAI(unique);
}