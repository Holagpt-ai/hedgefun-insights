import { DatabaseReadError, mapDatabaseError } from "./conflicts.ts";
import { runErrorsForPersistence } from "./telemetry.ts";
import { observationFromRadarRow, pickLatestRadarRows } from "./market-reaction.ts";
import type { CatalystIntelStore } from "./persistence.ts";
import type {
  BotConfig,
  BotId,
  CanonicalEvent,
  EvidenceRecord,
  EvidenceTier,
  IntelEventType,
  LifecycleState,
  MarketObservation,
  RawItemRecord,
  ReactionRecord,
  ReactionWindow,
  RunTelemetry,
  SourceRecord,
  TickerLink,
  TickerRelation,
  TimingBucket,
  VerificationState,
} from "./types.ts";

type Sb = {
  from(table: string): any;
  rpc(fn: string, args?: Record<string, unknown>): any;
};

export function createSupabaseIntelStore(supabase: Sb): CatalystIntelStore & {
  loadMarketObservations(symbols: string[]): Promise<MarketObservation[]>;
} {
  return {
    async getBotConfig(bot) {
      const { data, error } = await supabase.from("catalyst_intel_bot_config").select("*").eq("bot", bot).maybeSingle();
      if (error) throw new DatabaseReadError();
      if (!data) return null;
      return mapBot(data as Record<string, unknown>);
    },
    async listSources(query) {
      let request = supabase.from("catalyst_intel_sources").select("*").order("source_key", { ascending: true });
      if (query.sourceType) request = request.eq("source_type", query.sourceType);
      if (query.enabledOnly) request = request.eq("enabled", true);
      const { data, error } = await request;
      if (error) throw new DatabaseReadError();
      if (!data) return [];
      let rows = (data as Record<string, unknown>[]).map(mapSource);
      if (query.sourceKeys && query.sourceKeys.length > 0) {
        const allow = new Set(query.sourceKeys);
        rows = rows.filter((row) => allow.has(row.sourceKey) || allow.has(row.id));
      }
      return rows;
    },
    async listDueSources(input) {
      const allow = input.allowlist && input.allowlist.length > 0 ? [...input.allowlist] : null;
      const { data, error } = await supabase.rpc("catalyst_intel_due_sources", {
        p_source_type: input.sourceType ?? null,
        p_now: input.now.toISOString(),
        p_limit: input.limit,
        p_allow: allow,
      });
      if (error) throw new DatabaseReadError();
      return ((data ?? []) as Record<string, unknown>[]).map(mapSource);
    },
    async saveSource(source) {
      const { error } = await supabase.from("catalyst_intel_sources").upsert(unmapSource(source));
      if (error) throw new Error("database");
    },
    async saveRun(run) {
      const { error } = await supabase.from("catalyst_intel_runs").upsert(unmapRun(run));
      if (error) throw new Error("database");
    },
    async findRawByExternal(sourceId, externalId) {
      const { data, error } = await supabase.from("catalyst_intel_raw_items").select("*").eq("source_id", sourceId).eq("external_id", externalId).maybeSingle();
      if (error) throw new DatabaseReadError();
      return data ? mapRaw(data as Record<string, unknown>) : null;
    },
    async findRawByHash(sourceId, contentHash) {
      const { data, error } = await supabase.from("catalyst_intel_raw_items").select("*").eq("source_id", sourceId).eq("content_hash", contentHash).maybeSingle();
      if (error) throw new DatabaseReadError();
      return data ? mapRaw(data as Record<string, unknown>) : null;
    },
    async insertRaw(item) {
      const { error } = await supabase.from("catalyst_intel_raw_items").insert(unmapRaw(item));
      const mapped = mapDatabaseError(error);
      if (mapped) throw mapped;
    },
    async mergeRawMetadata(rawItemId, patch) {
      const { data, error: readError } = await supabase.from("catalyst_intel_raw_items").select("metadata").eq("id", rawItemId).maybeSingle();
      if (readError) throw new DatabaseReadError();
      if (!data) return;
      const merged = { ...obj((data as Record<string, unknown>).metadata), ...patch };
      const { error } = await supabase.from("catalyst_intel_raw_items").update({ metadata: merged }).eq("id", rawItemId);
      if (error) throw new Error("database");
    },
    async findEvidenceByRaw(rawItemId) {
      const { data, error } = await supabase.from("catalyst_intel_evidence").select("*").eq("raw_item_id", rawItemId).maybeSingle();
      if (error) throw new DatabaseReadError();
      return data ? mapEvidence(data as Record<string, unknown>) : null;
    },
    async listEvidence(eventId) {
      const { data, error } = await supabase.from("catalyst_intel_evidence").select("*").eq("event_id", eventId);
      if (error) throw new DatabaseReadError();
      return ((data ?? []) as Record<string, unknown>[]).map(mapEvidence);
    },
    async evidenceForUrl(url) {
      const { data, error } = await supabase.from("catalyst_intel_evidence").select("*").eq("canonical_url", url).limit(20);
      if (error) throw new DatabaseReadError();
      return ((data ?? []) as Record<string, unknown>[]).map(mapEvidence);
    },
    async evidenceForHash(contentHash) {
      const { data, error } = await supabase.from("catalyst_intel_evidence").select("*").eq("content_hash", contentHash).limit(20);
      if (error) throw new DatabaseReadError();
      return ((data ?? []) as Record<string, unknown>[]).map(mapEvidence);
    },
    async insertEvidence(row) {
      const { error } = await supabase.from("catalyst_intel_evidence").insert(unmapEvidence(row));
      const mapped = mapDatabaseError(error);
      if (mapped) throw mapped;
    },
    async getEvent(id) {
      const { data, error } = await supabase.from("catalyst_intel_events").select("*").eq("id", id).maybeSingle();
      if (error) throw new DatabaseReadError();
      return data ? mapEvent(data as Record<string, unknown>) : null;
    },
    async getEventByCanonicalKey(key) {
      const { data, error } = await supabase.from("catalyst_intel_events").select("*").eq("canonical_key", key).maybeSingle();
      if (error) throw new DatabaseReadError();
      return data ? mapEvent(data as Record<string, unknown>) : null;
    },
    async listEventsForTicker(ticker) {
      const { data, error } = await supabase.from("catalyst_intel_event_tickers").select("event_id").eq("ticker", ticker).limit(100);
      if (error) throw new DatabaseReadError();
      const ids = ((data ?? []) as { event_id: string }[]).map((row) => row.event_id);
      if (ids.length === 0) return [];
      const events = await supabase.from("catalyst_intel_events").select("*").in("id", ids);
      if (events.error) throw new DatabaseReadError();
      return ((events.data ?? []) as Record<string, unknown>[]).map(mapEvent);
    },
    async listReactionCandidates(limit) {
      const { data, error } = await supabase
        .from("catalyst_intel_events")
        .select("*")
        .in("lifecycle", ["scheduled", "approaching", "live", "announced", "reacting", "follow_through"])
        .order("priority_score", { ascending: false })
        .limit(limit);
      if (error) throw new DatabaseReadError();
      return ((data ?? []) as Record<string, unknown>[]).map(mapEvent);
    },
    async insertEvent(event) {
      const { error } = await supabase.from("catalyst_intel_events").insert(unmapEvent(event));
      const mapped = mapDatabaseError(error);
      if (mapped) throw mapped;
    },
    async updateEvent(event) {
      const { error } = await supabase.from("catalyst_intel_events").update(unmapEvent(event)).eq("id", event.id);
      if (error) throw new Error("database");
    },
    async updateEventIfUnchanged(event, expectedUpdatedAt) {
      let request = supabase.from("catalyst_intel_events").update(unmapEvent(event)).eq("id", event.id);
      if (expectedUpdatedAt) request = request.eq("updated_at", expectedUpdatedAt);
      else request = request.is("updated_at", null);
      const { data, error } = await request.select("id").maybeSingle();
      if (error) throw new Error("database");
      return Boolean(data);
    },
    async listRawItemsForSource(sourceId) {
      const { data, error } = await supabase.from("catalyst_intel_raw_items").select("*").eq("source_id", sourceId);
      if (error) throw new DatabaseReadError();
      return ((data ?? []) as Record<string, unknown>[]).map(mapRaw);
    },
    async listTickers(eventId) {
      const { data, error } = await supabase.from("catalyst_intel_event_tickers").select("*").eq("event_id", eventId);
      if (error) throw new DatabaseReadError();
      return ((data ?? []) as Record<string, unknown>[]).map(mapTicker);
    },
    async upsertTicker(row) {
      const { error } = await supabase.from("catalyst_intel_event_tickers").upsert(unmapTicker(row), {
        onConflict: "event_id,ticker,relation",
      });
      if (error) throw new Error("database");
    },
    async getReaction(eventId, windowKind) {
      const { data, error } = await supabase.from("catalyst_intel_reactions").select("*").eq("event_id", eventId).eq("window_kind", windowKind).maybeSingle();
      if (error) throw new DatabaseReadError();
      return data ? mapReaction(data as Record<string, unknown>) : null;
    },
    async withDedupeLock(lockKey, task) {
      const owner = crypto.randomUUID();
      const acquired = await supabase.rpc("catalyst_intel_acquire_dedupe_lock", {
        p_lock_key: lockKey,
        p_owner: owner,
      });
      if (acquired?.error) throw new DatabaseReadError();
      try {
        return await task();
      } finally {
        await supabase.rpc("catalyst_intel_release_dedupe_lock", {
          p_lock_key: lockKey,
          p_owner: owner,
        });
      }
    },
    async upsertReaction(row) {
      const { error } = await supabase.from("catalyst_intel_reactions").upsert(unmapReaction(row), {
        onConflict: "event_id,window_kind",
      });
      if (error) throw new Error("database");
    },
    async loadMarketObservations(symbols: string[]) {
      if (symbols.length === 0) return [];
      const { data, error } = await supabase.rpc("catalyst_intel_latest_radar", { p_symbols: symbols });
      if (error) throw new Error("database");
      return pickLatestRadarRows((data ?? []) as Record<string, unknown>[]).map(observationFromRadarRow);
    },
  };
}

