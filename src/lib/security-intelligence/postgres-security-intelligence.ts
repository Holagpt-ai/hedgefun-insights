import { AsyncLocalStorage } from "node:async_hooks";
import type { Sql, TransactionSql } from "postgres";
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

  constructor(private readonly sql: Sql) {}

  private db(): Db {
    return this.txContext.getStore() ?? this.sql;
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.sql.begin(async (tx) => this.txContext.run(tx, async () => {
      try {
        return await fn();
      } catch (error) {
        this.dailyCache.clear();
        this.episodeCache.clear();
        throw error;
      }
    }));
  }

  async upsertDailyHistory(input: DailyHistoryInput): Promise<IntelligenceWriteResult<SecurityDailyHistory>> {
    const probed = createSecurityIntelligenceStore().upsertDailyHistory(input);
    if (!probed.ok) return probed;
    const existing = await this.getDailyHistory(probed.record.securityId, probed.record.sessionDate);
    if (existing) {
      if (sameDaily(existing, probed.record)) return { ...probed, record: existing, noop: true };
      return fail("conflicting daily history for securityId and sessionDate");
    }
    const row = probed.record;
    await this.db()`
      insert into public.security_daily_history (
        security_id, session_date, observed_symbol, exchange, open, high, low, close, volume,
        dollar_volume, previous_close, move_pct, source, source_as_of, fetched_at, computed_at,
        quality, freshness, provenance
      ) values (
        ${row.securityId}, ${row.sessionDate}, ${row.observedSymbol}, ${row.exchange},
        ${row.open}, ${row.high}, ${row.low}, ${row.close}, ${row.volume},
        ${row.dollarVolume}, ${row.previousClose}, ${row.movePct}, ${row.source}, ${row.sourceAsOf},
        ${row.fetchedAt}, ${row.computedAt}, ${row.quality}, ${row.freshness}, ${row.provenance}
      )
    `;
    const cached = this.dailyCache.get(row.securityId);
    if (cached) cached.push(row);
    return probed;
  }

  async getDailyHistory(securityId: string, sessionDate: string): Promise<SecurityDailyHistory | null> {
    const cached = this.dailyCache.get(securityId)?.find((row) => row.sessionDate === sessionDate);
    if (cached) return cached;
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
    const mapped = rows.map(mapDaily);
    if (securityId !== undefined) this.dailyCache.set(securityId, mapped);
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
    const mapped = rows.map(mapEpisode);
    if (securityId !== undefined) this.episodeCache.set(securityId, mapped);
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
    await this.db()`
      insert into public.market_behavior_episodes (
        episode_id, security_id, episode_start, episode_end, observed_symbol, direction, tier,
        start_price, high_price, low_price, end_price, max_positive_move_pct, max_negative_move_pct,
        volume, dollar_volume, rvol, float_turnover, halt_count, close_strength, detected_by, origin,
        source, source_as_of, fetched_at, computed_at, quality, freshness, provenance, created_at, updated_at
      ) values (
        ${row.episodeId}, ${row.securityId}, ${row.episodeStart}, ${row.episodeEnd}, ${row.observedSymbol},
        ${row.direction}, ${row.tier}, ${row.startPrice}, ${row.highPrice}, ${row.lowPrice}, ${row.endPrice},
        ${row.maxPositiveMovePct}, ${row.maxNegativeMovePct}, ${row.volume}, ${row.dollarVolume}, ${row.rvol},
        ${row.floatTurnover}, ${row.haltCount}, ${row.closeStrength}, ${row.detectedBy}, ${row.origin},
        ${row.source}, ${row.sourceAsOf}, ${row.fetchedAt}, ${row.computedAt}, ${row.quality}, ${row.freshness},
        ${row.provenance}, ${row.createdAt}, ${row.updatedAt}
      )
    `;
    const cached = this.episodeCache.get(row.securityId);
    if (cached) cached.push(row);
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

  private async insertJob(row: SecurityBackfillJob): Promise<void> {
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
