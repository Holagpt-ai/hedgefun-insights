/**
 * Resumable historical daily backfill.
 *
 * Uses fixtures or an injected provider. Does not call a live market-data API,
 * fetch minute bars, or mark partial provider coverage as complete.
 */

import {
  HISTORICAL_BACKFILL_DEFAULT_DATE_FROM,
  HISTORICAL_DAILY_DETECTOR_ID,
  historicalBackfillConfig,
  type HistoricalBackfillConfig,
} from "@/config/historical-backfill.config";
import { detectDailyEpisode } from "@/lib/historical-backfill/episode-detector";
import { addCalendarDays, etSessionBounds, isBackfillDate } from "@/lib/historical-backfill/dates";
import { historicalDailyRvol, type HistoricalVolumeSession } from "@/lib/historical-backfill/historical-rvol";
import { normalizeDailyBar } from "@/lib/historical-backfill/normalize-daily-bar";
import { withBoundedRetry } from "@/lib/historical-backfill/retry";
import type { SecurityIdentityStore } from "@/lib/security-identity/security-identity";
import type { SecurityIntelligenceStore } from "@/lib/security-intelligence/security-intelligence";
import { parseTimestampMs } from "@/lib/screeners/contract";
import type {
  BackfillCheckpoint,
  BackfillJobStats,
  DailyBarsResult,
  DeepReconstructionCandidate,
  EligibleSecurity,
  ProviderCoverage,
} from "@/types/historical-backfill";
import type { SecuritySymbolHistory, SymbolAtDate } from "@/types/security-identity";
import type { MarketBehaviorEpisode, SecurityBackfillJob, SecurityDailyHistory } from "@/types/security-intelligence";

const EMPTY_TIERS = { NOTABLE: 0, SIGNIFICANT: 0, EXTREME: 0 };

type MaybePromise<T> = T | Promise<T>;

export interface HistoricalIdentityPort {
  listHistory(securityId?: string): MaybePromise<readonly SecuritySymbolHistory[]>;
  symbolAt(securityId: string, eventDate: string): MaybePromise<SymbolAtDate | null>;
}

export interface HistoricalIntelligencePort {
  createBackfillJob(input: Parameters<SecurityIntelligenceStore["createBackfillJob"]>[0]): MaybePromise<ReturnType<SecurityIntelligenceStore["createBackfillJob"]>>;
  transitionBackfillJob(jobId: string, input: Parameters<SecurityIntelligenceStore["transitionBackfillJob"]>[1]): MaybePromise<ReturnType<SecurityIntelligenceStore["transitionBackfillJob"]>>;
  getJob(jobId: string): MaybePromise<SecurityBackfillJob | null>;
  recordBackfillCheckpoint(jobId: string, input: Parameters<SecurityIntelligenceStore["recordBackfillCheckpoint"]>[1]): MaybePromise<ReturnType<SecurityIntelligenceStore["recordBackfillCheckpoint"]>>;
  upsertDailyHistory(input: Parameters<SecurityIntelligenceStore["upsertDailyHistory"]>[0]): MaybePromise<ReturnType<SecurityIntelligenceStore["upsertDailyHistory"]>>;
  putEpisode(input: Parameters<SecurityIntelligenceStore["putEpisode"]>[0]): MaybePromise<ReturnType<SecurityIntelligenceStore["putEpisode"]>>;
  listDailyHistory(securityId?: string): MaybePromise<readonly SecurityDailyHistory[]>;
  listEpisodes(securityId?: string): MaybePromise<readonly MarketBehaviorEpisode[]>;
  transaction?<T>(fn: () => Promise<T>): Promise<T>;
}

export interface HistoricalBackfillEngineOptions {
  identity: HistoricalIdentityPort;
  intelligence: HistoricalIntelligencePort;
  provider: { fetchDailyBars: (request: {
    securityId: string;
    symbol: string;
    exchange: string | null;
    dateFrom: string;
    dateTo: string;
  }) => Promise<DailyBarsResult> };
  config?: Partial<HistoricalBackfillConfig>;
  sleep?: (ms: number) => Promise<void>;
}

