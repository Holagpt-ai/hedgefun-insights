import type { RadarV2ScreenerRow } from "@/lib/screeners/radar-v2-adapter";
import type { RadarHistoricalContextEnrichmentRequest } from "@/lib/radar/radar-historical-context-types";
import { mergeHistoricalContextBatchIntoRows } from "@/lib/radar/apply-radar-historical-context";
import {
  buildPrioritizedHistoricalBatches,
  radarHistoricalBoardGenerationKey,
} from "@/lib/radar/radar-historical-context-priority";
import {
  fetchRadarHistoricalContextBatch,
  RadarHistoricalContextHttpError,
  type RadarHistoricalContextBatchResponse,
} from "@/lib/radar/radar-historical-context-client";
import { RADAR_HISTORICAL_CONTEXT_MAX_REQUESTS_PER_BATCH } from "@/lib/radar/radar-historical-context-bounds";

export type RadarHistoricalProgressiveConfig = {
  maxConcurrentBatches: number;
  maxBatchesPerRun: number;
  sessionCacheTtlMs: number;
  transientRetryDelaysMs: readonly number[];
  pauseWhenHidden: boolean;
};

export const RADAR_HISTORICAL_PROGRESSIVE_DEFAULTS: RadarHistoricalProgressiveConfig = {
  maxConcurrentBatches: 1,
  /** Cap optional background work started per board generation (not per refresh storm). */
  maxBatchesPerRun: 12,
  sessionCacheTtlMs: 5 * 60_000,
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

type CachedSymbolEntry = {
  securityId: string | null;
  historicalContext: RadarV2ScreenerRow["historicalContext"];
  loadStatus: RadarV2ScreenerRow["historicalContextLoadStatus"];
  fetchedAtMs: number;
  boardGeneration: string;
};

const symbolCache = new Map<string, CachedSymbolEntry>();
let userPrioritySymbols = new Set<string>();
let activeController: RadarProgressiveHistoricalContextController | null = null;

export function requestRadarHistoricalContextPriority(symbol: string): void {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) return;
  userPrioritySymbols.add(normalized);
  activeController?.reprioritize();
}

export function resetRadarHistoricalContextStateForTests(): void {
  symbolCache.clear();
  userPrioritySymbols = new Set();
  activeController = null;
}

