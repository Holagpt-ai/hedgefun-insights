import type { RadarV2ScreenerRow } from "@/lib/screeners/radar-v2-adapter";
import type { RadarHistoricalContextEnrichmentRequest } from "@/lib/radar/radar-historical-context-types";
import { mergeHistoricalContextBatchIntoRows } from "@/lib/radar/apply-radar-historical-context";
import { buildPrioritizedHistoricalBatches } from "@/lib/radar/radar-historical-context-priority";
import {
  fetchRadarHistoricalContextBatch,
  RadarHistoricalContextHttpError,
  type RadarHistoricalContextBatchResponse,
} from "@/lib/radar/radar-historical-context-client";
import { RADAR_HISTORICAL_CONTEXT_MAX_REQUESTS_PER_BATCH } from "@/lib/radar/radar-historical-context-bounds";
import {
  applyRadarHistoricalCacheToRows,
  clearRadarHistoricalCacheSymbol,
  mergeHistoricalFieldsOntoLatestRows,
  radarHistoricalCacheFingerprintForRequest,
  radarHistoricalCacheFingerprintForRow,
  RADAR_HISTORICAL_CACHE_TTL_MS,
  readRadarHistoricalCache,
  writeRadarHistoricalCache,
  radarHistoricalSessionScopeKey,
  resetRadarHistoricalContextCacheForTests,
} from "@/lib/radar/radar-historical-context-cache";
import { coerceRepeatMoverContextForDisplay } from "@/lib/radar/coerce-repeat-mover-context-for-display";
import {
  classifyHistoricalContextBatchResult,
  resolveHistoricalContextLoadStatus,
} from "@/lib/radar/radar-historical-context-classify";

export type RadarHistoricalProgressiveConfig = {
  maxConcurrentBatches: number;
  maxBatchesPerWake: number;
  sessionCacheTtlMs: number;
  transientRetryDelaysMs: readonly number[];
  pauseWhenHidden: boolean;
};

export const RADAR_HISTORICAL_PROGRESSIVE_DEFAULTS: RadarHistoricalProgressiveConfig = {
  maxConcurrentBatches: 1,
  maxBatchesPerWake: 4,
  sessionCacheTtlMs: RADAR_HISTORICAL_CACHE_TTL_MS,
  transientRetryDelaysMs: [750, 2_000],
  pauseWhenHidden: true,
};

export type RadarHistoricalProgressiveDiagnostics = {
  completedBatches: number;
  failedBatches: number;
  pendingBatches: number;
  skippedBatches: number;
  symbolsLoaded: number;
  symbolsPending: number;
};

type FetchBatch = (requests: RadarHistoricalContextEnrichmentRequest[]) => Promise<RadarHistoricalContextBatchResponse>;

type CoordinatorDeps = {
  fetchBatch: FetchBatch;
  onHistoricalRows: (rows: RadarV2ScreenerRow[], publicationSeq: number) => void;
  isActive: () => boolean;
  isHidden?: () => boolean;
  config?: Partial<RadarHistoricalProgressiveConfig>;
};

type CoordinatorState = {
  lifecycleId: number;
  sessionScope: string | null;
  publicationSeq: number;
  latestRows: RadarV2ScreenerRow[];
  historicalRows: RadarV2ScreenerRow[];
  inFlight: Map<string, number>;
  runnerPromise: Promise<number> | null;
  diagnostics: RadarHistoricalProgressiveDiagnostics;
  deps: CoordinatorDeps | null;
};

const coordinator: CoordinatorState = {
  lifecycleId: 0,
  sessionScope: null,
  publicationSeq: 0,
  latestRows: [],
  historicalRows: [],
  inFlight: new Map(),
  runnerPromise: null,
  diagnostics: {
    completedBatches: 0,
    failedBatches: 0,
    pendingBatches: 0,
    skippedBatches: 0,
    symbolsLoaded: 0,
    symbolsPending: 0,
  },
  deps: null,
};