export class HistoricalBackfillEngine {
  private readonly identity: HistoricalIdentityPort;
  private readonly intelligence: HistoricalIntelligencePort;
  private readonly provider: HistoricalBackfillEngineOptions["provider"];
  private readonly config: HistoricalBackfillConfig;
  private readonly sleep: (ms: number) => Promise<void>;
  private inFlight = 0;

  constructor(options: HistoricalBackfillEngineOptions) {
    this.identity = options.identity;
    this.intelligence = options.intelligence;
    this.provider = options.provider;
    this.config = historicalBackfillConfig(options.config);
    this.sleep = options.sleep ?? (async () => undefined);
  }

  async start(input: {
    securities: readonly EligibleSecurity[];
    completedSessionDate: string;
    dateFrom?: string;
    dateTo?: string;
    recordedAt: string;
    jobType?: string;
  }) {
    if (this.config.maxConcurrentProviderRequests < 1) {
      return { ok: false as const, reason: "maxConcurrentProviderRequests must be positive" };
    }
    if (!isBackfillDate(input.completedSessionDate)) return { ok: false as const, reason: "invalid completed session" };
    const dateFrom = input.dateFrom ?? HISTORICAL_BACKFILL_DEFAULT_DATE_FROM;
    const dateTo = input.dateTo ?? input.completedSessionDate;
    if (!isBackfillDate(dateFrom) || !isBackfillDate(dateTo)) return { ok: false as const, reason: "invalid date range" };
    if (dateFrom > dateTo) return { ok: false as const, reason: "dateFrom after dateTo" };
    if (this.config.verifiedEarliestDailyDate && dateFrom < this.config.verifiedEarliestDailyDate) {
      return { ok: false as const, reason: "dateFrom is before verified daily entitlement" };
    }
    if (dateTo > input.completedSessionDate) return { ok: false as const, reason: "dateTo is after the completed session" };
    if (input.securities.length === 0) return { ok: false as const, reason: "eligible universe is empty" };
    const securityIds = input.securities.map((security) => security.securityId);
    const checkpoint = emptyCheckpoint(securityIds.length, dateFrom);
    const created = await this.intelligence.createBackfillJob({
      jobType: input.jobType ?? "SECURITY_DAILY_HISTORY",
      dateFrom,
      dateTo,
      recordedAt: input.recordedAt,
      metadata: { securityIds, checkpoint },
    });
    if (!created.ok) return created;
    return this.intelligence.transitionBackfillJob(created.record.jobId, {
      to: "RUNNING",
      recordedAt: input.recordedAt,
      cursorDate: dateFrom,
      cursorToken: token(checkpoint),
      metadata: { securityIds, checkpoint },
    });
  }

  async resume(jobId: string, recordedAt: string) {
    const job = await this.intelligence.getJob(jobId);
    if (!job) return { ok: false as const, reason: "job not found" };
    if (job.state !== "FAILED" && job.state !== "PAUSED") {
      return { ok: false as const, reason: "job is not paused or failed" };
    }
    return this.intelligence.transitionBackfillJob(jobId, { to: "RUNNING", recordedAt });
  }