function mapBot(row: Record<string, unknown>): BotConfig {
  return {
    bot: String(row.bot) as BotId,
    enabled: row.enabled === true,
    batchLimit: Number(row.batch_limit ?? 25),
    concurrency: Number(row.concurrency ?? 3),
    pollIntervalSeconds: Number(row.poll_interval_seconds ?? 600),
  };
}

function mapSource(row: Record<string, unknown>): SourceRecord {
  return {
    id: String(row.id),
    sourceKey: String(row.source_key),
    companyName: str(row.company_name),
    ticker: str(row.ticker),
    cik: str(row.cik),
    sourceType: row.source_type as SourceRecord["sourceType"],
    url: String(row.url),
    hostname: String(row.hostname),
    feedFormat: row.feed_format as SourceRecord["feedFormat"],
    pollIntervalSeconds: Number(row.poll_interval_seconds ?? 0),
    enabled: row.enabled === true,
    priority: Number(row.priority ?? 0),
    evidenceTier: row.evidence_tier as EvidenceTier,
    authorityKey: typeof row.authority_key === "string" ? row.authority_key : "unknown",
    lastSuccessAt: str(row.last_success_at),
    lastContentHash: str(row.last_content_hash),
    lastEtag: str(row.last_etag),
    lastModified: str(row.last_modified),
    failureCount: Number(row.failure_count ?? 0),
    backoffUntil: str(row.backoff_until),
    lastErrorCategory: str(row.last_error_category),
    metadata: obj(row.metadata),
  };
}

