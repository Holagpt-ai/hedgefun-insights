import type { CatalystSourceAdapter } from "./source-adapter.ts";
import { buildAttributionIndex } from "./attribution-index.ts";
import {
  backoffSeconds,
  LIVE_REACTION_MAX_AGE_MS,
  MAX_ITEMS_PER_SOURCE,
  NEWS_ITEMS_PER_INVOCATION,
  NEWS_WALL_TIME_MS,
} from "./config.ts";
import {
  continuationForFeed,
  readNewsContinuation,
  writeNewsContinuation,
} from "./news-continuation.ts";
import {
  isLiveReactionEligible,
  loadHistoricalBackfillCandidates,
  type HistoricalBackfillScope,
  type ReactionRunMode,
} from "./reaction-eligibility.ts";
import { advanceForReaction, appendLifecycle, applyScheduleClock } from "./lifecycle.ts";
import { eventReferenceInstant, type EventPriceBar } from "./event-bars.ts";
import {
  legacyProvenanceIfNeeded,
  readStoredProvenance,
  resolvePolygonReference,
  type ReferencePriceProvenance,
} from "./reference-provenance.ts";
import {
  attachRunObservability,
  emptyIngestObservability,
  emptyReactionObservability,
  ingestRejectionReason,
  recordRejection,
  recordUnresolvedAttribution,
  type IngestObservability,
  type ReactionObservability,
} from "./run-observability.ts";
import {
  assessReactionMarketContext,
  preserveObservedMetrics,
  reactionFromAssessment,
} from "./market-reaction.ts";
import { DatabaseReadError } from "./conflicts.ts";
import { itemIngestDiagnostic, safeItemIdentity } from "./item-ingest-error.ts";
import { isFixturePayload, normalizeTicker } from "./normalize.ts";
import { applyScores, ingestCandidate } from "./pipeline.ts";
import type { CatalystIntelStore } from "./persistence.ts";
import {
  resolveSecCompanyTickerMap,
  SEC_COMPANY_MAP_URL_ID,
  type SecCompanyMapDiagnostic,
  type SecCompanyMapResolution,
} from "./sec-company-map.ts";
import { SourceFetchError } from "./source-fetch.ts";
import { emptyRun, formatRunLog, safeError } from "./telemetry.ts";
import type {
  BotId,
  CompanyRecord,
  MarketObservation,
  ReactionRecord,
  ReactionWindow,
  RunTelemetry,
  SourceRecord,
} from "./types.ts";

export interface CollectorRunInput {
  bot: BotId;
  adapter: CatalystSourceAdapter;
  store: CatalystIntelStore;
  now: Date;
  userAgent: string;
  fetchImpl?: typeof fetch;
  batchLimit: number;
  concurrency?: number;
  allowlist?: string[];
  allowFixtures?: boolean;
  companies?: readonly CompanyRecord[];
  loadCompanies?: () => Promise<readonly CompanyRecord[]>;
  cikMap?: ReadonlyMap<string, string[]>;
  itemLimit?: number;
  newsItemBudget?: number;
  newsWallTimeMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
}

