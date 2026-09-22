import {
  radarHistoricalContextConfig,
  type RadarHistoricalContextConfig,
} from "@/config/radar-historical-context.config";
import { mapRadarEnrichmentRequest } from "@/lib/radar/map-radar-row-to-repeat-mover-input";
import type {
  RadarHistoricalContextEnrichmentRequest,
  RadarHistoricalContextEnrichmentResult,
  RadarHistoricalContextFields,
} from "@/lib/radar/radar-historical-context-types";
import type { RadarSecurityIdResolver } from "@/lib/radar/resolve-radar-security-id";
import type { RepeatMoverContextInput } from "@/lib/repeat-movers/normalize-repeat-mover-context";
import type { RepeatMoverContext } from "@/types/repeat-mover";
import type { SecurityId } from "@/types/security-identity";
import type { RadarV2ScreenerRow } from "@/lib/screeners/radar-v2-adapter";

export type RepeatMoverContextLoader = (input: {
  securityId: SecurityId;
  currentContext: RepeatMoverContextInput;
}) => Promise<RepeatMoverContext>;

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  if (!(timeoutMs > 0)) return promise;
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("radar_historical_context_timeout")), timeoutMs);
    }),
  ]);
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, concurrency);
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function toLoaderInput(
  request: RadarHistoricalContextEnrichmentRequest,
): RepeatMoverContextInput {
  return {
    symbol: request.symbol,
    movePct: request.movePct ?? null,
    volume: request.volume ?? null,
    rvol: request.rvol ?? null,
    dollarVolume: request.dollarVolume ?? null,
    direction: request.direction ?? null,
    tier: request.tier ?? null,
    sessionDate: request.sessionDate ?? null,
    recordedAt: request.recordedAt ?? null,
  };
}

export async function enrichRadarHistoricalContextBatch(input: {
  requests: readonly RadarHistoricalContextEnrichmentRequest[];
  resolveSecurityId: RadarSecurityIdResolver;
  loadContext: RepeatMoverContextLoader;
  config?: Partial<RadarHistoricalContextConfig>;
  nowMs?: number;
}): Promise<RadarHistoricalContextEnrichmentResult[]> {
  const config = radarHistoricalContextConfig(input.config);
  const capped = input.requests.slice(0, config.maxEnrichedSecurities);

  const batchWork = mapWithConcurrency(
    capped,
    config.concurrency,
    async (request) => {
      const symbol = request.symbol;
      let securityId = request.securityId ?? null;
      if (!securityId) {
        try {
          securityId = await withTimeout(
            input.resolveSecurityId(symbol),
            config.perSecurityTimeoutMs,
          );
        } catch {
          return { symbol, securityId: null, historicalContext: null };
        }
      }
      if (!securityId) {
        return { symbol, securityId: null, historicalContext: null };
      }
      try {
        const historicalContext = await withTimeout(
          input.loadContext({
            securityId,
            currentContext: toLoaderInput({ ...request, securityId }),
          }),
          config.perSecurityTimeoutMs,
        );
        return { symbol, securityId, historicalContext };
      } catch {
        return { symbol, securityId, historicalContext: null };
      }
    },
  );

  try {
    return await withTimeout(batchWork, config.batchTimeoutMs);
  } catch {
    return capped.map((request) => ({
      symbol: request.symbol,
      securityId: request.securityId ?? null,
      historicalContext: null,
    }));
  }
}

/**
 * Attaches historical context to already-ranked Radar rows.
 * Preserves row order, symbols, and rank-related fields.
 */
export async function attachHistoricalContextToRadarRows(
  rows: readonly RadarV2ScreenerRow[],
  deps: {
    resolveSecurityId: RadarSecurityIdResolver;
    loadContext: RepeatMoverContextLoader;
    config?: Partial<RadarHistoricalContextConfig>;
  },
): Promise<Array<RadarV2ScreenerRow & RadarHistoricalContextFields>> {
  if (rows.length === 0) return [];

  const requests = rows.map((row) => mapRadarEnrichmentRequest(row));
  const enriched = await enrichRadarHistoricalContextBatch({
    requests,
    resolveSecurityId: deps.resolveSecurityId,
    loadContext: deps.loadContext,
    config: deps.config,
  });
  const bySymbol = new Map(enriched.map((entry) => [entry.symbol, entry]));

  return rows.map((row) => {
    const match = bySymbol.get(row.symbol);
    if (!match) {
      return { ...row, securityId: row.securityId ?? null, historicalContext: null };
    }
    return {
      ...row,
      securityId: match.securityId,
      historicalContext: match.historicalContext,
    };
  });
}

/** Stable rank fingerprint for tests — rank must not change after enrichment. */
export function radarRowRankFingerprint(
  rows: readonly Pick<RadarV2ScreenerRow, "symbol" | "volume" | "radar_rank">[],
): string {
  return rows.map((row) =>
    `${row.symbol}:${row.volume ?? "null"}:${row.radar_rank ?? "null"}`,
  ).join("|");
}
