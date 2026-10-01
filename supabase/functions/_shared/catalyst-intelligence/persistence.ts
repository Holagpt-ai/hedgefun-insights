import { UniqueConflictError } from "./conflicts.ts";
import { selectDueSources } from "./source-registry.ts";
import type {
  BotConfig,
  BotId,
  CanonicalEvent,
  EvidenceRecord,
  RawItemRecord,
  ReactionRecord,
  ReactionWindow,
  RunTelemetry,
  SourceRecord,
  TickerLink,
} from "./types.ts";

export interface SourceQuery {
  sourceType?: SourceRecord["sourceType"];
  enabledOnly?: boolean;
  sourceKeys?: string[];
}

export interface DueSourceQuery {
  sourceType?: SourceRecord["sourceType"];
  now: Date;
  limit: number;
  allowlist?: readonly string[];
}

export interface CatalystIntelStore {
  getBotConfig(bot: BotId): Promise<BotConfig | null>;
  listSources(query: SourceQuery): Promise<SourceRecord[]>;
  listDueSources(input: DueSourceQuery): Promise<SourceRecord[]>;
  saveSource(source: SourceRecord): Promise<void>;
  saveRun(run: RunTelemetry): Promise<void>;
  findRawByExternal(sourceId: string, externalId: string): Promise<RawItemRecord | null>;
  findRawByHash(sourceId: string, contentHash: string): Promise<RawItemRecord | null>;
  insertRaw(item: RawItemRecord): Promise<void>;
  findEvidenceByRaw(rawItemId: string): Promise<EvidenceRecord | null>;
  listEvidence(eventId: string): Promise<EvidenceRecord[]>;
  evidenceForUrl(url: string): Promise<EvidenceRecord[]>;
  evidenceForHash(contentHash: string): Promise<EvidenceRecord[]>;
  insertEvidence(row: EvidenceRecord): Promise<void>;
  getEvent(id: string): Promise<CanonicalEvent | null>;
  getEventByCanonicalKey(key: string): Promise<CanonicalEvent | null>;
  listEventsForTicker(ticker: string): Promise<CanonicalEvent[]>;
  listReactionCandidates(limit: number): Promise<CanonicalEvent[]>;
  insertEvent(event: CanonicalEvent): Promise<void>;
  updateEvent(event: CanonicalEvent): Promise<void>;
  listTickers(eventId: string): Promise<TickerLink[]>;
  upsertTicker(row: TickerLink): Promise<void>;
  getReaction(eventId: string, windowKind: ReactionWindow): Promise<ReactionRecord | null>;
  upsertReaction(row: ReactionRecord): Promise<void>;
}

