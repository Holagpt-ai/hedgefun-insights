import {
  buildHistoricalMemoryFromRepeatMoverContext,
  unavailableHistoricalMemory,
  type HistoricalMemoryFacts,
} from "@/lib/ai-analyst/historical-memory";
import { fetchRadarHistoricalContextBatch } from "@/lib/radar/radar-historical-context-client";
import { normalizeRadarSymbol } from "@/lib/radar/resolve-radar-security-id";
import type { RepeatMoverContext } from "@/types/repeat-mover";

const HISTORICAL_MEMORY_FETCH_TIMEOUT_MS = 8_000;

function radarHistoricalContextUrl(): string | null {
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (typeof base !== "string" || !base.startsWith("http")) return null;
  return `${base.replace(/\/$/, "")}/functions/v1/radar-historical-context`;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("historical_memory_timeout")), ms);
    }),
  ]);
}

/**
 * Loads same-security Repeat Mover context for AI Analyst (fail-soft).
 * Reuses preloaded Radar handoff when provided.
 */
export async function fetchAnalystHistoricalMemory(input: {
  symbol: string;
  accessToken?: string;
  preloadedContext?: RepeatMoverContext | null;
  fetchImpl?: typeof fetch;
}): Promise<HistoricalMemoryFacts> {
  const symbol = normalizeRadarSymbol(input.symbol);
  if (!symbol) return unavailableHistoricalMemory(null);

  if (input.preloadedContext) {
    return buildHistoricalMemoryFromRepeatMoverContext(input.preloadedContext, symbol);
  }

  const url = radarHistoricalContextUrl();
  if (!url || !input.accessToken) {
    return unavailableHistoricalMemory(symbol);
  }

  try {
    const batch = await withTimeout(
      fetchRadarHistoricalContextBatch({
        url,
        accessToken: input.accessToken,
        requests: [{ symbol }],
        fetchImpl: input.fetchImpl,
      }),
      HISTORICAL_MEMORY_FETCH_TIMEOUT_MS,
    );
    const match = batch.results.find((row) => row.symbol === symbol)
      ?? batch.results[0];
    return buildHistoricalMemoryFromRepeatMoverContext(
      match?.historicalContext ?? null,
      symbol,
    );
  } catch {
    return unavailableHistoricalMemory(symbol);
  }
}