  async runBatch(jobId: string, recordedAt: string): Promise<BackfillJobStats> {
    const job = await this.intelligence.getJob(jobId);
    if (!job || job.state !== "RUNNING") return this.stats(jobId, recordedAt);
    const securityIds = readSecurityIds(job.metadata);
    let checkpoint = readCheckpoint(job.metadata, securityIds.length, job.dateFrom);
    let chunks = 0;
    while (chunks < this.config.maxChunksPerRun && job.state === "RUNNING") {
      if (checkpoint.securityIndex >= securityIds.length) {
        if (checkpoint.coverage && checkpoint.coverage !== "SUPPORTED") break;
        await this.intelligence.transitionBackfillJob(jobId, {
          to: "COMPLETE",
          recordedAt,
          cursorDate: job.dateTo,
          cursorToken: token(checkpoint),
          processedCount: checkpoint.securitiesProcessed,
          errorCount: checkpoint.providerErrors,
          metadata: { securityIds, checkpoint },
        });
        break;
      }
      const securityId = securityIds[checkpoint.securityIndex];
      const chunkTo = minDate(addCalendarDays(checkpoint.nextChunkFrom, this.config.dateChunkDays - 1), job.dateTo);
      const history = await this.identity.listHistory(securityId);
      const segments = symbolSegments(history, checkpoint.nextChunkFrom, chunkTo);
      let failed = false;
      for (const segment of segments) {
        let result: DailyBarsResult;
        try {
          result = await this.fetchDaily(securityId, segment);
        } catch {
          checkpoint = { ...checkpoint, providerErrors: checkpoint.providerErrors + 1 };
          await this.intelligence.transitionBackfillJob(jobId, {
            to: "FAILED",
            recordedAt,
            cursorDate: checkpoint.lastSuccessfulChunkFrom,
            cursorToken: token(checkpoint),
            processedCount: checkpoint.securitiesProcessed,
            errorCount: checkpoint.providerErrors,
            metadata: { securityIds, checkpoint },
          });
          failed = true;
          break;
        }
        if (result.coverage !== "SUPPORTED" || !result.complete) {
          checkpoint = { ...checkpoint, coverage: result.coverage, providerErrors: checkpoint.providerErrors + 1 };
          await this.intelligence.transitionBackfillJob(jobId, {
            to: "PAUSED",
            recordedAt,
            cursorDate: checkpoint.lastSuccessfulChunkFrom,
            cursorToken: token(checkpoint),
            processedCount: checkpoint.securitiesProcessed,
            errorCount: checkpoint.providerErrors,
            metadata: { securityIds, checkpoint },
          });
          failed = true;
          break;
        }
        checkpoint = await this.inWriteStep(() => this.applyBars(securityId, segment.symbol, result, recordedAt, checkpoint));
      }
      if (failed) break;
      checkpoint = advance(checkpoint, chunkTo, job.dateFrom, job.dateTo);
      chunks += 1;
      await this.inWriteStep(() => this.intelligence.recordBackfillCheckpoint(jobId, {
        to: "RUNNING",
        recordedAt,
        cursorDate: checkpoint.lastSuccessfulChunkFrom,
        cursorToken: token(checkpoint),
        processedCount: checkpoint.securitiesProcessed,
        errorCount: checkpoint.providerErrors,
        metadata: { securityIds, checkpoint },
      }));
      const refreshed = await this.intelligence.getJob(jobId);
      if (!refreshed || refreshed.state !== "RUNNING") break;
    }
    const latest = await this.intelligence.getJob(jobId);
    if (latest?.state === "RUNNING") {
      const done = readCheckpoint(latest.metadata, securityIds.length, latest.dateFrom);
      if (done.securityIndex >= securityIds.length && (done.coverage === null || done.coverage === "SUPPORTED")) {
        await this.intelligence.transitionBackfillJob(jobId, {
          to: "COMPLETE",
          recordedAt,
          cursorDate: latest.dateTo,
          cursorToken: token(done),
          processedCount: done.securitiesProcessed,
          errorCount: done.providerErrors,
          metadata: { securityIds, checkpoint: done },
        });
      }
    }
    return this.stats(jobId, recordedAt);
  }

  private async inWriteStep<T>(fn: () => Promise<T> | T): Promise<T> {
    if (!this.intelligence.transaction) return await fn();
    return this.intelligence.transaction(async () => await fn());
  }

