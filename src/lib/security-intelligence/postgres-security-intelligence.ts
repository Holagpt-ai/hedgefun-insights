import { AsyncLocalStorage } from "node:async_hooks";
import type { Sql, TransactionSql } from "postgres";
import { HISTORICAL_BACKFILL_WRITE_BATCH_SIZE } from "@/config/historical-backfill.config";
import { SECURITY_INTELLIGENCE_VERSION } from "@/config/security-intelligence.config";
import {
  createSecurityIntelligenceStore,
  type BackfillJobInput,
  type BackfillTransitionInput,
  type DailyHistoryInput,
  type EpisodeInput,
} from "@/lib/security-intelligence/security-intelligence";
import type {
  IntelligenceWriteResult,
  MarketBehaviorEpisode,
  SecurityBackfillJob,
  SecurityDailyHistory,
} from "@/types/security-intelligence";

type Db = Sql | TransactionSql;

const DAILY_FIELDS = [
  "securityId",
  "sessionDate",
  "observedSymbol",
  "exchange",
  "open",
  "high",
  "low",
  "close",
  "volume",
  "dollarVolume",
  "previousClose",
  "movePct",
  "source",
  "quality",
  "provenance",
] as const;

function fail(reason: string): IntelligenceWriteResult<never> {
  return { version: SECURITY_INTELLIGENCE_VERSION, ok: false, reason };
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string | null {
  if (value == null) return null;
  return String(value);
}

function iso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : null;
  }
  if (typeof value === "object") return value as Record<string, unknown>;
  return null;
}

function sameDaily(left: SecurityDailyHistory, right: SecurityDailyHistory): boolean {
  return DAILY_FIELDS.every((field) => left[field] === right[field]);
}

export class HistoricalFactConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HistoricalFactConflictError";
  }
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size));
  return groups;
}

export interface HistoricalWriteProfile {
  transactions: number;
  dailyInsertStatements: number;
  dailyInsertRows: number;
  dailySelects: number;
  episodeInsertStatements: number;
  episodeInsertRows: number;
  episodeSelects: number;
  jobStatements: number;
}

function mapDaily(row: Record<string, unknown>): SecurityDailyHistory {
  return {
    securityId: String(row.security_id),
    sessionDate: String(row.session_date).slice(0, 10),
    observedSymbol: text(row.observed_symbol),
    exchange: text(row.exchange),
    open: num(row.open),
    high: num(row.high),
    low: num(row.low),
    close: num(row.close),
    volume: num(row.volume),
    dollarVolume: num(row.dollar_volume),
    previousClose: num(row.previous_close),
    movePct: num(row.move_pct),
    source: text(row.source),
    sourceAsOf: iso(row.source_as_of),
    fetchedAt: iso(row.fetched_at),
    computedAt: iso(row.computed_at),
    quality: row.quality as SecurityDailyHistory["quality"],
    freshness: row.freshness as SecurityDailyHistory["freshness"],
    provenance: row.provenance as SecurityDailyHistory["provenance"],
  };
}

function mapEpisode(row: Record<string, unknown>): MarketBehaviorEpisode {
  return {
    episodeId: String(row.episode_id),
    securityId: String(row.security_id),
    episodeStart: iso(row.episode_start) ?? "",
    episodeEnd: iso(row.episode_end),
    observedSymbol: text(row.observed_symbol),
    direction: row.direction as MarketBehaviorEpisode["direction"],
    tier: row.tier as MarketBehaviorEpisode["tier"],
    startPrice: num(row.start_price),
    highPrice: num(row.high_price),
    lowPrice: num(row.low_price),
    endPrice: num(row.end_price),
    maxPositiveMovePct: num(row.max_positive_move_pct),
    maxNegativeMovePct: num(row.max_negative_move_pct),
    volume: num(row.volume),
    dollarVolume: num(row.dollar_volume),
    rvol: num(row.rvol),
    floatTurnover: num(row.float_turnover),
    haltCount: num(row.halt_count),
    closeStrength: num(row.close_strength),
    detectedBy: text(row.detected_by),
    origin: row.origin as MarketBehaviorEpisode["origin"],
    source: text(row.source),
    sourceAsOf: iso(row.source_as_of),
    fetchedAt: iso(row.fetched_at),
    computedAt: iso(row.computed_at),
    quality: row.quality as MarketBehaviorEpisode["quality"],
    freshness: row.freshness as MarketBehaviorEpisode["freshness"],
    provenance: row.provenance as MarketBehaviorEpisode["provenance"],
    createdAt: iso(row.created_at) ?? "",
    updatedAt: iso(row.updated_at) ?? "",
  };
}