function unmapSource(source: SourceRecord): Record<string, unknown> {
  return {
    id: source.id,
    source_key: source.sourceKey,
    company_name: source.companyName,
    ticker: source.ticker,
    cik: source.cik,
    source_type: source.sourceType,
    url: source.url,
    hostname: source.hostname,
    feed_format: source.feedFormat,
    poll_interval_seconds: source.pollIntervalSeconds,
    enabled: source.enabled,
    priority: source.priority,
    evidence_tier: source.evidenceTier,
    authority_key: source.authorityKey,
    last_success_at: source.lastSuccessAt,
    last_content_hash: source.lastContentHash,
    last_etag: source.lastEtag,
    last_modified: source.lastModified,
    failure_count: source.failureCount,
    backoff_until: source.backoffUntil,
    last_error_category: source.lastErrorCategory,
    metadata: source.metadata,
  };
}

function mapRaw(row: Record<string, unknown>): RawItemRecord {
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    externalId: str(row.external_id),
    canonicalUrl: str(row.canonical_url),
    contentHash: String(row.content_hash),
    publishedAt: str(row.published_at),
    discoveredAt: String(row.discovered_at),
    title: str(row.title),
    bodyExcerpt: str(row.body_excerpt),
    metadata: obj(row.metadata),
  };
}

