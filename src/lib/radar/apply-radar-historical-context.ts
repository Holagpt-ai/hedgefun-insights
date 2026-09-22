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
import type { RadarHistoricalContextBatchResponse } from "@/lib/radar/radar-historical-context-client";

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
): Array<RadarV2ScreenerRow> {
  const bySymbol = new Map(batch.results.map((entry) => [entry.symbol, entry]));
  return rows.map((row) => {
    const match = bySymbol.get(row.symbol);
    if (!match) return { ...row, historicalContext: row.historicalContext ?? null };
    return {
      ...row,
      securityId: match.securityId,
      historicalContext: match.historicalContext,
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
  try {
    const requests = input.rows.map((row) => mapRadarEnrichmentRequest(row));
    const batch = await input.fetchBatch(requests);
    return mergeHistoricalContextBatchIntoRows(input.rows, batch);
  } catch {
    return input.rows.map((row) => ({ ...row, historicalContext: null }));
  }
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
