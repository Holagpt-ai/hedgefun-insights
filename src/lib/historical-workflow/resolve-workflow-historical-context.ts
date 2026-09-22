import { fetchAnalystHistoricalMemory } from "@/lib/ai-analyst/fetch-analyst-historical-memory";
import { fetchRadarHistoricalContextBatch } from "@/lib/radar/radar-historical-context-client";
import { deriveRepeatMoverProfileFreshness } from "@/lib/radar/radar-repeat-mover-freshness";
import {
  buildHistoricalWorkflowContext,
  unavailableHistoricalWorkflowContext,
} from "@/lib/historical-workflow/build-historical-workflow-context";
import type {
  HistoricalWorkflowSource,
  ResolvedWorkflowHistoricalContext,
} from "@/lib/historical-workflow/historical-workflow-types";
import {
  persistHistoricalWorkflowHandoff,
  readHistoricalWorkflowContext,
  readHistoricalWorkflowContextBySecurityId,
  readPreloadedRepeatMoverContext,
} from "@/lib/historical-workflow/workflow-handoff-storage";
import { normalizeHandoffSymbol } from "@/lib/watchlist-v2/handoff";
import type { RepeatMoverContext } from "@/types/repeat-mover";
import type { SecurityId } from "@/types/security-identity";

const inflight = new Map<string, Promise<ResolvedWorkflowHistoricalContext>>();

function radarHistoricalContextUrl(): string | null {
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (typeof base !== "string" || !base.startsWith("http")) return null;
  return `${base.replace(/\/$/, "")}/functions/v1/radar-historical-context`;
}

function cacheKey(symbol: string, securityId: SecurityId | null | undefined): string {
  return `${symbol}:${securityId ?? "none"}`;
}

function isRepeatMoverContextFresh(context: RepeatMoverContext, nowMs: number): boolean {
  if (!context.profile.profileAvailable) return false;
  return deriveRepeatMoverProfileFreshness({ profile: context.profile, nowMs }) !== "STALE";
}

function resolved(
  context: RepeatMoverContext | null,
  symbol: string,
  sourceSurface: HistoricalWorkflowSource,
  securityId: SecurityId | null,
  nowMs: number,
): ResolvedWorkflowHistoricalContext {
  if (context?.profile.profileAvailable) {
    persistHistoricalWorkflowHandoff(context, {
      symbol,
      sourceSurface,
      securityId: context.securityId ?? securityId,
      nowMs,
    });
    return {
      workflow: buildHistoricalWorkflowContext({
        symbol,
        securityId: context.securityId ?? securityId,
        sourceSurface,
        repeatMoverContext: context,
        nowMs,
      }),
      repeatMoverContextLoaded: true,
    };
  }

  const compact =
    readHistoricalWorkflowContext(symbol)
    ?? (securityId ? readHistoricalWorkflowContextBySecurityId(securityId) : null);

  if (compact) {
    return {
      workflow: {
        ...compact,
        symbol,
        securityId: compact.securityId ?? securityId,
        sourceSurface,
        handoffAt: new Date(nowMs).toISOString(),
      },
      repeatMoverContextLoaded: false,
    };
  }

  return {
    workflow: unavailableHistoricalWorkflowContext(symbol, sourceSurface, securityId),
    repeatMoverContextLoaded: false,
  };
}

async function refetchRepeatMoverContext(input: {
  symbol: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<RepeatMoverContext | null> {
  const url = radarHistoricalContextUrl();
  if (!url) return null;
  try {
    const batch = await fetchRadarHistoricalContextBatch({
      url,
      accessToken: input.accessToken,
      requests: [{ symbol: input.symbol }],
      fetchImpl: input.fetchImpl,
    });
    const match = batch.results.find((row) => row.symbol === input.symbol) ?? batch.results[0];
    return match?.historicalContext ?? null;
  } catch {
    return null;
  }
}

/**
 * 1) in-memory preloaded context
 * 2) session RepeatMoverContext (+ compact workflow)
 * 3) backend fetch by symbol (existing radar-historical-context)
 * 4) unavailable (fail-soft)
 */
export async function resolveWorkflowHistoricalContext(input: {
  symbol: string;
  securityId?: SecurityId | null;
  sourceSurface?: HistoricalWorkflowSource;
  preloadedRepeatMoverContext?: RepeatMoverContext | null;
  accessToken?: string;
  nowMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<ResolvedWorkflowHistoricalContext> {
  const symbol = normalizeHandoffSymbol(input.symbol);
  const sourceSurface = input.sourceSurface ?? "unknown";
  const nowMs = input.nowMs ?? Date.now();
  if (!symbol) {
    return {
      workflow: unavailableHistoricalWorkflowContext("", sourceSurface),
      repeatMoverContextLoaded: false,
    };
  }

  const key = cacheKey(symbol, input.securityId);
  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async (): Promise<ResolvedWorkflowHistoricalContext> => {
    const securityId =
      input.securityId
      ?? input.preloadedRepeatMoverContext?.securityId
      ?? readHistoricalWorkflowContext(symbol)?.securityId
      ?? null;

    let loaded: RepeatMoverContext | null = input.preloadedRepeatMoverContext ?? null;
    if (!loaded) {
      loaded = readPreloadedRepeatMoverContext(symbol);
    }

    if (loaded?.profile.profileAvailable && isRepeatMoverContextFresh(loaded, nowMs)) {
      return resolved(loaded, symbol, sourceSurface, securityId, nowMs);
    }

    const needsRefetch =
      !loaded?.profile.profileAvailable
      || (loaded?.profile.profileAvailable && !isRepeatMoverContextFresh(loaded, nowMs));

    if (needsRefetch && input.accessToken) {
      const refetched = await refetchRepeatMoverContext({
        symbol,
        accessToken: input.accessToken,
        fetchImpl: input.fetchImpl,
      });
      if (refetched?.profile.profileAvailable) {
        return resolved(refetched, symbol, sourceSurface, securityId, nowMs);
      }
      // AI path still builds facts; also warms nothing if fetch failed
      await fetchAnalystHistoricalMemory({
        symbol,
        accessToken: input.accessToken,
        preloadedContext: refetched,
        fetchImpl: input.fetchImpl,
      });
      const afterAi = readPreloadedRepeatMoverContext(symbol);
      if (afterAi?.profile.profileAvailable) {
        return resolved(afterAi, symbol, sourceSurface, securityId, nowMs);
      }
    }

    return resolved(loaded, symbol, sourceSurface, securityId, nowMs);
  })();

  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}

export function resetWorkflowHistoricalContextInflightForTests(): void {
  inflight.clear();
}