function unmapRaw(item: RawItemRecord): Record<string, unknown> {
  return {
    id: item.id,
    source_id: item.sourceId,
    external_id: item.externalId,
    canonical_url: item.canonicalUrl,
    content_hash: item.contentHash,
    published_at: item.publishedAt,
    discovered_at: item.discoveredAt,
    title: item.title,
    body_excerpt: item.bodyExcerpt,
    metadata: item.metadata,
  };
}

function mapEvent(row: Record<string, unknown>): CanonicalEvent {
  return {
    id: String(row.id),
    canonicalKey: String(row.canonical_key),
    title: String(row.title),
    summary: str(row.summary),
    announcementSummary: str(row.announcement_summary),
    eventType: row.event_type as IntelEventType,
    eventSubtype: str(row.event_subtype),
    lifecycle: row.lifecycle as LifecycleState,
    catalystState: row.catalyst_state as CanonicalEvent["catalystState"],
    firstDiscoveredAt: String(row.first_discovered_at),
    sourcePublishedAt: str(row.source_published_at),
    scheduledStartAt: str(row.scheduled_start_at),
    scheduledEndAt: str(row.scheduled_end_at),
    scheduledDate: str(row.scheduled_date),
    announcementAt: str(row.announcement_at),
    effectiveAt: str(row.effective_at),
    timingBucket: row.timing_bucket as TimingBucket,
    verificationState: row.verification_state as VerificationState,
    evidenceConfidence: Number(row.evidence_confidence),
    materiality: Number(row.materiality),
    timingUrgency: Number(row.timing_urgency),
    reactionScore: row.reaction_score == null ? null : Number(row.reaction_score),
    priorityScore: Number(row.priority_score),
    attributionConfidence: Number(row.attribution_confidence),
    distributionStatus: row.distribution_status === "ready" ? "ready" : "observation",
    lifecycleLog: Array.isArray(row.lifecycle_log) ? row.lifecycle_log as CanonicalEvent["lifecycleLog"] : [],
    scoreComponents: obj(row.score_components),
    updatedAt: str(row.updated_at),
  };
}

function unmapEvent(event: CanonicalEvent): Record<string, unknown> {
  return {
    id: event.id,
    canonical_key: event.canonicalKey,
    title: event.title,
    summary: event.summary,
    announcement_summary: event.announcementSummary,
    event_type: event.eventType,
    event_subtype: event.eventSubtype,
    lifecycle: event.lifecycle,
    catalyst_state: event.catalystState,
    first_discovered_at: event.firstDiscoveredAt,
    source_published_at: event.sourcePublishedAt,
    scheduled_start_at: event.scheduledStartAt,
    scheduled_end_at: event.scheduledEndAt,
    scheduled_date: event.scheduledDate,
    announcement_at: event.announcementAt,
    effective_at: event.effectiveAt,
    timing_bucket: event.timingBucket,
    verification_state: event.verificationState,
    evidence_confidence: event.evidenceConfidence,
    materiality: event.materiality,
    timing_urgency: event.timingUrgency,
    reaction_score: event.reactionScore,
    priority_score: event.priorityScore,
    attribution_confidence: event.attributionConfidence,
    distribution_status: event.distributionStatus,
    lifecycle_log: event.lifecycleLog,
    score_components: event.scoreComponents,
  };
}