let userPrioritySymbols = new Set<string>();

export function requestRadarHistoricalContextPriority(symbol: string): void {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) return;
  userPrioritySymbols.add(normalized);
  if (coordinator.sessionScope) {
    clearRadarHistoricalCacheSymbol(normalized, coordinator.sessionScope);
  }
  scheduleRunner();
}

export function resetRadarHistoricalContextStateForTests(): void {
  resetRadarHistoricalContextCacheForTests();
  coordinator.lifecycleId += 1;
  coordinator.sessionScope = null;
  coordinator.publicationSeq = 0;
  coordinator.latestRows = [];
  coordinator.historicalRows = [];
  coordinator.inFlight.clear();
  coordinator.runnerPromise = null;
  coordinator.deps = null;
  userPrioritySymbols = new Set();
  coordinator.diagnostics = {
    completedBatches: 0,
    failedBatches: 0,
    pendingBatches: 0,
    skippedBatches: 0,
    symbolsLoaded: 0,
    symbolsPending: 0,
  };
}

export function peekRadarHistoricalProgressiveDiagnostics(): RadarHistoricalProgressiveDiagnostics | null {
  if (!coordinator.deps) return null;
  return { ...coordinator.diagnostics };
}

export function invalidateRadarHistoricalEnrichment(lifecycleId?: number): void {
  coordinator.lifecycleId += 1;
  coordinator.inFlight.clear();
  if (lifecycleId !== undefined) void lifecycleId;
}

function isCoordinatorOwner(lifecycleId: number, sessionScope: string): boolean {
  return lifecycleId === coordinator.lifecycleId && sessionScope === coordinator.sessionScope;
}

function releaseInFlightForBatch(batchRequests: RadarHistoricalContextEnrichmentRequest[], lifecycleId: number): void {
  for (const request of batchRequests) {
    const symbol = request.symbol.toUpperCase();
    if (coordinator.inFlight.get(symbol) === lifecycleId) {
      coordinator.inFlight.delete(symbol);
    }
  }
}

function rowBySymbol(rows: readonly RadarV2ScreenerRow[]): Map<string, RadarV2ScreenerRow> {
  return new Map(rows.map((row) => [row.symbol.toUpperCase(), row]));
}

function symbolsNeedingFetch(
  rows: readonly RadarV2ScreenerRow[],
  sessionScope: string,
  nowMs: number,
  ttlMs: number,
): RadarV2ScreenerRow[] {
  return rows.filter((row) => {
    const symbol = row.symbol.toUpperCase();
    if (coordinator.inFlight.has(symbol)) return false;
    const fingerprint = radarHistoricalCacheFingerprintForRow(row);
    const cached = readRadarHistoricalCache(symbol, fingerprint, sessionScope, nowMs, ttlMs);
    if (cached) return false;
    return true;
  });
}

function applyCacheToHistoricalRows(
  latestRows: readonly RadarV2ScreenerRow[],
  sessionScope: string,
  nowMs: number,
  ttlMs: number,
): RadarV2ScreenerRow[] {
  const cachedRows = applyRadarHistoricalCacheToRows({
    rows: latestRows,
    sessionScope,
    nowMs,
    ttlMs,
  });
  return mergeHistoricalFieldsOntoLatestRows(latestRows, cachedRows);
}

