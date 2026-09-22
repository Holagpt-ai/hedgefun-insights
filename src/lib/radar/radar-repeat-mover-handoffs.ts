import type { RadarRepeatMoverWorkflowHandoffs } from "@/lib/radar/radar-repeat-movers-types";

/** Symbol-aware routes aligned with AI Analyst / dashboard conventions. */
export function buildRepeatMoverWorkflowHandoffs(symbol: string): RadarRepeatMoverWorkflowHandoffs {
  const trimmed = symbol.trim().toUpperCase();
  const query = trimmed ? `?symbol=${encodeURIComponent(trimmed)}` : "";
  return {
    aiAnalyst: `/dashboard/ai${query}`,
    catalyst: `/dashboard/catalyst${query}`,
    watchlist: `/dashboard/watchlist${query}`,
    journal: `/dashboard/journal${query}`,
    actionCenter: "/dashboard/action-center",
  };
}