export function peekRadarHistoricalProgressiveDiagnostics(): RadarHistoricalProgressiveDiagnostics | null {
  return activeController?.diagnostics() ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientHttpStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function shouldRetryHttp(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function mergeRowsWithCache(
  rows: readonly RadarV2ScreenerRow[],
  boardGeneration: string,
  nowMs: number,
  ttlMs: number,
): RadarV2ScreenerRow[] {
  return rows.map((row) => {
    const cached = symbolCache.get(row.symbol.toUpperCase());
    if (
      !cached
      || cached.boardGeneration !== boardGeneration
      || nowMs - cached.fetchedAtMs > ttlMs
    ) {
      return {
        ...row,
        historicalContextLoadStatus: row.historicalContextLoadStatus ?? "pending",
      };
    }
    return {
      ...row,
      securityId: cached.securityId,
      historicalContext: cached.historicalContext,
      historicalContextLoadStatus: cached.loadStatus,
    };
  });
}

function rememberCacheFromRows(rows: readonly RadarV2ScreenerRow[], boardGeneration: string, nowMs: number): void {
  for (const row of rows) {
    const status = row.historicalContextLoadStatus;
    if (!status || status === "pending" || status === "loading" || status === "failed") continue;
    symbolCache.set(row.symbol.toUpperCase(), {
      securityId: row.securityId ?? null,
      historicalContext: row.historicalContext ?? null,
      loadStatus: status,
      fetchedAtMs: nowMs,
      boardGeneration,
    });
  }
}

function symbolsNeedingFetch(
  rows: readonly RadarV2ScreenerRow[],
  boardGeneration: string,
  nowMs: number,
  ttlMs: number,
): RadarV2ScreenerRow[] {
  return rows.filter((row) => {
    const status = row.historicalContextLoadStatus;
    if (status === "available" || status === "empty" || status === "limited" || status === "unavailable") {
      return false;
    }
    const cached = symbolCache.get(row.symbol.toUpperCase());
    if (
      cached
      && cached.boardGeneration === boardGeneration
      && nowMs - cached.fetchedAtMs <= ttlMs
      && cached.loadStatus !== "failed"
    ) {
      return false;
    }
    return true;
  });
}

export class RadarProgressiveHistoricalContextController {
  private diagnosticsState: RadarHistoricalProgressiveDiagnostics = {
    completedBatches: 0,
    failedBatches: 0,
    pendingBatches: 0,
    skippedBatches: 0,
    symbolsLoaded: 0,
    symbolsPending: 0,
  };
  private reprioritizeRequested = false;

  constructor(private readonly opts: {
    fetchBatch: (requests: RadarHistoricalContextEnrichmentRequest[]) => Promise<RadarHistoricalContextBatchResponse>;
    onRowsUpdated: (rows: RadarV2ScreenerRow[]) => void;
    isCancelled: () => boolean;
    isHidden?: () => boolean;
    config?: Partial<RadarHistoricalProgressiveConfig>;
  }) {}

  diagnostics(): RadarHistoricalProgressiveDiagnostics {
    return { ...this.diagnosticsState };
  }

  reprioritize(): void {
    this.reprioritizeRequested = true;
  }

  async run(input: {
    rows: readonly RadarV2ScreenerRow[];
    syncedAt: string | null | undefined;
  }): Promise<void> {
    const config = { ...RADAR_HISTORICAL_PROGRESSIVE_DEFAULTS, ...this.opts.config };
    const boardGeneration = radarHistoricalBoardGenerationKey({
      syncedAt: input.syncedAt,
      symbols: input.rows.map((row) => row.symbol),
    });
    let merged = mergeRowsWithCache(input.rows, boardGeneration, Date.now(), config.sessionCacheTtlMs);
    this.opts.onRowsUpdated(merged);

    const pendingRows = () => symbolsNeedingFetch(merged, boardGeneration, Date.now(), config.sessionCacheTtlMs);
    let batches = buildPrioritizedHistoricalBatches({
      rows: pendingRows(),
      userPrioritySymbols: [...userPrioritySymbols],
    });
    this.diagnosticsState.pendingBatches = batches.length;
    this.diagnosticsState.symbolsPending = pendingRows().length;

    let batchesStarted = 0;
    while (batches.length > 0) {
      if (this.opts.isCancelled()) return;
      if (this.reprioritizeRequested) {
        this.reprioritizeRequested = false;
        batches = buildPrioritizedHistoricalBatches({
          rows: pendingRows(),
          userPrioritySymbols: [...userPrioritySymbols],
        });
        this.diagnosticsState.pendingBatches = batches.length;
        continue;
      }
      if (config.pauseWhenHidden && this.opts.isHidden?.()) {
        await sleep(500);
        continue;
      }
      if (batchesStarted >= config.maxBatchesPerRun) {
        this.diagnosticsState.skippedBatches += batches.length;
        break;
      }

      const batchRequests = batches.shift()!;
      if (batchRequests.length > RADAR_HISTORICAL_CONTEXT_MAX_REQUESTS_PER_BATCH) {
        this.diagnosticsState.skippedBatches += 1;
        continue;
      }
      this.diagnosticsState.pendingBatches = batches.length;
      const loadingSymbols = new Set(batchRequests.map((request) => request.symbol.toUpperCase()));
      merged = mergeHistoricalContextBatchIntoRows(merged, { results: [] }, { loadingSymbols });
      this.opts.onRowsUpdated(merged);

      let response: RadarHistoricalContextBatchResponse | null = null;
      let lastStatus: number | null = null;
      for (let attempt = 0; attempt <= config.transientRetryDelaysMs.length; attempt += 1) {
        if (this.opts.isCancelled()) return;
        try {
          response = await this.opts.fetchBatch(batchRequests);
          break;
        } catch (error) {
          if (error instanceof RadarHistoricalContextHttpError) {
            lastStatus = error.status;
            if (error.status === 413 || error.status === 401 || error.status === 403) {
              this.diagnosticsState.failedBatches += 1;
              merged = mergeHistoricalContextBatchIntoRows(merged, { results: [] }, {
                failedSymbols: loadingSymbols,
              });
              this.opts.onRowsUpdated(merged);
              batchesStarted += 1;
              response = null;
              break;
            }
            if (shouldRetryHttp(error.status) && attempt < config.transientRetryDelaysMs.length) {
              await sleep(config.transientRetryDelaysMs[attempt] ?? 1_000);
              continue;
            }
            this.diagnosticsState.failedBatches += 1;
            merged = mergeHistoricalContextBatchIntoRows(merged, { results: [] }, {
              failedSymbols: loadingSymbols,
            });
            this.opts.onRowsUpdated(merged);
            batchesStarted += 1;
            response = null;
            break;
          }
          if (attempt < config.transientRetryDelaysMs.length) {
            await sleep(config.transientRetryDelaysMs[attempt] ?? 1_000);
            continue;
          }
          this.diagnosticsState.failedBatches += 1;
          merged = mergeHistoricalContextBatchIntoRows(merged, { results: [] }, {
            failedSymbols: loadingSymbols,
          });
          this.opts.onRowsUpdated(merged);
          batchesStarted += 1;
          response = null;
          break;
        }
      }

      if (response) {
        merged = mergeHistoricalContextBatchIntoRows(merged, response);
        rememberCacheFromRows(merged, boardGeneration, Date.now());
        this.diagnosticsState.completedBatches += 1;
        this.diagnosticsState.symbolsLoaded = merged.filter((row) => {
          const status = row.historicalContextLoadStatus;
          return status === "available" || status === "empty" || status === "limited" || status === "unavailable";
        }).length;
        this.opts.onRowsUpdated(merged);
        batchesStarted += 1;
      } else if (lastStatus !== null && !isTransientHttpStatus(lastStatus)) {
        // Non-retryable HTTP already handled.
      }

      this.diagnosticsState.symbolsPending = pendingRows().length;
      if (config.maxConcurrentBatches <= 1) {
        await sleep(0);
      }
    }
  }
}

export async function runRadarProgressiveHistoricalContext(input: {
  rows: readonly RadarV2ScreenerRow[];
  syncedAt: string | null | undefined;
  edgeUrl: string;
  accessToken: string | null | undefined;
  onRowsUpdated: (rows: RadarV2ScreenerRow[]) => void;
  isCancelled: () => boolean;
  isHidden?: () => boolean;
  fetchImpl?: typeof fetch;
  config?: Partial<RadarHistoricalProgressiveConfig>;
}): Promise<void> {
  const controller = new RadarProgressiveHistoricalContextController({
    fetchBatch: (requests) => fetchRadarHistoricalContextBatch({
      url: input.edgeUrl,
      accessToken: input.accessToken,
      requests,
      fetchImpl: input.fetchImpl,
    }),
    onRowsUpdated: input.onRowsUpdated,
    isCancelled: input.isCancelled,
    isHidden: input.isHidden,
    config: input.config,
  });
  activeController = controller;
  try {
    await controller.run({ rows: input.rows, syncedAt: input.syncedAt });
  } finally {
    if (activeController === controller) activeController = null;
  }
}