export async function runCollectorBot(input: CollectorRunInput): Promise<RunTelemetry> {
  const wallStart = Date.now();
  const run = emptyRun(input.bot, crypto.randomUUID(), new Date(wallStart).toISOString());
  const ingestionObs = emptyIngestObservability();
  try {
    await input.store.saveRun(run);
  } catch (err) {
    if (err instanceof DatabaseReadError) return failDatabaseRun(input.store, run, wallStart);
    throw err;
  }
  let sources;
  try {
    sources = await input.store.listDueSources({
      sourceType: input.adapter.sourceType,
      now: input.now,
      limit: input.batchLimit,
      allowlist: input.allowlist,
    });
  } catch (err) {
    if (err instanceof DatabaseReadError) return failDatabaseRun(input.store, run, wallStart);
    throw err;
  }
  let companies = input.companies;
  if (!companies && input.loadCompanies) {
    const mappedBot = input.bot === "ir" || input.bot === "events";
    const needsUniverse = (input.bot === "news" && sources.length > 0) ||
      (mappedBot && sources.some((source) => !normalizeTicker(source.ticker)));
    if (needsUniverse) {
      try {
        companies = await input.loadCompanies();
      } catch (err) {
        if (err instanceof DatabaseReadError || err instanceof Error) return failDatabaseRun(input.store, run, wallStart);
      }
    }
  }
  let cikMap = input.cikMap;
  if (input.bot === "sec" && sources.length === 0) {
    ingestionObs.sec_company_map_attempts = 0;
    ingestionObs.atom_source_attempted = false;
  }
  if (input.bot === "sec" && sources.length > 0 && !cikMap) {
    let resolved: SecCompanyMapResolution;
    try {
      resolved = await resolveSecCompanyTickerMap({
        now: input.now,
        userAgent: input.userAgent,
        cache: input.store,
        fetchImpl: input.fetchImpl,
        sleepFn: input.sleepFn,
      });
    } catch (err) {
      if (err instanceof DatabaseReadError || err instanceof Error) return failDatabaseRun(input.store, run, wallStart);
      throw err;
    }
    applySecMapObservability(ingestionObs, resolved);
    ingestionObs.sec_due_sources = sources.length;
    if (!resolved.ok || !resolved.map) {
      ingestionObs.atom_source_attempted = false;
      return failSecProviderRun(
        input.store,
        run,
        wallStart,
        resolved.diagnostic ?? {
          category: "sec_provider_dependency_error",
          stage: "company_ticker_map",
          provider: "sec",
          urlIdentifier: SEC_COMPANY_MAP_URL_ID,
          httpStatus: resolved.httpStatus,
          errorType: resolved.errorType ?? "parse",
          retryable: false,
          message: "SEC company ticker map unavailable",
          attempt: resolved.attempts,
          attempts: resolved.attempts,
        },
        sources.length,
        ingestionObs,
      );
    }
    if (resolved.source === "live_refresh" && resolved.attempts > 1) ingestionObs.sec_company_map_retry_succeeded = true;
    if (resolved.source === "lkg_fallback" && resolved.diagnostic) {
      run.errors.push({
        sourceId: "sec-company-map",
        category: resolved.diagnostic.category,
        statusCode: resolved.diagnostic.httpStatus,
        retryable: resolved.diagnostic.retryable,
        elapsedMs: 0,
        details: {
          stage: resolved.diagnostic.stage,
          provider: resolved.diagnostic.provider,
          url_identifier: resolved.diagnostic.urlIdentifier,
          error_type: resolved.diagnostic.errorType,
          message: "company map refresh failed; last-known-good cache used",
          attempt: resolved.diagnostic.attempt,
          attempts: resolved.diagnostic.attempts,
          due_sources: sources.length,
          atom_attempted: true,
          cache_state: resolved.state,
          cache_age_seconds: resolved.ageSeconds,
          map_source: resolved.source,
          provider_condition: resolved.providerCondition,
          refresh_attempted: true,
          refreshed_at: resolved.refreshedAt,
        },
      });
    }
    cikMap = resolved.map;
  }
  const attributionIndex = companies && companies.length > 0 ? buildAttributionIndex(companies) : undefined;
  const newsItemBudget = input.newsItemBudget ?? NEWS_ITEMS_PER_INVOCATION;
  const newsWallTimeMs = input.newsWallTimeMs ?? NEWS_WALL_TIME_MS;
  let ingestQueue = Promise.resolve();
  const ingestNext = <T>(fn: () => Promise<T>): Promise<T> => {
    const result = ingestQueue.then(fn, fn);
    ingestQueue = result.then(() => undefined, () => undefined);
    return result;
  };
  await mapPool(sources, input.concurrency ?? 3, async (source) => {
    const startedSource = Date.now();
    if (input.bot === "sec") ingestionObs.atom_source_attempted = true;
    run.sourcesAttempted += 1;
    const ctx = {
      now: input.now,
      source,
      userAgent: input.userAgent,
      fetchImpl: input.fetchImpl ?? fetch,
      companies,
      cikMap,
      itemLimit: input.itemLimit ?? MAX_ITEMS_PER_SOURCE,
      allowFixtures: input.allowFixtures === true,
      fetchState: {
        unchanged: false,
        etag: null,
        lastModified: null,
        contentHash: null,
        checkpoint: null,
        forceFullFetch: input.bot === "news" && readNewsContinuation(source.metadata) != null,
      },
    };
    try {
      if (isFixturePayload(source.metadata) && !input.allowFixtures) {
        run.sourcesSuccessful += 1;
        return;
      }
      const items = await input.adapter.discover(ctx);
      const pendingNewsContinuation = input.bot === "news" && readNewsContinuation(source.metadata) != null;
      if (ctx.fetchState.unchanged && !pendingNewsContinuation) {
        markSuccess(source, input.now, ctx.fetchState, true);
        await input.store.saveSource(source);
        run.sourcesSuccessful += 1;
        return;
      }
      if (ctx.fetchState.unchanged && pendingNewsContinuation) {
        ctx.fetchState.unchanged = false;
        ctx.fetchState.forceFullFetch = true;
      }
      const feedHash = ctx.fetchState.contentHash;
      const feedPlan = input.bot === "news" && feedHash
        ? continuationForFeed(source.metadata, feedHash, items.length)
        : { startIndex: 0, state: null };
      const feedItems = items.slice(feedPlan.startIndex);
      let absoluteIndex = feedPlan.startIndex;
      let continuationComplete = feedPlan.startIndex >= items.length;
      for (const item of feedItems) {
        if (input.bot === "news") {
          const consumedThisRun = absoluteIndex - feedPlan.startIndex;
          if (consumedThisRun >= newsItemBudget) {
            ingestionObs.resource_stop_reason = "news_item_budget";
            break;
          }
          if (Date.now() - wallStart >= newsWallTimeMs) {
            ingestionObs.resource_stop_reason = "news_wall_time";
            break;
          }
        }
        run.rawItemsSeen += 1;
        ingestionObs.items_encountered += 1;
        if ((item.metadata["x-stocksist-fixture"] === true || item.metadata.fixture === true) && !ctx.allowFixtures) {
          recordRejection(ingestionObs, "fixture_disallowed");
          absoluteIndex += 1;
          continue;
        }
        const candidate = await input.adapter.normalize(item, ctx);
        if (!candidate) {
          recordRejection(ingestionObs, ingestRejectionReason(item, true));
          absoluteIndex += 1;
          continue;
        }
        ingestionObs.items_qualifying += 1;
        let outcome;
        try {
          outcome = await ingestNext(() => ingestCandidate(input.store, candidate, {
            now: input.now,
            allowFixtures: ctx.allowFixtures,
            source,
            companies,
            cikMap,
            attributionIndex,
          }));
        } catch (err) {
          if (err instanceof DatabaseReadError) throw err;
          const details = itemIngestDiagnostic(err, {
            sourceKey: source.sourceKey,
            itemIndex: absoluteIndex,
            itemIdentity: safeItemIdentity(item),
          });
          source.failureCount += 1;
          source.backoffUntil = new Date(input.now.getTime() + backoffSeconds(source.failureCount) * 1000).toISOString();
          source.lastErrorCategory = "item_ingest_error";
          if (input.bot === "news" && feedHash) {
            source.metadata = writeNewsContinuation(source.metadata, {
              feed_content_hash: feedHash,
              next_item_index: absoluteIndex,
              feed_item_count: items.length,
            });
            ingestionObs.continuation_remaining_items = Math.max(0, items.length - absoluteIndex);
          }
          await input.store.saveSource(source);
          run.sourcesFailed += 1;
          run.errors.push({
            ...safeError(source.id, "item_ingest_error", null, true, Date.now() - startedSource),
            details,
          });
          await checkpointRun(input.store, run, ingestionObs, input.bot, wallStart);
          return;
        }
        if (outcome.status === "created") {
          run.eventsCreated += 1;
          ingestionObs.canonical_events_created += 1;
          ingestionObs.attribution_resolved += 1;
        } else if (outcome.status === "updated") {
          run.eventsUpdated += 1;
          ingestionObs.canonical_events_enriched += 1;
          ingestionObs.attribution_resolved += 1;
        } else if (outcome.status === "unresolved") {
          recordUnresolvedAttribution(ingestionObs, outcome.unresolvedReason ?? "NO_ATTRIBUTION");
        }
        if (outcome.rawDisposition === "inserted") run.newItems += 1;
        else if (outcome.rawDisposition === "existing_resumed" || outcome.rawDisposition === "existing_linked") {
          run.duplicates += 1;
        }
        absoluteIndex += 1;
        if (input.bot === "news" && feedHash) {
          const paused = absoluteIndex < items.length;
          source.metadata = writeNewsContinuation(source.metadata, paused ? {
            feed_content_hash: feedHash,
            next_item_index: absoluteIndex,
            feed_item_count: items.length,
          } : null);
          ingestionObs.continuation_remaining_items = paused ? items.length - absoluteIndex : 0;
          continuationComplete = !paused;
          await input.store.saveSource(source);
          await checkpointRun(input.store, run, ingestionObs, input.bot, wallStart);
        }
      }
      if (input.bot === "news" && feedHash) {
        const paused = absoluteIndex < items.length;
        if (paused) {
          source.metadata = writeNewsContinuation(source.metadata, {
            feed_content_hash: feedHash,
            next_item_index: absoluteIndex,
            feed_item_count: items.length,
          });
          ingestionObs.continuation_remaining_items = items.length - absoluteIndex;
          continuationComplete = false;
        } else {
          source.metadata = writeNewsContinuation(source.metadata, null);
          ingestionObs.continuation_remaining_items = 0;
          continuationComplete = true;
        }
      }
      markSuccess(source, input.now, ctx.fetchState, continuationComplete);
      await input.store.saveSource(source);
      await checkpointRun(input.store, run, ingestionObs, input.bot, wallStart);
      run.sourcesSuccessful += 1;
    } catch (err) {
      if (err instanceof DatabaseReadError) {
        run.sourcesFailed += 1;
        run.errors.push(safeError(source.id, "database", null, true, Date.now() - startedSource));
        return;
      }
      const known = err instanceof SourceFetchError ? err : null;
      source.failureCount += 1;
      source.backoffUntil = new Date(input.now.getTime() + backoffSeconds(source.failureCount) * 1000).toISOString();
      source.lastErrorCategory = known?.category ?? "source_error";
      await input.store.saveSource(source);
      run.sourcesFailed += 1;
      run.errors.push(safeError(
        source.id,
        known?.category ?? "source_error",
        known?.statusCode ?? null,
        known?.retryable ?? false,
        Date.now() - startedSource,
      ));
    }
  });
  // sourcesSuccessful: fetch and the item loop both finished. Duplicates and
  // unresolved items are handled progress. sourcesFailed: fetch failed, or an
  // item abort stopped the source. completed means orchestration finished.
  // A nested source failure stays on run.errors unless the category is database.
  // markSuccess on a later clean run clears failureCount, backoff, and lastErrorCategory.
  run.completedAt = new Date().toISOString();
  run.elapsedMs = Date.now() - wallStart;
  run.status = run.errors.some((error) => error.category === "database") ? "failed" : "completed";
  attachRunObservability(run, { bot: input.bot, ingestion: ingestionObs });
  await input.store.saveRun(run);
  console.log(formatRunLog(run));
  return run;
}