export function createMemoryStore(): CatalystIntelStore & {
  events(): CanonicalEvent[];
  rawItems(): RawItemRecord[];
  reactions(): ReactionRecord[];
} {
  const sources: SourceRecord[] = [];
  const runs: RunTelemetry[] = [];
  const raw: RawItemRecord[] = [];
  const events: CanonicalEvent[] = [];
  const evidence: EvidenceRecord[] = [];
  const tickers: TickerLink[] = [];
  const reactions: ReactionRecord[] = [];
  const configs = new Map<BotId, BotConfig>();

  return {
    events: () => events.map((row) => structuredClone(row)),
    rawItems: () => raw.map((row) => structuredClone(row)),
    reactions: () => reactions.map((row) => structuredClone(row)),
    async getBotConfig(bot) {
      return configs.get(bot) ?? null;
    },
    async listSources(query) {
      return sources.filter((source) => {
        if (query.sourceType && source.sourceType !== query.sourceType) return false;
        if (query.enabledOnly && !source.enabled) return false;
        if (query.sourceKeys && query.sourceKeys.length > 0) {
          return query.sourceKeys.includes(source.sourceKey) || query.sourceKeys.includes(source.id);
        }
        return true;
      }).map((row) => structuredClone(row));
    },
    async listDueSources(input) {
      const pool = sources.filter((source) => !input.sourceType || source.sourceType === input.sourceType);
      return selectDueSources(pool, input.now, input.limit, input.allowlist).map((row) => structuredClone(row));
    },
    async saveSource(source) {
      const index = sources.findIndex((row) => row.id === source.id);
      if (index >= 0) sources[index] = structuredClone(source);
      else sources.push(structuredClone(source));
    },
    async saveRun(run) {
      const index = runs.findIndex((row) => row.runId === run.runId);
      if (index >= 0) runs[index] = structuredClone(run);
      else runs.push(structuredClone(run));
    },
    async findRawByExternal(sourceId, externalId) {
      return raw.find((row) => row.sourceId === sourceId && row.externalId === externalId) ?? null;
    },
    async findRawByHash(sourceId, contentHash) {
      return raw.find((row) => row.sourceId === sourceId && row.contentHash === contentHash) ?? null;
    },
    async insertRaw(item) {
      const duplicate = raw.some((row) => row.sourceId === item.sourceId && (
        (item.externalId != null && row.externalId === item.externalId) || row.contentHash === item.contentHash
      ));
      if (duplicate) throw new UniqueConflictError();
      raw.push(structuredClone(item));
    },
    async findEvidenceByRaw(rawItemId) {
      return evidence.find((row) => row.rawItemId === rawItemId) ?? null;
    },
    async listEvidence(eventId) {
      return evidence.filter((row) => row.eventId === eventId).map((row) => structuredClone(row));
    },
    async evidenceForUrl(url) {
      return evidence.filter((row) => row.canonicalUrl === url).map((row) => structuredClone(row));
    },
    async evidenceForHash(contentHash) {
      return evidence.filter((row) => row.contentHash === contentHash).map((row) => structuredClone(row));
    },
    async insertEvidence(row) {
      const duplicate = evidence.some((item) => item.eventId === row.eventId && item.rawItemId === row.rawItemId);
      if (duplicate) throw new UniqueConflictError();
      evidence.push(structuredClone(row));
    },
    async getEvent(id) {
      const found = events.find((row) => row.id === id);
      return found ? structuredClone(found) : null;
    },
    async getEventByCanonicalKey(key) {
      const found = events.find((row) => row.canonicalKey === key);
      return found ? structuredClone(found) : null;
    },
    async listEventsForTicker(ticker) {
      const ids = new Set(tickers.filter((row) => row.ticker === ticker).map((row) => row.eventId));
      return events.filter((row) => ids.has(row.id)).map((row) => structuredClone(row));
    },
    async listReactionCandidates(limit) {
      const active = new Set(["scheduled", "approaching", "live", "announced", "reacting", "follow_through"]);
      return events
        .filter((row) => active.has(row.lifecycle))
        .sort((a, b) => b.priorityScore - a.priorityScore)
        .slice(0, limit)
        .map((row) => structuredClone(row));
    },
    async insertEvent(event) {
      if (events.some((row) => row.id === event.id || row.canonicalKey === event.canonicalKey)) {
        throw new UniqueConflictError();
      }
      events.push(structuredClone(event));
    },
    async updateEvent(event) {
      const index = events.findIndex((row) => row.id === event.id);
      if (index >= 0) events[index] = structuredClone(event);
    },
    async listTickers(eventId) {
      return tickers.filter((row) => row.eventId === eventId).map((row) => structuredClone(row));
    },
    async upsertTicker(row) {
      const index = tickers.findIndex((item) =>
        item.eventId === row.eventId && item.ticker === row.ticker && item.relation === row.relation
      );
      if (index >= 0) tickers[index] = structuredClone(row);
      else tickers.push(structuredClone(row));
    },
    async getReaction(eventId, windowKind) {
      const found = reactions.find((row) => row.eventId === eventId && row.windowKind === windowKind);
      return found ? structuredClone(found) : null;
    },
    async upsertReaction(row) {
      const index = reactions.findIndex((item) => item.eventId === row.eventId && item.windowKind === row.windowKind);
      if (index >= 0) reactions[index] = structuredClone(row);
      else reactions.push(structuredClone(row));
    },
  };
}

export function emptyBotConfig(bot: BotId): BotConfig {
  return { bot, enabled: false, batchLimit: 25, concurrency: 3, pollIntervalSeconds: 600 };
}
