import { useMemo } from "react";
import { useRecentCatalystEnrichment } from "@/hooks/useRecentCatalystEnrichment";
import {
  MARKET_PULSE_CAUSATION_DISCLAIMER,
  resolveVerifiedCatalystForPulse,
} from "@/lib/markets/market-pulse-catalyst";
import type { MarketPulseVerifiedCatalyst } from "@/lib/markets/market-pulse-contract";

export type PublicStockCatalystState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "unavailable" }
  | { status: "none" }
  | { status: "verified"; catalyst: MarketPulseVerifiedCatalyst; disclaimer: string };

export function usePublicStockCatalystSummary(
  symbol: string,
  observationMs: number | null,
): PublicStockCatalystState {
  const sym = symbol.trim().toUpperCase();
  const query = useRecentCatalystEnrichment(sym ? [sym] : [], "market_pulse");
  return useMemo(() => {
    if (!sym) return { status: "idle" };
    if (query.isError) return { status: "unavailable" };
    if (query.isPending || (query.isFetching && !query.data)) return { status: "pending" };
    const entry = query.data?.get(sym);
    const verified = resolveVerifiedCatalystForPulse({
      symbol: sym,
      entry,
      observationMs,
      sessionEvidence: "delayed_snapshot",
      nowMs: Date.now(),
      requirePriceObservationMs: false,
    });
    if (verified) {
      return {
        status: "verified",
        catalyst: verified,
        disclaimer: MARKET_PULSE_CAUSATION_DISCLAIMER,
      };
    }
    return { status: "none" };
  }, [sym, query.data, query.isError, query.isFetching, query.isPending, observationMs]);
}