function rememberBatchResults(
  batch: RadarHistoricalContextBatchResponse,
  sessionScope: string,
  nowMs: number,
  priorHistorical: readonly RadarV2ScreenerRow[],
  latestRows: readonly RadarV2ScreenerRow[],
): RadarV2ScreenerRow[] {
  const priorBySymbol = rowBySymbol(priorHistorical);
  const updates: RadarV2ScreenerRow[] = [];
  for (const result of batch.results) {
    const symbol = result.symbol.toUpperCase();
    const prior = priorBySymbol.get(symbol);
    const coerced = coerceRepeatMoverContextForDisplay(result.historicalContext);
    const loadStatus = coerced
      ? resolveHistoricalContextLoadStatus(coerced)
      : classifyHistoricalContextBatchResult({
        historicalContext: result.historicalContext,
        priorContext: prior?.historicalContext ?? null,
      });
    const historicalContext = coerced ?? prior?.historicalContext ?? null;
    if (loadStatus === "pending" || loadStatus === "loading") continue;
    const latest = latestRows.find((entry) => entry.symbol.toUpperCase() === symbol) ?? prior;
    if (!latest) continue;
    const resolvedSecurityId = result.securityId ?? latest.securityId ?? null;
    if (
      latest.securityId
      && resolvedSecurityId
      && latest.securityId !== resolvedSecurityId
    ) {
      continue;
    }
    const fingerprint = radarHistoricalCacheFingerprintForRow({
      ...latest,
      securityId: resolvedSecurityId,
    });
    writeRadarHistoricalCache({
      symbol: result.symbol,
      fingerprint,
      securityId: resolvedSecurityId,
      historicalContext,
      loadStatus,
      fetchedAtMs: nowMs,
      sessionScope,
    });
    updates.push({
      ...latest,
      securityId: resolvedSecurityId,
      historicalContext,
      historicalContextLoadStatus: loadStatus,
    });
  }
  return updates;
}