  async stats(jobId: string, recordedAt: string): Promise<BackfillJobStats> {
    const job = await this.intelligence.getJob(jobId);
    const checkpoint = job
      ? readCheckpoint(job.metadata, readSecurityIds(job.metadata).length, job.dateFrom)
      : emptyCheckpoint(0, HISTORICAL_BACKFILL_DEFAULT_DATE_FROM);
    const started = job?.startedAt ? parseTimestampMs(job.startedAt) : null;
    const now = parseTimestampMs(recordedAt);
    return {
      state: job?.state ?? "MISSING",
      dateFrom: job?.dateFrom ?? checkpoint.nextChunkFrom,
      dateTo: job?.dateTo ?? checkpoint.nextChunkFrom,
      cursorDate: job?.cursorDate ?? null,
      cursorToken: job?.cursorToken ?? null,
      securitiesTotal: checkpoint.securitiesTotal,
      securitiesProcessed: checkpoint.securitiesProcessed,
      sessionsProcessed: checkpoint.sessionsProcessed,
      rowsWritten: checkpoint.rowsWritten,
      duplicateRows: checkpoint.duplicateRows,
      invalidRows: checkpoint.invalidRows,
      providerErrors: checkpoint.providerErrors,
      episodesByTier: checkpoint.episodesByTier,
      coverage: checkpoint.coverage,
      deepReconstruction: checkpoint.deepReconstruction,
      elapsedMs: started !== null && now !== null ? Math.max(0, now - started) : null,
    };
  }

  private async fetchDaily(
    securityId: string,
    segment: { symbol: string; exchange: string | null; dateFrom: string; dateTo: string },
  ): Promise<DailyBarsResult> {
    if (this.inFlight >= this.config.maxConcurrentProviderRequests) {
      throw new Error("provider concurrency limit reached");
    }
    this.inFlight += 1;
    try {
      return await withBoundedRetry(
        () => this.provider.fetchDailyBars({
          securityId,
          symbol: segment.symbol,
          exchange: segment.exchange,
          dateFrom: segment.dateFrom,
          dateTo: segment.dateTo,
        }),
        {
          retryCount: this.config.retryCount,
          retryBackoffMs: this.config.retryBackoffMs,
          sleep: this.sleep,
        },
      );
    } finally {
      this.inFlight -= 1;
    }
  }

