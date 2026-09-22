import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HISTORICAL_BACKFILL_WRITE_BATCH_SIZE } from "@/config/historical-backfill.config";
import { SECURITY_INTELLIGENCE_VERSION } from "@/config/security-intelligence.config";
import { selectAllPages } from "@/lib/persistence/supabase-server";
import {
  createSecurityIntelligenceStore,
  type BackfillJobInput,
  type BackfillTransitionInput,
  type DailyHistoryInput,
  type EpisodeInput,
} from "@/lib/security-intelligence/security-intelligence";
import { HistoricalFactConflictError } from "@/lib/security-intelligence/postgres-security-intelligence";
import type {
  IntelligenceWriteResult,
  MarketBehaviorEpisode,
  SecurityBackfillJob,
  SecurityDailyHistory,
} from "@/types/security-intelligence";

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

function chunks<T>(items: readonly T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size));
  return groups;
}

function jsonField(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value);
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

function dailyToRpcRow(row: SecurityDailyHistory): Record<string, string> {
  return {
    security_id: row.securityId,
    session_date: row.sessionDate,
    observed_symbol: jsonField(row.observedSymbol),
    exchange: jsonField(row.exchange),
    open: jsonField(row.open),
    high: jsonField(row.high),
    low: jsonField(row.low),
    close: jsonField(row.close),
    volume: jsonField(row.volume),
    dollar_volume: jsonField(row.dollarVolume),
    previous_close: jsonField(row.previousClose),
    move_pct: jsonField(row.movePct),
    source: jsonField(row.source),
    source_as_of: jsonField(row.sourceAsOf),
    fetched_at: jsonField(row.fetchedAt),
    computed_at: jsonField(row.computedAt),
    quality: row.quality,
    freshness: row.freshness,
    provenance: row.provenance,
  };
}

function episodeToRpcRow(row: MarketBehaviorEpisode): Record<string, string> {
  return {
    episode_id: row.episodeId,
    security_id: row.securityId,
    episode_start: jsonField(row.episodeStart),
    episode_end: jsonField(row.episodeEnd),
    observed_symbol: jsonField(row.observedSymbol),
    direction: row.direction,
    tier: row.tier,
    start_price: jsonField(row.startPrice),
    high_price: jsonField(row.highPrice),
    low_price: jsonField(row.lowPrice),
    end_price: jsonField(row.endPrice),
    max_positive_move_pct: jsonField(row.maxPositiveMovePct),
    max_negative_move_pct: jsonField(row.maxNegativeMovePct),
    volume: jsonField(row.volume),
    dollar_volume: jsonField(row.dollarVolume),
    rvol: jsonField(row.rvol),
    float_turnover: jsonField(row.floatTurnover),
    halt_count: jsonField(row.haltCount),
    close_strength: jsonField(row.closeStrength),
    detected_by: jsonField(row.detectedBy),
    origin: row.origin,
    source: jsonField(row.source),
    source_as_of: jsonField(row.sourceAsOf),
    fetched_at: jsonField(row.fetchedAt),
    computed_at: jsonField(row.computedAt),
    quality: row.quality,
    freshness: row.freshness,
    provenance: row.provenance,
    created_at: jsonField(row.createdAt),
    updated_at: jsonField(row.updatedAt),
  };
}

function rpcError(error: { message: string }): never {
  if (error.message.includes("conflicting daily history")) {
    throw new HistoricalFactConflictError(error.message);
  }
  throw new Error(error.message);
}

const DAILY_SELECT = "security_id, session_date, observed_symbol, exchange, open, high, low, close, volume, dollar_volume, previous_close, move_pct, source, source_as_of, fetched_at, computed_at, quality, freshness, provenance";
const EPISODE_SELECT = "episode_id, security_id, episode_start, episode_end, observed_symbol, direction, tier, start_price, high_price, low_price, end_price, max_positive_move_pct, max_negative_move_pct, volume, dollar_volume, rvol, float_turnover, halt_count, close_strength, detected_by, origin, source, source_as_of, fetched_at, computed_at, quality, freshness, provenance, created_at, updated_at";