function publishHistorical(sessionScope: string, ttlMs: number): void {
  if (!coordinator.deps) return;
  const nowMs = Date.now();
  const priorBySymbol = rowBySymbol(coordinator.historicalRows);
  const cachedRows = applyCacheToHistoricalRows(
    coordinator.latestRows,
    sessionScope,
    nowMs,
    ttlMs,
  );
  coordinator.historicalRows = cachedRows.map((row) => {
    const status = row.historicalContextLoadStatus;
    if (status && status !== "pending" && status !== "loading") return row;
    const prior = priorBySymbol.get(row.symbol.toUpperCase());
    if (!prior?.historicalContextLoadStatus || prior.historicalContextLoadStatus === "pending") {
      return row;
    }
    return mergeHistoricalFieldsOntoLatestRows([row], [prior])[0] ?? row;
  });
  coordinator.deps.onHistoricalRows(
    mergeHistoricalFieldsOntoLatestRows(coordinator.latestRows, coordinator.historicalRows),
    coordinator.publicationSeq,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runBatches(lifecycleId: number): Promise<number> {
  const deps = coordinator.deps;
  const sessionScopeAtStart = coordinator.sessionScope;
  if (!deps || !sessionScopeAtStart) return 0;
  const config = { ...RADAR_HISTORICAL_PROGRESSIVE_DEFAULTS, ...deps.config };
  let batchesStarted = 0;

  while (
    deps.isActive()
    && isCoordinatorOwner(lifecycleId, sessionScopeAtStart)
  ) {
    if (config.pauseWhenHidden && deps.isHidden?.()) {
      await sleep(500);
      continue;
    }
    const pending = symbolsNeedingFetch(
      coordinator.latestRows,
      sessionScopeAtStart,
      Date.now(),
      config.sessionCacheTtlMs,
    );
    coordinator.diagnostics.symbolsPending = pending.length;
    if (pending.length === 0) break;

    let batches = buildPrioritizedHistoricalBatches({
      rows: pending,
      userPrioritySymbols: [...userPrioritySymbols],
    });
    coordinator.diagnostics.pendingBatches = batches.length;
    if (batches.length === 0 || batchesStarted >= config.maxBatchesPerWake) {
      coordinator.diagnostics.skippedBatches += batches.length;
      break;
    }

    const batchRequests = batches.shift()!;
    if (batchRequests.length > RADAR_HISTORICAL_CONTEXT_MAX_REQUESTS_PER_BATCH) continue;

    for (const request of batchRequests) {
      coordinator.inFlight.set(request.symbol.toUpperCase(), lifecycleId);
    }

    let response: RadarHistoricalContextBatchResponse | null = null;
    try {
      for (let attempt = 0; attempt <= config.transientRetryDelaysMs.length; attempt += 1) {
        if (!deps.isActive() || !isCoordinatorOwner(lifecycleId, sessionScopeAtStart)) break;
        try {
          response = await deps.fetchBatch(batchRequests);
          break;
        } catch (error) {
          if (error instanceof RadarHistoricalContextHttpError) {
            if (error.status === 413 || error.status === 401 || error.status === 403) break;
            if ((error.status === 429 || error.status >= 500) && attempt < config.transientRetryDelaysMs.length) {
              await sleep(config.transientRetryDelaysMs[attempt] ?? 1_000);
              continue;
            }
          } else if (attempt < config.transientRetryDelaysMs.length) {
            await sleep(config.transientRetryDelaysMs[attempt] ?? 1_000);
            continue;
          }
          break;
        }
      }
    } finally {
      releaseInFlightForBatch(batchRequests, lifecycleId);
    }

    if (!isCoordinatorOwner(lifecycleId, sessionScopeAtStart) || !deps.isActive()) {
      break;
    }

    const publicationSeqAtStart = coordinator.publicationSeq;
    const latestRowsSnapshot = coordinator.latestRows;
    const priorHistorical = coordinator.historicalRows.length > 0
      ? coordinator.historicalRows
      : latestRowsSnapshot;

    if (!response) {
      coordinator.diagnostics.failedBatches += 1;
      const failed = new Set(batchRequests.map((request) => request.symbol.toUpperCase()));
      const nowMs = Date.now();
      for (const request of batchRequests) {
        const symbol = request.symbol.toUpperCase();
        const latest = latestRowsSnapshot.find(
          (entry) => entry.symbol.toUpperCase() === symbol,
        );
        const prior = priorHistorical.find((entry) => entry.symbol.toUpperCase() === symbol);
        writeRadarHistoricalCache({
          symbol: request.symbol,
          fingerprint: radarHistoricalCacheFingerprintForRequest(request),
          securityId: request.securityId ?? latest?.securityId ?? null,
          historicalContext: prior?.historicalContext ?? latest?.historicalContext ?? null,
          loadStatus: "failed",
          fetchedAtMs: nowMs,
          sessionScope: sessionScopeAtStart,
        });
      }
      coordinator.historicalRows = mergeHistoricalContextBatchIntoRows(
        priorHistorical,
        { results: [] },
        { failedSymbols: failed },
      );
    } else {
      const nowMs = Date.now();
      const batchHistorical = rememberBatchResults(
        response,
        sessionScopeAtStart,
        nowMs,
        priorHistorical,
        latestRowsSnapshot,
      );
      coordinator.historicalRows = mergeHistoricalFieldsOntoLatestRows(
        priorHistorical,
        batchHistorical,
      );
      coordinator.diagnostics.completedBatches += 1;
      coordinator.diagnostics.symbolsLoaded = coordinator.historicalRows.filter((row) => {
        const status = row.historicalContextLoadStatus;
        return status === "available" || status === "limited" || status === "unavailable";
      }).length;
    }

    if (isCoordinatorOwner(lifecycleId, sessionScopeAtStart) && deps.isActive()) {
      deps.onHistoricalRows(
        mergeHistoricalFieldsOntoLatestRows(coordinator.latestRows, coordinator.historicalRows),
        publicationSeqAtStart,
      );
    }
    batchesStarted += 1;
  }

  return batchesStarted;
}

function scheduleRunner(): void {
  if (coordinator.runnerPromise || !coordinator.deps || !coordinator.sessionScope) return;
  const lifecycleId = coordinator.lifecycleId;
  const sessionScopeAtSchedule = coordinator.sessionScope;
  const config = { ...RADAR_HISTORICAL_PROGRESSIVE_DEFAULTS, ...coordinator.deps.config };
  const runPromise = runBatches(lifecycleId);
  coordinator.runnerPromise = runPromise;
  void runPromise.then((batchesStarted) => {
    if (coordinator.runnerPromise !== runPromise) return;
    coordinator.runnerPromise = null;
    if (
      !coordinator.deps?.isActive()
      || coordinator.sessionScope !== sessionScopeAtSchedule
    ) {
      return;
    }
    const pendingAfterWake = symbolsNeedingFetch(
      coordinator.latestRows,
      coordinator.sessionScope,
      Date.now(),
      config.sessionCacheTtlMs,
    );
    if (pendingAfterWake.length > 0 && batchesStarted > 0) {
      scheduleRunner();
    }
  }).catch(() => {
    if (coordinator.runnerPromise === runPromise) {
      coordinator.runnerPromise = null;
    }
  });
}

export function notifyRadarHistoricalPublication(input: {
  rows: readonly RadarV2ScreenerRow[];
  sessionKind: string | null | undefined;
  tradingDate: string | null | undefined;
  fetchBatch: FetchBatch;
  onHistoricalRows: (rows: RadarV2ScreenerRow[], publicationSeq: number) => void;
  isActive: () => boolean;
  isHidden?: () => boolean;
  config?: Partial<RadarHistoricalProgressiveConfig>;
}): void {
  const sessionScope = radarHistoricalSessionScopeKey({
    sessionKind: input.sessionKind,
    tradingDate: input.tradingDate,
  });
  const config = { ...RADAR_HISTORICAL_PROGRESSIVE_DEFAULTS, ...input.config };

  if (input.rows.length === 0) {
    invalidateRadarHistoricalEnrichment();
    coordinator.sessionScope = null;
    coordinator.latestRows = [];
    coordinator.historicalRows = [];
    return;
  }

  if (coordinator.sessionScope !== sessionScope) {
    invalidateRadarHistoricalEnrichment();
    coordinator.sessionScope = sessionScope;
    coordinator.historicalRows = [];
  }

  coordinator.deps = {
    fetchBatch: input.fetchBatch,
    onHistoricalRows: input.onHistoricalRows,
    isActive: input.isActive,
    isHidden: input.isHidden,
    config,
  };
  coordinator.publicationSeq += 1;
  coordinator.latestRows = [...input.rows];

  publishHistorical(sessionScope, config.sessionCacheTtlMs);
  scheduleRunner();
}

export async function runRadarProgressiveHistoricalContext(input: {
  rows: readonly RadarV2ScreenerRow[];
  syncedAt: string | null | undefined;
  sessionKind?: string | null;
  tradingDate?: string | null;
  edgeUrl: string;
  accessToken: string | null | undefined;
  onRowsUpdated: (rows: RadarV2ScreenerRow[]) => void;
  isCancelled: () => boolean;
  isHidden?: () => boolean;
  fetchImpl?: typeof fetch;
  config?: Partial<RadarHistoricalProgressiveConfig>;
}): Promise<void> {
  notifyRadarHistoricalPublication({
    rows: input.rows,
    sessionKind: input.sessionKind ?? null,
    tradingDate: input.tradingDate ?? input.rows[0]?.radar_trading_date ?? null,
    fetchBatch: (requests) => fetchRadarHistoricalContextBatch({
      url: input.edgeUrl,
      accessToken: input.accessToken,
      requests,
      fetchImpl: input.fetchImpl,
    }),
    onHistoricalRows: (rows) => input.onRowsUpdated(rows),
    isActive: () => !input.isCancelled(),
    isHidden: input.isHidden,
    config: input.config,
  });
  for (let i = 0; i < 50 && !input.isCancelled(); i += 1) {
    if (!coordinator.runnerPromise) break;
    await coordinator.runnerPromise;
    await sleep(5);
  }
}