function mapJob(row: Record<string, unknown>): SecurityBackfillJob {
  return {
    jobId: String(row.job_id),
    jobType: String(row.job_type),
    state: row.state as SecurityBackfillJob["state"],
    dateFrom: String(row.date_from).slice(0, 10),
    dateTo: String(row.date_to).slice(0, 10),
    cursorDate: row.cursor_date == null ? null : String(row.cursor_date).slice(0, 10),
    cursorToken: text(row.cursor_token),
    processedCount: num(row.processed_count) ?? 0,
    errorCount: num(row.error_count) ?? 0,
    startedAt: iso(row.started_at),
    updatedAt: iso(row.updated_at) ?? "",
    completedAt: iso(row.completed_at),
    metadata: jsonObject(row.metadata),
  };
}

/**
 * PostgreSQL persistence for historical intelligence.
 * Validation stays in SecurityIntelligenceStore. This class stores the accepted records.
 */
export class PostgresSecurityIntelligenceRepository {
  private readonly txContext = new AsyncLocalStorage<TransactionSql>();
  private readonly dailyCache = new Map<string, SecurityDailyHistory[]>();
  private readonly episodeCache = new Map<string, MarketBehaviorEpisode[]>();
  private readonly pendingDaily: SecurityDailyHistory[] = [];
  private readonly pendingEpisodes: MarketBehaviorEpisode[] = [];
  readonly writeProfile: HistoricalWriteProfile = {
    transactions: 0,
    dailyInsertStatements: 0,
    dailyInsertRows: 0,
    dailySelects: 0,
    episodeInsertStatements: 0,
    episodeInsertRows: 0,
    episodeSelects: 0,
    jobStatements: 0,
  };

  constructor(
    private readonly sql: Sql,
    private readonly batchSize = HISTORICAL_BACKFILL_WRITE_BATCH_SIZE,
  ) {}

  private db(): Db {
    return this.txContext.getStore() ?? this.sql;
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return (await this.sql.begin(async (tx) => this.txContext.run(tx, async () => {
      this.writeProfile.transactions += 1;
      try {
        const result = await fn();
        await this.flushPending();
        return result;
      } catch (error) {
        this.pendingDaily.length = 0;
        this.pendingEpisodes.length = 0;
        this.dailyCache.clear();
        this.episodeCache.clear();
        throw error;
      }
    }))) as T;
  }

  async upsertDailyHistory(input: DailyHistoryInput): Promise<IntelligenceWriteResult<SecurityDailyHistory>> {
    const probed = createSecurityIntelligenceStore().upsertDailyHistory(input);
    if (!probed.ok) return probed;
    const existing = await this.getDailyHistory(probed.record.securityId, probed.record.sessionDate);
    if (existing) {
      if (sameDaily(existing, probed.record)) return { ...probed, record: existing, noop: true };
      const message = "conflicting daily history for securityId and sessionDate";
      if (this.txContext.getStore()) throw new HistoricalFactConflictError(message);
      return fail(message);
    }
    const row = probed.record;
    this.pendingDaily.push(row);
    this.rememberDaily(row);
    if (!this.txContext.getStore() || this.pendingDaily.length >= this.batchSize) await this.flushDaily();
    return probed;
  }

  async getDailyHistory(securityId: string, sessionDate: string): Promise<SecurityDailyHistory | null> {
    const cached = this.dailyCache.get(securityId);
    if (cached) return cached.find((row) => row.sessionDate === sessionDate) ?? null;
    const pending = this.pendingDaily.find((row) => row.securityId === securityId && row.sessionDate === sessionDate);
    if (pending) return pending;
    this.writeProfile.dailySelects += 1;
    const rows = await this.db()<Record<string, unknown>[]>`
      select security_id, session_date::text, observed_symbol, exchange, open, high, low, close, volume,
             dollar_volume, previous_close, move_pct, source, source_as_of, fetched_at, computed_at,
             quality, freshness, provenance
      from public.security_daily_history
      where security_id = ${securityId} and session_date = ${sessionDate}
    `;
    return rows[0] ? mapDaily(rows[0]) : null;
  }