export class SupabaseSecurityIntelligenceRepository {
  private readonly txDepth = new AsyncLocalStorage<number>();
  private readonly dailyCache = new Map<string, SecurityDailyHistory[]>();
  private readonly episodeCache = new Map<string, MarketBehaviorEpisode[]>();
  private readonly pendingDaily: SecurityDailyHistory[] = [];
  private readonly pendingEpisodes: MarketBehaviorEpisode[] = [];

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly batchSize = HISTORICAL_BACKFILL_WRITE_BATCH_SIZE,
  ) {}

  private inTransaction(): boolean {
    return (this.txDepth.getStore() ?? 0) > 0;
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const parent = this.txDepth.getStore() ?? 0;
    return this.txDepth.run(parent + 1, async () => {
      const depth = parent + 1;
      try {
        const result = await fn();
        if (depth === 1) await this.flushPending();
        return result;
      } catch (error) {
        if (depth === 1) {
          this.pendingDaily.length = 0;
          this.pendingEpisodes.length = 0;
          this.dailyCache.clear();
          this.episodeCache.clear();
        }
        throw error;
      }
    });
  }

  async upsertDailyHistory(input: DailyHistoryInput): Promise<IntelligenceWriteResult<SecurityDailyHistory>> {
    const probed = createSecurityIntelligenceStore().upsertDailyHistory(input);
    if (!probed.ok) return probed;
    const existing = await this.getDailyHistory(probed.record.securityId, probed.record.sessionDate);
    if (existing) {
      if (sameDaily(existing, probed.record)) return { ...probed, record: existing, noop: true };
      const message = "conflicting daily history for securityId and sessionDate";
      if (this.inTransaction()) throw new HistoricalFactConflictError(message);
      return fail(message);
    }
    const row = probed.record;
    this.pendingDaily.push(row);
    this.rememberDaily(row);
    if (!this.inTransaction() || this.pendingDaily.length >= this.batchSize) await this.flushDaily();
    return probed;
  }

  async getDailyHistory(securityId: string, sessionDate: string): Promise<SecurityDailyHistory | null> {
    const cached = this.dailyCache.get(securityId);
    if (cached) return cached.find((row) => row.sessionDate === sessionDate) ?? null;
    const pending = this.pendingDaily.find((row) => row.securityId === securityId && row.sessionDate === sessionDate);
    if (pending) return pending;
    const { data, error } = await this.supabase
      .from("security_daily_history")
      .select(DAILY_SELECT)
      .eq("security_id", securityId)
      .eq("session_date", sessionDate)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapDaily(data as Record<string, unknown>) : null;
  }

  async listDailyHistory(securityId?: string): Promise<readonly SecurityDailyHistory[]> {
    if (securityId !== undefined) {
      const cached = this.dailyCache.get(securityId);
      if (cached) return cached;
    }
    const rows = securityId === undefined
      ? await selectAllPages<Record<string, unknown>>((from, to) =>
        this.supabase.from("security_daily_history").select(DAILY_SELECT).range(from, to),
      )
      : await selectAllPages<Record<string, unknown>>((from, to) =>
        this.supabase.from("security_daily_history").select(DAILY_SELECT).eq("security_id", securityId).range(from, to),
      );
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
      ? await selectAllPages<Record<string, unknown>>((from, to) =>
        this.supabase.from("market_behavior_episodes").select(EPISODE_SELECT).range(from, to),
      )
      : await selectAllPages<Record<string, unknown>>((from, to) =>
        this.supabase.from("market_behavior_episodes").select(EPISODE_SELECT).eq("security_id", securityId).range(from, to),
      );
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
    if (!this.inTransaction() || this.pendingEpisodes.length >= this.batchSize) await this.flushEpisodes();
    return probed;
  }

  async createBackfillJob(input: BackfillJobInput): Promise<IntelligenceWriteResult<SecurityBackfillJob>> {
    const created = createSecurityIntelligenceStore().createBackfillJob(input);
    if (!created.ok) return created;
    await this.insertJob(created.record);
    return created;
  }

  async getJob(jobId: string): Promise<SecurityBackfillJob | null> {
    const { data, error } = await this.supabase
      .from("security_backfill_jobs")
      .select("job_id, job_type, state, date_from, date_to, cursor_date, cursor_token, processed_count, error_count, started_at, updated_at, completed_at, metadata")
      .eq("job_id", jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapJob(data as Record<string, unknown>) : null;
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
    for (const group of chunks(queued, this.batchSize)) {
      const { error } = await this.supabase.rpc("historical_apply_daily_batch", {
        p_rows: group.map(dailyToRpcRow),
      });
      if (error) rpcError(error);
    }
  }

  private async flushEpisodes(): Promise<void> {
    if (this.pendingEpisodes.length === 0) return;
    const queued = this.pendingEpisodes.splice(0, this.pendingEpisodes.length);
    for (const group of chunks(queued, this.batchSize)) {
      const { error } = await this.supabase.rpc("historical_apply_episode_batch", {
        p_rows: group.map(episodeToRpcRow),
      });
      if (error) rpcError(error);
    }
  }

  private async insertJob(row: SecurityBackfillJob): Promise<void> {
    const { error } = await this.supabase.from("security_backfill_jobs").insert({
      job_id: row.jobId,
      job_type: row.jobType,
      state: row.state,
      date_from: row.dateFrom,
      date_to: row.dateTo,
      cursor_date: row.cursorDate,
      cursor_token: row.cursorToken,
      processed_count: row.processedCount,
      error_count: row.errorCount,
      started_at: row.startedAt,
      updated_at: row.updatedAt,
      completed_at: row.completedAt,
      metadata: row.metadata,
    });
    if (error) throw new Error(error.message);
  }

  private async updateJob(row: SecurityBackfillJob): Promise<void> {
    const { error } = await this.supabase.from("security_backfill_jobs").update({
      state: row.state,
      cursor_date: row.cursorDate,
      cursor_token: row.cursorToken,
      processed_count: row.processedCount,
      error_count: row.errorCount,
      started_at: row.startedAt,
      updated_at: row.updatedAt,
      completed_at: row.completedAt,
      metadata: row.metadata,
    }).eq("job_id", row.jobId);
    if (error) throw new Error(error.message);
  }
}