export interface ReactionRunInput {
  store: CatalystIntelStore;
  now: Date;
  batchLimit: number;
  loadObservation: (symbol: string) => Promise<MarketObservation | null>;
  loadReferenceBars?: (symbol: string, eventAtIso: string) => Promise<EventPriceBar[]>;
  windowKind?: ReactionWindow;
  maxAgeMs?: number;
  /** Default `live` for scheduled polling; historical enrichment requires explicit opt-in. */
  mode?: ReactionRunMode;
  historicalBackfill?: HistoricalBackfillScope;
  liveMaxAgeMs?: number;
}

export async function runReactionBot(input: ReactionRunInput): Promise<RunTelemetry> {
  const wallStart = Date.now();
  const run = emptyRun("reactions", crypto.randomUUID(), new Date(wallStart).toISOString());
  const mode = input.mode ?? "live";
  const reactionObs = emptyReactionObservability(mode);
  let events;
  try {
    if (mode === "historical_backfill") {
      if (!input.historicalBackfill) throw new Error("backfill_scope");
      events = await loadHistoricalBackfillCandidates(input.store, input.historicalBackfill, input.batchLimit);
    } else {
      events = await input.store.listReactionCandidates(input.batchLimit);
    }
  } catch (err) {
    if (err instanceof DatabaseReadError) return failDatabaseRun(input.store, run, wallStart);
    throw err;
  }
  const liveMaxAgeMs = input.liveMaxAgeMs ?? LIVE_REACTION_MAX_AGE_MS;
  const windowKind = input.windowKind ?? "point";
  for (const event of events) {
    run.sourcesAttempted += 1;
    reactionObs.events_evaluated += 1;
    const startedEvent = Date.now();
    try {
      const clock = applyScheduleClock(event.lifecycle, {
        scheduledStart: event.scheduledStartAt,
        scheduledEnd: event.scheduledEndAt,
        scheduledDate: event.scheduledDate,
      }, input.now);
      if (clock.lifecycle !== event.lifecycle) {
        event.lifecycleLog = appendLifecycle(
          event.lifecycleLog,
          event.lifecycle,
          clock.lifecycle,
          input.now.toISOString(),
          clock.reason ?? "schedule",
        );
        event.lifecycle = clock.lifecycle;
        applyScores(event, await input.store.listEvidence(event.id), input.now);
        await input.store.updateEvent(event);
        run.eventsUpdated += 1;
        reactionObs.canonical_events_updated += 1;
      }
      if (eventStillAhead(event, input.now)) {
        reactionObs.events_skipped_future += 1;
        run.sourcesSuccessful += 1;
        continue;
      }
      const ticker = (await input.store.listTickers(event.id)).find((row) => row.isPrimary);
      if (!ticker) {
        reactionObs.events_skipped_no_primary_ticker += 1;
        run.sourcesSuccessful += 1;
        continue;
      }
      if (mode === "live" && !isLiveReactionEligible(event, input.now, liveMaxAgeMs)) {
        reactionObs.events_skipped_historical += 1;
        run.sourcesSuccessful += 1;
        continue;
      }
      reactionObs.events_processed += 1;
      const existing = await input.store.getReaction(event.id, windowKind);
      const eventAt = eventReferenceInstant(event);
      let eventReferencePrice = existing?.referencePrice != null && existing.referencePrice > 0
        ? existing.referencePrice
        : null;
      let newProvenance: ReferencePriceProvenance | null = null;
      let referenceReused = false;
      if (eventReferencePrice != null && existing) {
        referenceReused = true;
        reactionObs.reference_prices_reused += 1;
      } else if (eventAt && input.loadReferenceBars) {
        reactionObs.polygon_lookups_attempted += 1;
        const bars = await input.loadReferenceBars(ticker.ticker, eventAt);
        const resolved = resolvePolygonReference({
          bars,
          eventAtIso: eventAt,
          ticker: ticker.ticker,
          event,
          resolvedAt: input.now,
        });
        eventReferencePrice = resolved.price;
        newProvenance = resolved.provenance;
        if (eventReferencePrice != null) reactionObs.polygon_reference_resolved += 1;
        else reactionObs.polygon_reference_unavailable += 1;
      }
      const radarObservation = await input.loadObservation(ticker.ticker);
      const assessment = assessReactionMarketContext(
        radarObservation,
        eventReferencePrice,
        input.now,
        input.maxAgeMs,
      );
      if (assessment.availability !== "available" && existing?.availability === "available") {
        reactionObs.events_skipped_stale_preservation += 1;
        run.sourcesSuccessful += 1;
        continue;
      }
      const reaction = preserveObservedMetrics(reactionFromAssessment(
        event.id,
        windowKind,
        radarObservation?.observedAt ?? null,
        assessment,
        existing?.id ?? crypto.randomUUID(),
      ), existing);
      reaction.payload = buildReactionPayload(reaction, {
        existing,
        newProvenance,
        referenceReused,
        resolvedAt: input.now,
      });
      const reactionChange = classifyReactionWrite(existing, reaction);
      if (reactionChange === "inserted") reactionObs.reaction_rows_inserted += 1;
      else if (reactionChange === "updated") reactionObs.reaction_rows_updated += 1;
      else reactionObs.reaction_rows_unchanged += 1;
      await input.store.upsertReaction(reaction);
      if (assessment.availability === "available") {
        reactionObs.events_reaction_scored += 1;
        event.reactionScore = assessment.reactionScore;
        const next = advanceForReaction(event.lifecycle, windowKind);
        if (next !== event.lifecycle) {
          event.lifecycleLog = appendLifecycle(
            event.lifecycleLog,
            event.lifecycle,
            next,
            input.now.toISOString(),
            "market_reaction",
          );
          event.lifecycle = next;
        }
        applyScores(event, await input.store.listEvidence(event.id), input.now);
        await input.store.updateEvent(event);
        run.eventsUpdated += 1;
        reactionObs.canonical_events_updated += 1;
      }
      run.sourcesSuccessful += 1;
    } catch (err) {
      run.sourcesFailed += 1;
      run.errors.push(safeError(
        event.id,
        err instanceof DatabaseReadError ? "database" : err instanceof SourceFetchError ? err.category : "market_data",
        null,
        true,
        Date.now() - startedEvent,
      ));
    }
  }
  run.completedAt = new Date().toISOString();
  run.elapsedMs = Date.now() - wallStart;
  run.status = run.errors.some((error) => error.category === "database") ? "failed" : "completed";
  attachRunObservability(run, { bot: "reactions", reactions: reactionObs });
  await input.store.saveRun(run);
  console.log(formatRunLog(run));
  return run;
}

