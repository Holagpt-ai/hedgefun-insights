import {
  buildHistoricalMemoryFromRepeatMoverContext,
  unavailableHistoricalMemory,
  type HistoricalMemoryFacts,
} from "@/lib/ai-analyst/historical-memory";
import {
  handoffIdentity,
  repeatMoverContextMatchesHandoff,
} from "@/lib/historical-workflow/historical-handoff-identity";
import { persistHistoricalWorkflowHandoff } from "@/lib/historical-workflow/workflow-handoff-storage";
import { coerceRepeatMoverContextForDisplay } from "@/lib/radar/coerce-repeat-mover-context-for-display";
import { fetchRadarHistoricalContextBatch } from "@/lib/radar/radar-historical-context-client";
import { readRadarHistoricalFacts } from "@/lib/ai-analyst/radar-historical-handoff";
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
    const coerced = coerceRepeatMoverContextForDisplay(input.preloadedContext) ?? input.preloadedContext;
    const identity = handoffIdentity(symbol, coerced.securityId);
    if (!identity || !repeatMoverContextMatchesHandoff(identity, coerced)) {
      return unavailableHistoricalMemory(symbol);
    }
    persistHistoricalWorkflowHandoff(coerced, {
      symbol,
      sourceSurface: "ai_analyst",
      securityId: coerced.securityId,
    });
    return buildHistoricalMemoryFromRepeatMoverContext(coerced, symbol);
  }

  const url = radarHistoricalContextUrl();
  if (!url || !input.accessToken) {
    return readRadarHistoricalFacts(symbol) ?? unavailableHistoricalMemory(symbol);
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
    const match = batch.results.find((row) => row.symbol.trim().toUpperCase() === symbol);
    const historicalContext = match?.historicalContext != null
      ? coerceRepeatMoverContextForDisplay(match.historicalContext)
      : null;
    const identity = handoffIdentity(symbol, match?.securityId ?? historicalContext?.securityId ?? null);
    if (
      historicalContext
      && identity
      && repeatMoverContextMatchesHandoff(identity, historicalContext)
    ) {
      persistHistoricalWorkflowHandoff(historicalContext, {
        symbol,
        sourceSurface: "ai_analyst",
        securityId: historicalContext.securityId,
      });
    }
    const fromNetwork = buildHistoricalMemoryFromRepeatMoverContext(historicalContext, symbol);
    if (fromNetwork.contextLoaded) return fromNetwork;
    return readRadarHistoricalFacts(symbol) ?? fromNetwork;
  } catch {
    return readRadarHistoricalFacts(symbol) ?? unavailableHistoricalMemory(symbol);
  }
}