  async listDailyHistory(securityId?: string): Promise<readonly SecurityDailyHistory[]> {
    if (securityId !== undefined) {
      const cached = this.dailyCache.get(securityId);
      if (cached) return cached;
    }
    const rows = securityId === undefined
      ? await this.db()<Record<string, unknown>[]>`
          select security_id, session_date::text, observed_symbol, exchange, open, high, low, close, volume,
                 dollar_volume, previous_close, move_pct, source, source_as_of, fetched_at, computed_at,
                 quality, freshness, provenance
          from public.security_daily_history
        `
      : await this.db()<Record<string, unknown>[]>`
          select security_id, session_date::text, observed_symbol, exchange, open, high, low, close, volume,
                 dollar_volume, previous_close, move_pct, source, source_as_of, fetched_at, computed_at,
                 quality, freshness, provenance
          from public.security_daily_history
          where security_id = ${securityId}
        `;
    this.writeProfile.dailySelects += 1;
    const mapped = rows.map(mapDaily);
    if (securityId !== undefined) {
      for (const pending of this.pendingDaily) {
        if (pending.securityId === securityId && !mapped.some((row) => row.sessionDate === pending.sessionDate)) {
          mapped.push(pending);
        }
      }
      this.dailyCache.set(securityId, mapped);
    }
    return mapped;
  }

  async listEpisodes(securityId?: string): Promise<readonly MarketBehaviorEpisode[]> {
    if (securityId !== undefined) {
      const cached = this.episodeCache.get(securityId);
      if (cached) return cached;
    }
    const rows = securityId === undefined
      ? await this.db()<Record<string, unknown>[]>`
          select episode_id, security_id, episode_start, episode_end, observed_symbol, direction, tier,
                 start_price, high_price, low_price, end_price, max_positive_move_pct, max_negative_move_pct,
                 volume, dollar_volume, rvol, float_turnover, halt_count, close_strength, detected_by, origin,
                 source, source_as_of, fetched_at, computed_at, quality, freshness, provenance, created_at, updated_at
          from public.market_behavior_episodes
        `
      : await this.db()<Record<string, unknown>[]>`
          select episode_id, security_id, episode_start, episode_end, observed_symbol, direction, tier,
                 start_price, high_price, low_price, end_price, max_positive_move_pct, max_negative_move_pct,
                 volume, dollar_volume, rvol, float_turnover, halt_count, close_strength, detected_by, origin,
                 source, source_as_of, fetched_at, computed_at, quality, freshness, provenance, created_at, updated_at
          from public.market_behavior_episodes
          where security_id = ${securityId}
        `;
    this.writeProfile.episodeSelects += 1;
    const mapped = rows.map(mapEpisode);
    if (securityId !== undefined) {
      for (const pending of this.pendingEpisodes) {
        if (
          pending.securityId === securityId
          && !mapped.some((episode) => episode.detectedBy === pending.detectedBy && episode.episodeStart === pending.episodeStart)
        ) {
          mapped.push(pending);
        }
      }
      this.episodeCache.set(securityId, mapped);
    }
    return mapped;
  }

  async putEpisode(input: EpisodeInput): Promise<IntelligenceWriteResult<MarketBehaviorEpisode>> {
    const probed = createSecurityIntelligenceStore().putEpisode(input);
    if (!probed.ok) return probed;
    const existing = (await this.listEpisodes(probed.record.securityId)).find((episode) =>
      episode.detectedBy === probed.record.detectedBy && episode.episodeStart === probed.record.episodeStart,
    );
    if (existing) return { version: SECURITY_INTELLIGENCE_VERSION, ok: true, record: existing, noop: true };
    const row = probed.record;
    this.pendingEpisodes.push(row);
    const cached = this.episodeCache.get(row.securityId);
    if (cached) cached.push(row);
    if (!this.txContext.getStore() || this.pendingEpisodes.length >= this.batchSize) await this.flushEpisodes();
    return probed;
  }

  async createBackfillJob(input: BackfillJobInput): Promise<IntelligenceWriteResult<SecurityBackfillJob>> {
    const created = createSecurityIntelligenceStore().createBackfillJob(input);
    if (!created.ok) return created;
    await this.insertJob(created.record);
    return created;
  }

  async getJob(jobId: string): Promise<SecurityBackfillJob | null> {
    const rows = await this.db()<Record<string, unknown>[]>`
      select job_id, job_type, state, date_from::text, date_to::text, cursor_date::text, cursor_token,
             processed_count, error_count, started_at, updated_at, completed_at, metadata
      from public.security_backfill_jobs
      where job_id = ${jobId}
    `;
    return rows[0] ? mapJob(rows[0]) : null;
  }