function buildReactionPayload(
  reaction: ReactionRecord,
  ctx: {
    existing: ReactionRecord | null;
    newProvenance: ReferencePriceProvenance | null;
    referenceReused: boolean;
    resolvedAt: Date;
  },
): Record<string, unknown> {
  const payload = { ...reaction.payload };
  if (ctx.newProvenance) {
    payload.reference_provenance = ctx.newProvenance;
    payload.reference_price_reused = false;
  } else if (ctx.referenceReused && ctx.existing) {
    const prior = readStoredProvenance(ctx.existing.payload ?? {});
    if (prior) payload.reference_provenance = prior;
    else {
      const legacy = legacyProvenanceIfNeeded(reaction.referencePrice, ctx.existing.payload ?? {});
      if (legacy) payload.reference_provenance = legacy;
    }
    payload.reference_price_reused = true;
    payload.reference_reused_at = ctx.resolvedAt.toISOString();
  } else if (reaction.referencePrice != null && reaction.referencePrice > 0 && !readStoredProvenance(payload)) {
    const legacy = legacyProvenanceIfNeeded(reaction.referencePrice, payload);
    if (legacy) payload.reference_provenance = legacy;
  }
  return payload;
}

function classifyReactionWrite(
  existing: ReactionRecord | null,
  next: ReactionRecord,
): "inserted" | "updated" | "unchanged" {
  if (!existing) return "inserted";
  const comparable = [
    existing.availability,
    existing.referencePrice,
    existing.currentPrice,
    existing.percentMove,
    existing.rvol5m,
    existing.vwap,
    JSON.stringify(existing.payload ?? {}),
  ];
  const comparableNext = [
    next.availability,
    next.referencePrice,
    next.currentPrice,
    next.percentMove,
    next.rvol5m,
    next.vwap,
    JSON.stringify(next.payload ?? {}),
  ];
  return comparable.join("|") === comparableNext.join("|") ? "unchanged" : "updated";
}