  private async applyBars(
    securityId: string,
    segmentSymbol: string,
    result: DailyBarsResult,
    recordedAt: string,
    checkpoint: BackfillCheckpoint,
  ): BackfillCheckpoint {
    const next: BackfillCheckpoint = {
      ...checkpoint,
      episodesByTier: { ...checkpoint.episodesByTier },
      deepReconstruction: [...checkpoint.deepReconstruction],
      coverage: "SUPPORTED",
    };
    const ordered = [...result.bars].sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));
    for (const bar of ordered) {
      next.sessionsProcessed += 1;
      const at = await this.identity.symbolAt(securityId, bar.sessionDate);
      if (!at || at.symbol !== segmentSymbol) {
        next.invalidRows += 1;
        continue;
      }
      const previous = await this.previousClose(securityId, bar.sessionDate);
      const normalized = normalizeDailyBar({
        securityId,
        observedSymbol: at.symbol,
        exchange: at.exchange,
        bar,
        previousClose: previous,
        source: result.source,
        sourceAsOf: result.sourceAsOf,
        fetchedAt: result.fetchedAt,
        computedAt: recordedAt,
      });
      if (!normalized.ok) {
        next.invalidRows += 1;
        continue;
      }
      const saved = await this.intelligence.upsertDailyHistory({
        securityId,
        sessionDate: normalized.bar.sessionDate,
        observedSymbol: normalized.bar.observedSymbol,
        exchange: normalized.bar.exchange,
        open: normalized.bar.open,
        high: normalized.bar.high,
        low: normalized.bar.low,
        close: normalized.bar.close,
        volume: normalized.bar.volume,
        dollarVolume: normalized.bar.dollarVolume,
        previousClose: normalized.bar.previousClose,
        movePct: normalized.bar.movePct,
        source: normalized.bar.source,
        sourceAsOf: normalized.bar.sourceAsOf,
        fetchedAt: normalized.bar.fetchedAt,
        computedAt: normalized.bar.computedAt,
        quality: "AUTHORITATIVE",
        freshness: "UNKNOWN",
        provenance: "PROVIDER",
      });
      if (!saved.ok) {
        next.invalidRows += 1;
        continue;
      }
      if (saved.noop) next.duplicateRows += 1;
      else next.rowsWritten += 1;
      await this.persistEpisode(securityId, normalized.bar, recordedAt, next);
    }
    return next;
  }

  private async persistEpisode(
    securityId: string,
    bar: {
      sessionDate: string;
      observedSymbol: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
      dollarVolume: number | null;
      movePct: number | null;
      previousClose: number | null;
    },
    recordedAt: string,
    checkpoint: BackfillCheckpoint,
  ): void {
    const sessions = await this.volumeSessions(securityId);
    const rvol = historicalDailyRvol(sessions, bar.sessionDate, bar.volume, this.config.rvolMinSessions);
    const detection = detectDailyEpisode({ ...bar, rvol }, this.config);
    if (detection.tier === "NORMAL") return;
    const bounds = etSessionBounds(bar.sessionDate);
    if (!bounds) {
      checkpoint.invalidRows += 1;
      return;
    }
    const existing = (await this.intelligence.listEpisodes(securityId)).find((episode) =>
      episode.securityId === securityId
      && episode.detectedBy === HISTORICAL_DAILY_DETECTOR_ID
      && episode.episodeStart === bounds.open,
    );
    const episode = existing
      ? { ok: true as const, record: existing }
      : await this.intelligence.putEpisode({
        securityId,
        episodeStart: bounds.open,
        episodeEnd: bounds.close,
        observedSymbol: bar.observedSymbol,
        direction: detection.direction,
        tier: detection.tier,
        startPrice: bar.open,
        highPrice: bar.high,
        lowPrice: bar.low,
        endPrice: bar.close,
        maxPositiveMovePct: detection.maxPositiveMovePct,
        maxNegativeMovePct: detection.maxNegativeMovePct,
        volume: bar.volume,
        dollarVolume: bar.dollarVolume,
        rvol,
        origin: "HISTORICAL_BACKFILL",
        detectedBy: HISTORICAL_DAILY_DETECTOR_ID,
        source: "historical-daily-v1",
        provenance: "DERIVED",
        quality: "DERIVED",
        freshness: "UNKNOWN",
        computedAt: recordedAt,
        recordedAt,
      });
    if (!episode.ok) {
      checkpoint.invalidRows += 1;
      return;
    }
    if (!existing) checkpoint.episodesByTier[detection.tier] += 1;
    const eligible = detection.tier === "SIGNIFICANT"
      || detection.tier === "EXTREME"
      || (detection.tier === "NOTABLE" && this.config.notableEligibleForDeepReconstruction);
    if (!eligible) return;
    if (checkpoint.deepReconstruction.some((item) => item.episodeId === episode.record.episodeId)) return;
    const queued: DeepReconstructionCandidate = {
      episodeId: episode.record.episodeId,
      tier: detection.tier,
      securityId,
      sessionDate: bar.sessionDate,
      reasons: detection.reasons,
      eligible: true,
    };
    checkpoint.deepReconstruction.push(queued);
  }

  private async previousClose(securityId: string, sessionDate: string): Promise<number | null> {
    const prior = (await this.intelligence.listDailyHistory(securityId))
      .filter((row) => row.securityId === securityId && row.sessionDate < sessionDate && row.close !== null)
      .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
    return prior[0]?.close ?? null;
  }

  private async volumeSessions(securityId: string): Promise<HistoricalVolumeSession[]> {
    return (await this.intelligence.listDailyHistory(securityId))
      .filter((row) => row.securityId === securityId)
      .map((row) => ({ sessionDate: row.sessionDate, volume: row.volume }));
  }
}

function emptyCheckpoint(securitiesTotal: number, dateFrom: string): BackfillCheckpoint {
  return {
    securityIndex: 0,
    nextChunkFrom: dateFrom,
    securitiesTotal,
    securitiesProcessed: 0,
    sessionsProcessed: 0,
    rowsWritten: 0,
    duplicateRows: 0,
    invalidRows: 0,
    providerErrors: 0,
    episodesByTier: { ...EMPTY_TIERS },
    coverage: null,
    deepReconstruction: [],
    lastSuccessfulSecurityIndex: 0,
    lastSuccessfulChunkFrom: dateFrom,
  };
}