  async recordBackfillCheckpoint(
    jobId: string,
    input: BackfillTransitionInput,
  ): Promise<IntelligenceWriteResult<SecurityBackfillJob>> {
    const current = await this.getJob(jobId);
    if (!current) return fail("job not found");
    const memory = this.memoryAt(current);
    const recorded = memory.recordBackfillCheckpoint(jobId, input);
    if (!recorded.ok) return recorded;
    await this.updateJob(recorded.record);
    return recorded;
  }

  async transitionBackfillJob(
    jobId: string,
    input: BackfillTransitionInput,
  ): Promise<IntelligenceWriteResult<SecurityBackfillJob>> {
    const current = await this.getJob(jobId);
    if (!current) return fail("job not found");
    const memory = this.memoryAt(current);
    const next = memory.transitionBackfillJob(jobId, input);
    if (!next.ok) return next;
    await this.updateJob(next.record);
    return next;
  }

  private memoryAt(current: SecurityBackfillJob) {
    const memory = createSecurityIntelligenceStore();
    const created = memory.createBackfillJob({
      jobId: current.jobId,
      jobType: current.jobType,
      dateFrom: current.dateFrom,
      dateTo: current.dateTo,
      recordedAt: current.updatedAt,
      metadata: current.metadata,
    });
    if (!created.ok) return memory;
    if (current.state === "PENDING") return memory;
    memory.transitionBackfillJob(current.jobId, {
      to: "RUNNING",
      recordedAt: current.startedAt ?? current.updatedAt,
      cursorDate: current.cursorDate,
      cursorToken: current.cursorToken,
      processedCount: current.processedCount,
      errorCount: current.errorCount,
      metadata: current.metadata,
    });
    if (current.state === "RUNNING") return memory;
    memory.transitionBackfillJob(current.jobId, {
      to: current.state,
      recordedAt: current.updatedAt,
      cursorDate: current.cursorDate,
      cursorToken: current.cursorToken,
      processedCount: current.processedCount,
      errorCount: current.errorCount,
      metadata: current.metadata,
    });
    return memory;
  }

  private rememberDaily(row: SecurityDailyHistory): void {
    const cached = this.dailyCache.get(row.securityId);
    if (cached && !cached.some((item) => item.sessionDate === row.sessionDate)) cached.push(row);
  }

  private async flushPending(): Promise<void> {
    await this.flushDaily();
    await this.flushEpisodes();
  }

  private async flushDaily(): Promise<void> {
    if (this.pendingDaily.length === 0) return;
    const queued = this.pendingDaily.splice(0, this.pendingDaily.length);
    for (const group of chunks(queued, this.batchSize)) await this.insertDailyBatch(group);
  }

  private async insertDailyBatch(group: SecurityDailyHistory[]): Promise<void> {
    const bySecurity = new Map<string, SecurityDailyHistory[]>();
    for (const row of group) {
      const list = bySecurity.get(row.securityId) ?? [];
      list.push(row);
      bySecurity.set(row.securityId, list);
    }
    const accepted: SecurityDailyHistory[] = [];
    for (const [securityId, rows] of bySecurity) {
      this.writeProfile.dailySelects += 1;
      const existing = await this.db()<Record<string, unknown>[]>`
        select security_id, session_date::text, observed_symbol, exchange, open, high, low, close, volume,
               dollar_volume, previous_close, move_pct, source, source_as_of, fetched_at, computed_at,
               quality, freshness, provenance
        from public.security_daily_history
        where security_id = ${securityId}
          and session_date in ${this.db()(rows.map((row) => row.sessionDate))}
      `;
      const stored = new Map(existing.map((row) => [String(row.session_date).slice(0, 10), mapDaily(row)]));
      for (const row of rows) {
        const current = stored.get(row.sessionDate);
        if (!current) {
          accepted.push(row);
          continue;
        }
        if (sameDaily(current, row)) continue;
        throw new HistoricalFactConflictError("conflicting daily history for securityId and sessionDate");
      }
    }
    for (const batch of chunks(accepted, this.batchSize)) {
      this.writeProfile.dailyInsertStatements += 1;
      this.writeProfile.dailyInsertRows += batch.length;
      await this.db()`
        insert into public.security_daily_history ${this.db()(batch.map((row) => ({
          security_id: row.securityId,
          session_date: row.sessionDate,
          observed_symbol: row.observedSymbol,
          exchange: row.exchange,
          open: row.open,
          high: row.high,
          low: row.low,
          close: row.close,
          volume: row.volume,
          dollar_volume: row.dollarVolume,
          previous_close: row.previousClose,
          move_pct: row.movePct,
          source: row.source,
          source_as_of: row.sourceAsOf,
          fetched_at: row.fetchedAt,
          computed_at: row.computedAt,
          quality: row.quality,
          freshness: row.freshness,
          provenance: row.provenance,
        })))}
      `;
    }
  }