function eventStillAhead(event: {
  lifecycle: string;
  scheduledStartAt: string | null;
  scheduledDate: string | null;
  effectiveAt: string | null;
}, now: Date): boolean {
  const startMs = event.scheduledStartAt ? Date.parse(event.scheduledStartAt) : NaN;
  if (Number.isFinite(startMs) && startMs > now.getTime()) return true;
  if (event.scheduledDate && event.scheduledDate > now.toISOString().slice(0, 10)) return true;
  if (event.lifecycle !== "scheduled" && event.lifecycle !== "approaching") return false;
  const stamp = event.scheduledStartAt ?? event.effectiveAt;
  const ms = stamp ? Date.parse(stamp) : Number.NaN;
  return Number.isFinite(ms) && ms > now.getTime();
}

function applySecMapObservability(obs: IngestObservability, resolved: SecCompanyMapResolution): void {
  obs.sec_company_map_attempts = resolved.attempts;
  obs.sec_company_map_source = resolved.source;
  obs.sec_company_map_state = resolved.state;
  obs.sec_company_map_states = resolved.states;
  obs.sec_company_map_age_seconds = resolved.ageSeconds;
  obs.sec_company_map_refreshed_at = resolved.refreshedAt;
  obs.sec_company_map_http_status = resolved.httpStatus;
  obs.sec_company_map_provider_condition = resolved.providerCondition;
  obs.sec_company_map_error_type = resolved.errorType;
  obs.sec_company_map_refresh_attempted = resolved.refreshAttempted;
}