function mapEvidence(row: Record<string, unknown>): EvidenceRecord {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    rawItemId: String(row.raw_item_id),
    sourceId: String(row.source_id),
    authorityKey: typeof row.authority_key === "string" ? row.authority_key : "unknown",
    evidenceTier: row.evidence_tier as EvidenceTier,
    evidenceRole: row.evidence_role === "primary" ? "primary" : "secondary",
    canonicalUrl: str(row.canonical_url),
    contentHash: String(row.content_hash),
    publishedAt: str(row.published_at),
    conflict: false,
  };
}

function unmapEvidence(row: EvidenceRecord): Record<string, unknown> {
  return {
    id: row.id,
    event_id: row.eventId,
    raw_item_id: row.rawItemId,
    source_id: row.sourceId,
    authority_key: row.authorityKey,
    evidence_tier: row.evidenceTier,
    evidence_role: row.evidenceRole,
    canonical_url: row.canonicalUrl,
    content_hash: row.contentHash,
    published_at: row.publishedAt,
  };
}

function mapTicker(row: Record<string, unknown>): TickerLink {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    ticker: String(row.ticker),
    relation: row.relation as TickerRelation,
    confidence: Number(row.confidence),
    isPrimary: row.is_primary === true,
    evidenceNote: str(row.evidence_note),
  };
}

function unmapTicker(row: TickerLink): Record<string, unknown> {
  return {
    id: row.id,
    event_id: row.eventId,
    ticker: row.ticker,
    relation: row.relation,
    confidence: row.confidence,
    is_primary: row.isPrimary,
    evidence_note: row.evidenceNote,
  };
}

function mapReaction(row: Record<string, unknown>): ReactionRecord {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    windowKind: row.window_kind as ReactionWindow,
    observedAt: str(row.observed_at),
    availability: row.availability as ReactionRecord["availability"],
    referencePrice: num(row.reference_price),
    currentPrice: num(row.current_price),
    percentMove: num(row.percent_move),
    intradayHigh: num(row.intraday_high),
    intradayLow: num(row.intraday_low),
    volume: num(row.volume),
    dollarVolume: num(row.dollar_volume),
    rvol5m: num(row.rvol_5m),
    timeAdjustedRvol: num(row.time_adjusted_rvol),
    volumeVelocity: num(row.volume_velocity),
    volumeAcceleration: num(row.volume_acceleration),
    vwap: num(row.vwap),
    vwapSide: str(row.vwap_side),
    hodDistancePct: num(row.hod_distance_pct),
    lodDistancePct: num(row.lod_distance_pct),
    floatTurnover: num(row.float_turnover),
    payload: obj(row.payload),
  };
}

function unmapReaction(row: ReactionRecord): Record<string, unknown> {
  return {
    id: row.id,
    event_id: row.eventId,
    window_kind: row.windowKind,
    observed_at: row.observedAt,
    availability: row.availability,
    reference_price: row.referencePrice,
    current_price: row.currentPrice,
    percent_move: row.percentMove,
    intraday_high: row.intradayHigh,
    intraday_low: row.intradayLow,
    volume: row.volume,
    dollar_volume: row.dollarVolume,
    rvol_5m: row.rvol5m,
    time_adjusted_rvol: row.timeAdjustedRvol,
    volume_velocity: row.volumeVelocity,
    volume_acceleration: row.volumeAcceleration,
    vwap: row.vwap,
    vwap_side: row.vwapSide,
    hod_distance_pct: row.hodDistancePct,
    lod_distance_pct: row.lodDistancePct,
    float_turnover: row.floatTurnover,
    payload: row.payload,
  };
}

function unmapRun(run: RunTelemetry): Record<string, unknown> {
  return {
    id: run.runId,
    bot: run.bot,
    started_at: run.startedAt,
    completed_at: run.completedAt,
    sources_attempted: run.sourcesAttempted,
    sources_successful: run.sourcesSuccessful,
    sources_failed: run.sourcesFailed,
    raw_items_seen: run.rawItemsSeen,
    new_items: run.newItems,
    duplicates: run.duplicates,
    events_created: run.eventsCreated,
    events_updated: run.eventsUpdated,
    events_invalidated: run.eventsInvalidated,
    elapsed_ms: run.elapsedMs,
    status: run.status,
    errors: runErrorsForPersistence(run),
  };
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