function token(checkpoint: BackfillCheckpoint): string {
  return `${checkpoint.securityIndex}:${checkpoint.nextChunkFrom}`;
}

function advance(
  checkpoint: BackfillCheckpoint,
  chunkTo: string,
  dateFrom: string,
  dateTo: string,
): BackfillCheckpoint {
  const nextFrom = addCalendarDays(chunkTo, 1);
  if (nextFrom <= dateTo) {
    return {
      ...checkpoint,
      nextChunkFrom: nextFrom,
      lastSuccessfulSecurityIndex: checkpoint.securityIndex,
      lastSuccessfulChunkFrom: nextFrom,
    };
  }
  return {
    ...checkpoint,
    securityIndex: checkpoint.securityIndex + 1,
    nextChunkFrom: dateFrom,
    securitiesProcessed: checkpoint.securitiesProcessed + 1,
    lastSuccessfulSecurityIndex: checkpoint.securityIndex + 1,
    lastSuccessfulChunkFrom: dateFrom,
  };
}

function minDate(left: string, right: string): string {
  return left < right ? left : right;
}

function symbolSegments(
  history: readonly SecuritySymbolHistory[],
  chunkFrom: string,
  chunkTo: string,
): Array<{ symbol: string; exchange: string | null; dateFrom: string; dateTo: string }> {
  return history
    .filter((row) => row.effectiveFrom <= chunkTo && (row.effectiveTo === null || row.effectiveTo >= chunkFrom))
    .map((row) => ({
      symbol: row.symbol,
      exchange: row.exchange,
      dateFrom: row.effectiveFrom > chunkFrom ? row.effectiveFrom : chunkFrom,
      dateTo: row.effectiveTo !== null && row.effectiveTo < chunkTo ? row.effectiveTo : chunkTo,
    }))
    .filter((segment) => segment.dateFrom <= segment.dateTo)
    .sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readSecurityIds(metadata: Record<string, unknown> | null): string[] {
  if (!metadata || !Array.isArray(metadata.securityIds)) return [];
  return metadata.securityIds.filter((id): id is string => typeof id === "string");
}

function readCheckpoint(
  metadata: Record<string, unknown> | null,
  securitiesTotal: number,
  dateFrom: string,
): BackfillCheckpoint {
  const fallback = emptyCheckpoint(securitiesTotal, dateFrom);
  if (!metadata || !isRecord(metadata.checkpoint)) return fallback;
  const raw = metadata.checkpoint;
  const tiers = isRecord(raw.episodesByTier) ? raw.episodesByTier : {};
  return {
    securityIndex: numberOr(raw.securityIndex, fallback.securityIndex),
    nextChunkFrom: typeof raw.nextChunkFrom === "string" ? raw.nextChunkFrom : fallback.nextChunkFrom,
    securitiesTotal: numberOr(raw.securitiesTotal, securitiesTotal),
    securitiesProcessed: numberOr(raw.securitiesProcessed, 0),
    sessionsProcessed: numberOr(raw.sessionsProcessed, 0),
    rowsWritten: numberOr(raw.rowsWritten, 0),
    duplicateRows: numberOr(raw.duplicateRows, 0),
    invalidRows: numberOr(raw.invalidRows, 0),
    providerErrors: numberOr(raw.providerErrors, 0),
    episodesByTier: {
      NOTABLE: numberOr(tiers.NOTABLE, 0),
      SIGNIFICANT: numberOr(tiers.SIGNIFICANT, 0),
      EXTREME: numberOr(tiers.EXTREME, 0),
    },
    coverage: typeof raw.coverage === "string" ? raw.coverage as ProviderCoverage : null,
    deepReconstruction: Array.isArray(raw.deepReconstruction) ? raw.deepReconstruction as DeepReconstructionCandidate[] : [],
    lastSuccessfulSecurityIndex: numberOr(raw.lastSuccessfulSecurityIndex, 0),
    lastSuccessfulChunkFrom: typeof raw.lastSuccessfulChunkFrom === "string" ? raw.lastSuccessfulChunkFrom : dateFrom,
  };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
