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
import {
  handoffIdentity,
  repeatMoverContextMatchesHandoff,
} from "@/lib/historical-workflow/historical-handoff-identity";
import { coerceRepeatMoverContextForDisplay } from "@/lib/radar/coerce-repeat-mover-context-for-display";
import type { RepeatMoverContext } from "@/types/repeat-mover";
import type { SecurityId } from "@/types/security-identity";
import {
  classifyHistoricalContextBatchResult,
  resolveHistoricalContextLoadStatus,
} from "@/lib/radar/radar-historical-context-classify";
export { resolveHistoricalContextLoadStatus } from "@/lib/radar/radar-historical-context-classify";

function batchResultSecurityIdConflicts(
  rowSecurityId: SecurityId | null | undefined,
  matchSecurityId: SecurityId | null | undefined,
): boolean {
  if (!rowSecurityId || !matchSecurityId) return false;
  return rowSecurityId !== matchSecurityId;
}

function validatedRepeatMoverContextForRow(
  symbol: string,
  context: RepeatMoverContext | null | undefined,
  expectedSecurityId: SecurityId | null,
): RepeatMoverContext | null {
  if (!context) return null;
  const identity = handoffIdentity(symbol, expectedSecurityId);
  if (!identity || !repeatMoverContextMatchesHandoff(identity, context)) return null;
  return context;
}

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
    const securityIdConflict = batchResultSecurityIdConflicts(row.securityId, match.securityId);
    const rowExpectedSecurityId = row.securityId ?? null;
    const incomingExpectedSecurityId = row.securityId ?? match.securityId ?? null;
    let coercedIncoming = coerceRepeatMoverContextForDisplay(match.historicalContext);
    if (
      coercedIncoming
      && match.securityId
      && coercedIncoming.securityId !== match.securityId
    ) {
      coercedIncoming = null;
    }
    const incomingContext = securityIdConflict
      ? null
      : validatedRepeatMoverContextForRow(symbol, coercedIncoming, incomingExpectedSecurityId);
    const validatedPrior = validatedRepeatMoverContextForRow(
      symbol,
      row.historicalContext ?? null,
      rowExpectedSecurityId,
    );
    const historicalContext = incomingContext ?? validatedPrior ?? null;

    let historicalContextLoadStatus = row.historicalContextLoadStatus ?? "pending";
    if (incomingContext) {
      historicalContextLoadStatus = resolveHistoricalContextLoadStatus(incomingContext);
    } else if (validatedPrior) {
      historicalContextLoadStatus =
        row.historicalContextLoadStatus
        ?? resolveHistoricalContextLoadStatus(validatedPrior);
    } else if (match.historicalContext != null || securityIdConflict) {
      historicalContextLoadStatus = "unavailable";
    } else {
      historicalContextLoadStatus = classifyHistoricalContextBatchResult({
        historicalContext: match.historicalContext,
        priorContext: null,
      });
    }

    const nextSecurityId = securityIdConflict
      ? row.securityId ?? null
      : match.securityId ?? row.securityId ?? null;

    return {
      ...row,
      securityId: nextSecurityId,
      historicalContext,
      historicalContextLoadStatus,
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