  private async flushEpisodes(): Promise<void> {
    if (this.pendingEpisodes.length === 0) return;
    const queued = this.pendingEpisodes.splice(0, this.pendingEpisodes.length);
    for (const group of chunks(queued, this.batchSize)) await this.insertEpisodeBatch(group);
  }

  private async insertEpisodeBatch(group: MarketBehaviorEpisode[]): Promise<void> {
    const byKey = new Map<string, MarketBehaviorEpisode[]>();
    for (const row of group) {
      const key = `${row.securityId}\u0000${row.detectedBy ?? ""}`;
      const list = byKey.get(key) ?? [];
      list.push(row);
      byKey.set(key, list);
    }
    const accepted: MarketBehaviorEpisode[] = [];
    for (const rows of byKey.values()) {
      const securityId = rows[0].securityId;
      const detectedBy = rows[0].detectedBy;
      this.writeProfile.episodeSelects += 1;
      const existing = await this.db()<Record<string, unknown>[]>`
        select episode_id, security_id, episode_start, detected_by
        from public.market_behavior_episodes
        where security_id = ${securityId}
          and detected_by is not distinct from ${detectedBy}
          and episode_start in ${this.db()(rows.map((row) => row.episodeStart))}
      `;
      const stored = new Set(existing.map((row) => iso(row.episode_start)));
      for (const row of rows) {
        if (stored.has(row.episodeStart)) continue;
        accepted.push(row);
      }
    }
    for (const batch of chunks(accepted, this.batchSize)) {
      this.writeProfile.episodeInsertStatements += 1;
      this.writeProfile.episodeInsertRows += batch.length;
      await this.db()`
        insert into public.market_behavior_episodes ${this.db()(batch.map((row) => ({
          episode_id: row.episodeId,
          security_id: row.securityId,
          episode_start: row.episodeStart,
          episode_end: row.episodeEnd,
          observed_symbol: row.observedSymbol,
          direction: row.direction,
          tier: row.tier,
          start_price: row.startPrice,
          high_price: row.highPrice,
          low_price: row.lowPrice,
          end_price: row.endPrice,
          max_positive_move_pct: row.maxPositiveMovePct,
          max_negative_move_pct: row.maxNegativeMovePct,
          volume: row.volume,
          dollar_volume: row.dollarVolume,
          rvol: row.rvol,
          float_turnover: row.floatTurnover,
          halt_count: row.haltCount,
          close_strength: row.closeStrength,
          detected_by: row.detectedBy,
          origin: row.origin,
          source: row.source,
          source_as_of: row.sourceAsOf,
          fetched_at: row.fetchedAt,
          computed_at: row.computedAt,
          quality: row.quality,
          freshness: row.freshness,
          provenance: row.provenance,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
        })))}
      `;
    }
  }

  private async insertJob(row: SecurityBackfillJob): Promise<void> {
    this.writeProfile.jobStatements += 1;
    await this.db()`
      insert into public.security_backfill_jobs (
        job_id, job_type, state, date_from, date_to, cursor_date, cursor_token,
        processed_count, error_count, started_at, updated_at, completed_at, metadata
      ) values (
        ${row.jobId}, ${row.jobType}, ${row.state}, ${row.dateFrom}, ${row.dateTo},
        ${row.cursorDate}, ${row.cursorToken}, ${row.processedCount}, ${row.errorCount},
        ${row.startedAt}, ${row.updatedAt}, ${row.completedAt},
        ${row.metadata === null ? null : this.sql.json(row.metadata)}
      )
    `;
  }

  private async updateJob(row: SecurityBackfillJob): Promise<void> {
    this.writeProfile.jobStatements += 1;
    await this.db()`
      update public.security_backfill_jobs set
        state = ${row.state},
        cursor_date = ${row.cursorDate},
        cursor_token = ${row.cursorToken},
        processed_count = ${row.processedCount},
        error_count = ${row.errorCount},
        started_at = ${row.startedAt},
        updated_at = ${row.updatedAt},
        completed_at = ${row.completedAt},
        metadata = ${row.metadata === null ? null : this.sql.json(row.metadata)}
      where job_id = ${row.jobId}
    `;
  }
}
