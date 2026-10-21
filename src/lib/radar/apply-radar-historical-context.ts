import type {
  RadarV2Decision,
  RadarV2ScreenerRow,
  RadarV2ScreenerView,
} from "@/lib/screeners/radar-v2-adapter";
import { attachHistoricalContextToRadarRows } from "@/lib/radar/enrich-radar-historical-context";
import type { RepeatMoverContextLoader } from "@/lib/radar/enrich-radar-historical-context";
import type { RadarSecurityIdResolver } from "@/lib/radar/resolve-radar-security-id";
import type { RadarHistoricalContextConfig } from "@/config/radar-historical-context.config";
import { mapRadarEnrichmentRequest } from "@/lib/radar/map-radar-row-to-repeat-mover-input";
import { buildPrioritizedHistoricalBatches } from "@/lib/radar/radar-historical-context-priority";
import type { RadarHistoricalContextBatchResponse } from "@/lib/radar/radar-historical-context-client";
import { coerceRepeatMoverContextForDisplay } from "@/lib/radar/coerce-repeat-mover-context-for-display";
import {
  classifyHistoricalContextBatchResult,
  resolveHistoricalContextLoadStatus,
} from "@/lib/radar/radar-historical-context-classify";
export { resolveHistoricalContextLoadStatus } from "@/lib/radar/radar-historical-context-classify";

export function markHistoricalContextRowsPending(
  rows: readonly RadarV2ScreenerRow[],
): Array<RadarV2ScreenerRow> {
  return rows.map((row) => ({
    ...row,
    historicalContextLoadStatus: row.historicalContextLoadStatus ?? "pending",
  }));
}

/**
 * Post-rank enrichment for Radar V2 views. Does not mutate ranking inputs.
 */
export async function applyHistoricalContextToRadarView(
  view: RadarV2ScreenerView,
  deps: {
    resolveSecurityId: RadarSecurityIdResolver;
    loadContext: RepeatMoverContextLoader;
    config?: Partial<RadarHistoricalContextConfig>;
  },
): Promise<RadarV2ScreenerView> {
  const enrichedRows = await attachHistoricalContextToRadarRows(
    view.rows as RadarV2ScreenerRow[],
    deps,
  );
  return { ...view, rows: enrichedRows };
}

export function mergeHistoricalContextBatchIntoRows(
  rows: readonly RadarV2ScreenerRow[],
  batch: RadarHistoricalContextBatchResponse,
  options?: {
    failedSymbols?: ReadonlySet<string>;
    loadingSymbols?: ReadonlySet<string>;
  },
): Array<RadarV2ScreenerRow> {
  const bySymbol = new Map(batch.results.map((entry) => [entry.symbol.toUpperCase(), entry]));
  const failed = options?.failedSymbols;
  const loading = options?.loadingSymbols;
  return rows.map((row) => {
    const symbol = row.symbol.toUpperCase();
    if (loading?.has(symbol)) {
      return { ...row, historicalContextLoadStatus: "loading" as const };
    }
    if (failed?.has(symbol)) {
      return {
        ...row,
        historicalContext: row.historicalContext ?? null,
        historicalContextLoadStatus: row.historicalContext
          ? row.historicalContextLoadStatus ?? "available"
          : "failed",
      };
    }
    const match = bySymbol.get(symbol);
    if (!match) {
      return {
        ...row,
        historicalContext: row.historicalContext ?? null,
        historicalContextLoadStatus: row.historicalContextLoadStatus ?? "pending",
      };
    }
    const historicalContext = coerceRepeatMoverContextForDisplay(match.historicalContext);
    const loadStatus = classifyHistoricalContextBatchResult({
      historicalContext: match.historicalContext,
      priorContext: row.historicalContext ?? null,
    });
    return {
      ...row,
      securityId: match.securityId ?? row.securityId ?? null,
      historicalContext: historicalContext ?? row.historicalContext ?? null,
      historicalContextLoadStatus: historicalContext ? resolveHistoricalContextLoadStatus(historicalContext) : loadStatus,
    };
  });
}

export async function fetchAndMergeRadarHistoricalContext(input: {
  rows: readonly RadarV2ScreenerRow[];
  fetchBatch: (
    requests: ReturnType<typeof mapRadarEnrichmentRequest>[],
  ) => Promise<RadarHistoricalContextBatchResponse>;
}): Promise<Array<RadarV2ScreenerRow>> {
  if (input.rows.length === 0) return [];
  const batches = buildPrioritizedHistoricalBatches({ rows: input.rows });
  let merged = markHistoricalContextRowsPending(input.rows);
  for (const requests of batches) {
    const batch = await input.fetchBatch(requests);
    merged = mergeHistoricalContextBatchIntoRows(merged, batch);
  }
  return merged;
}

export async function applyHistoricalContextToRadarDecision(
  decision: RadarV2Decision,
  deps: {
    resolveSecurityId: RadarSecurityIdResolver;
    loadContext: RepeatMoverContextLoader;
    config?: Partial<RadarHistoricalContextConfig>;
  },
): Promise<RadarV2Decision> {
  if (!decision.view?.rows?.length) return decision;
  const view = await applyHistoricalContextToRadarView(decision.view, deps);
  return { ...decision, view };
}