async function failSecProviderRun(
  store: CatalystIntelStore,
  run: RunTelemetry,
  wallStart: number,
  diagnostic: SecCompanyMapDiagnostic,
  dueSources: number,
  ingestionObs: ReturnType<typeof emptyIngestObservability>,
): Promise<RunTelemetry> {
  run.status = "failed";
  run.completedAt = new Date().toISOString();
  run.elapsedMs = Date.now() - wallStart;
  run.errors.push({
    sourceId: "sec",
    category: diagnostic.category,
    statusCode: diagnostic.httpStatus,
    retryable: diagnostic.retryable,
    elapsedMs: run.elapsedMs,
    details: {
      stage: diagnostic.stage,
      provider: diagnostic.provider,
      url_identifier: diagnostic.urlIdentifier,
      error_type: diagnostic.errorType,
      message: diagnostic.message,
      attempt: diagnostic.attempt,
      attempts: diagnostic.attempts,
      due_sources: dueSources,
      atom_attempted: false,
      cache_state: ingestionObs.sec_company_map_state ?? null,
      cache_age_seconds: ingestionObs.sec_company_map_age_seconds ?? null,
      map_source: ingestionObs.sec_company_map_source ?? null,
      provider_condition: ingestionObs.sec_company_map_provider_condition ?? null,
      refresh_attempted: ingestionObs.sec_company_map_refresh_attempted ?? false,
      refreshed_at: ingestionObs.sec_company_map_refreshed_at ?? null,
    },
  });
  attachRunObservability(run, { bot: "sec", ingestion: ingestionObs });
  console.log(formatRunLog(run));
  try {
    await store.saveRun(run);
  } catch {
    // The dependency failure is already on the returned run.
  }
  return run;
}

async function failDatabaseRun(store: CatalystIntelStore, run: RunTelemetry, wallStart: number): Promise<RunTelemetry> {
  run.status = "failed";
  run.sourcesFailed += 1;
  run.completedAt = new Date().toISOString();
  run.elapsedMs = Date.now() - wallStart;
  run.errors.push(safeError(run.bot, "database", null, true, run.elapsedMs));
  console.log(formatRunLog(run));
  try {
    await store.saveRun(run);
  } catch {
    // The read already failed. Keep the failed run visible to the caller.
  }
  return run;
}

function markSuccess(
  source: SourceRecord,
  now: Date,
  fetchState: {
    etag: string | null;
    lastModified: string | null;
    contentHash: string | null;
    checkpoint: Record<string, unknown> | null;
  },
  continuationComplete = true,
): void {
  source.lastSuccessAt = now.toISOString();
  source.failureCount = 0;
  source.backoffUntil = null;
  source.lastErrorCategory = null;
  if (fetchState.etag) source.lastEtag = fetchState.etag;
  if (fetchState.lastModified) source.lastModified = fetchState.lastModified;
  if (fetchState.contentHash && continuationComplete) source.lastContentHash = fetchState.contentHash;
  if (fetchState.checkpoint) source.metadata = { ...source.metadata, checkpoint: fetchState.checkpoint };
}

async function checkpointRun(
  store: CatalystIntelStore,
  run: RunTelemetry,
  ingestionObs: ReturnType<typeof emptyIngestObservability>,
  bot: BotId,
  wallStart: number,
): Promise<void> {
  run.elapsedMs = Date.now() - wallStart;
  ingestionObs.last_progress_at = new Date().toISOString();
  attachRunObservability(run, { bot, ingestion: ingestionObs });
  try {
    await store.saveRun(run);
  } catch {
    // Best-effort progress persistence; final save still runs at end.
  }
}

async function mapPool<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await fn(items[index]);
    }
  });
  await Promise.all(workers);
}
