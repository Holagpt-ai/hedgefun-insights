import type { CatalystSourceAdapter } from "./source-adapter.ts";
import { buildAttributionIndex } from "./attribution-index.ts";
import {
  backoffSeconds,
  providerBackoffSeconds,
  secFilingsRateLimitBackoffSeconds,
  secFilingsRateLimitFloorApplied,
  LIVE_REACTION_MAX_AGE_MS,
  MAX_ITEMS_PER_SOURCE,
  MAX_NEWS_ITEMS_PER_SOURCE,
  NEWS_ITEMS_PER_INVOCATION,
  NEWS_WALL_TIME_MS,
} from "./config.ts";
import {
  continuationForFeed,
  hasPendingNewsArticles,
  readNewsContinuation,
  writeNewsContinuation,
} from "./news-continuation.ts";
import { writeSecIntelContinuation } from "./sec-intel-continuation.ts";
import {
  isLiveReactionEligible,
  loadHistoricalBackfillCandidates,
  type HistoricalBackfillScope,
  type ReactionRunMode,
} from "./reaction-eligibility.ts";
import {
  DEFAULT_LIVE_REACTION_WINDOWS,
  isBarTimedReactionWindow,
  reactionWindowOffsetMs,
  reactionWindowsDueForEvent,
} from "./reaction-window-schedule.ts";
import { advanceForReaction, appendLifecycle, applyScheduleClock } from "./lifecycle.ts";
import { eventReferenceInstant, referencePriceAtOrBefore, type EventPriceBar } from "./event-bars.ts";
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
  assessBarTimedWindowReaction,
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
  FetchState,
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
    const pendingNewsAtStart = input.bot === "news" ? readNewsContinuation(source.metadata) : null;
    const pendingSecAtStart = input.bot === "sec"
      ? source.metadata.sec_intel_continuation != null
      : false;
    const pendingFeedCount = pendingNewsAtStart?.feed_item_count ?? 0;
    const newsItemLimit = input.bot === "news"
      ? Math.max(
        input.itemLimit ?? MAX_ITEMS_PER_SOURCE,
        MAX_NEWS_ITEMS_PER_SOURCE,
        pendingFeedCount + 16,
      )
      : input.itemLimit ?? MAX_ITEMS_PER_SOURCE;
    const fetchState: FetchState = {
      unchanged: false,
      etag: null,
      lastModified: null,
      contentHash: pendingNewsAtStart?.feed_content_hash ?? null,
      checkpoint: null,
      forceFullFetch: input.bot === "news" && pendingNewsAtStart != null,
    };
    const ctx = {
      now: input.now,
      source,
      userAgent: input.userAgent,
      fetchImpl: input.fetchImpl ?? fetch,
      companies,
      cikMap,
      itemLimit: newsItemLimit,
      allowFixtures: input.allowFixtures === true,
      fetchState,
    };
    try {
      if (isFixturePayload(source.metadata) && !input.allowFixtures) {
        run.sourcesSuccessful += 1;
        return;
      }
      let items = await input.adapter.discover(ctx);
      if (input.bot === "sec") recordSecFilingsFetch(ingestionObs, ctx.fetchState);
      const pendingNewsContinuation = input.bot === "news" && readNewsContinuation(source.metadata) != null;
      if (ctx.fetchState.unchanged && !pendingNewsContinuation && !pendingSecAtStart) {
        markSuccess(source, input.now, ctx.fetchState, true);
        await input.store.saveSource(source);
        run.sourcesSuccessful += 1;
        return;
      }
      if (ctx.fetchState.unchanged && pendingNewsContinuation) {
        ctx.fetchState.unchanged = false;
        ctx.fetchState.forceFullFetch = true;
        items = await input.adapter.discover(ctx);
      }
      if (pendingNewsContinuation && (ctx.fetchState.unchanged || items.length === 0)) {
        const pending = readNewsContinuation(source.metadata);
        ingestionObs.continuation_remaining_items = pending
          ? Math.max(0, pending.feed_item_count - pending.next_item_index)
          : 0;
        ingestionObs.resource_stop_reason = "news_feed_unchanged";
        markSuccess(source, input.now, ctx.fetchState, false);
        await input.store.saveSource(source);
        await checkpointRun(input.store, run, ingestionObs, input.bot, wallStart);
        run.sourcesSuccessful += 1;
        return;
      }
      const feedHash = ctx.fetchState.contentHash;
      const priorContinuation = input.bot === "news" ? readNewsContinuation(source.metadata) : null;
      const feedHashChanged = priorContinuation != null && priorContinuation.feed_content_hash !== feedHash;
      const feedPlan = input.bot === "news" && feedHash
        ? continuationForFeed(source.metadata, feedHash, items.length)
        : { startIndex: 0, state: null };
      if (
        input.bot === "news" &&
        feedHash &&
        feedPlan.startIndex >= items.length &&
        hasPendingNewsArticles(source.metadata, feedHash, items.length)
      ) {
        const pending = readNewsContinuation(source.metadata);
        ingestionObs.continuation_remaining_items = pending
          ? Math.max(0, pending.feed_item_count - pending.next_item_index)
          : 0;
        ingestionObs.resource_stop_reason = "news_feed_item_count_mismatch";
        markSuccess(source, input.now, ctx.fetchState, false);
        await input.store.saveSource(source);
        await checkpointRun(input.store, run, ingestionObs, input.bot, wallStart);
        run.sourcesSuccessful += 1;
        return;
      }
      let absoluteIndex = feedPlan.startIndex;
      let processedThisRun = 0;
      let continuationComplete = feedPlan.startIndex >= items.length &&
        !hasPendingNewsArticles(source.metadata, feedHash, items.length);
      while (absoluteIndex < items.length) {
        const item = items[absoluteIndex];
        if (input.bot === "news") {
          if (processedThisRun >= newsItemBudget) {
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
        if (input.bot === "news") {
          const duplicate = outcome.rawDisposition === "existing_resumed" ||
            outcome.rawDisposition === "existing_linked";
          if (outcome.rawDisposition === "inserted" || (!feedHashChanged && duplicate)) {
            processedThisRun += 1;
          }
        }
        absoluteIndex += 1;
        if (input.bot === "news" && feedHash) {
          const feedItemCount = items.length;
          const paused = absoluteIndex < feedItemCount;
          source.metadata = writeNewsContinuation(source.metadata, paused ? {
            feed_content_hash: feedHash,
            next_item_index: absoluteIndex,
            feed_item_count: feedItemCount,
          } : null);
          ingestionObs.continuation_remaining_items = paused ? feedItemCount - absoluteIndex : 0;
          continuationComplete = !paused;
          await input.store.saveSource(source);
          await checkpointRun(input.store, run, ingestionObs, input.bot, wallStart);
        }
      }
      if (input.bot === "news" && feedHash) {
        const feedItemCount = items.length;
        const paused = absoluteIndex < feedItemCount;
        if (paused) {
          source.metadata = writeNewsContinuation(source.metadata, {
            feed_content_hash: feedHash,
            next_item_index: absoluteIndex,
            feed_item_count: feedItemCount,
          });
          ingestionObs.continuation_remaining_items = feedItemCount - absoluteIndex;
          continuationComplete = false;
        } else {
          source.metadata = writeNewsContinuation(source.metadata, null);
          ingestionObs.continuation_remaining_items = 0;
          continuationComplete = true;
        }
      }
      if (input.bot === "sec" && ctx.fetchState.secIntelPatch) {
        const secPatch = ctx.fetchState.secIntelPatch;
        source.metadata = writeSecIntelContinuation(source.metadata, secPatch.continuation);
        if (secPatch.batchComplete && secPatch.checkpoint) {
          source.metadata = { ...source.metadata, checkpoint: secPatch.checkpoint };
        }
        continuationComplete = secPatch.batchComplete;
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
      const filingsRateLimit = input.bot === "sec" && known?.category === "provider_rate_limited";
      const backoff = filingsRateLimit
        ? secFilingsRateLimitBackoffSeconds(source.failureCount, known?.retryAfterSeconds)
        : providerBackoffSeconds(source.failureCount, known?.retryAfterSeconds);
      source.backoffUntil = new Date(input.now.getTime() + backoff * 1000).toISOString();
      source.lastErrorCategory = known?.category ?? "source_error";
      if (input.bot === "sec") {
        recordSecFilingsFetch(ingestionObs, ctx.fetchState);
        ingestionObs.sec_filings_backoff_seconds = backoff;
        if (filingsRateLimit) {
          ingestionObs.sec_filings_rate_limit_floor_applied = secFilingsRateLimitFloorApplied(
            source.failureCount,
            known?.retryAfterSeconds,
          );
        }
      }
      await input.store.saveSource(source);
      run.sourcesFailed += 1;
      const sourceError = safeError(
        source.id,
        known?.category ?? "source_error",
        known?.statusCode ?? null,
        known?.retryable ?? false,
        Date.now() - startedSource,
      );
      if (input.bot === "sec") {
        sourceError.details = {
          http_status: known?.statusCode ?? null,
          retry_after_seconds: known?.retryAfterSeconds ?? null,
          filings_http_attempts: ctx.fetchState.providerHttpAttempts ?? 0,
          backoff_seconds: backoff,
          rate_limit_floor_applied: filingsRateLimit
            ? secFilingsRateLimitFloorApplied(source.failureCount, known?.retryAfterSeconds)
            : false,
        };
      }
      run.errors.push(sourceError);
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
  reactionWindows?: readonly ReactionWindow[];
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
  const scheduledWindows = input.reactionWindows ??
    (input.windowKind != null ? [input.windowKind] : [...DEFAULT_LIVE_REACTION_WINDOWS]);
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
      const windowsDue = mode === "live"
        ? reactionWindowsDueForEvent(event, input.now, scheduledWindows)
        : scheduledWindows;
      if (windowsDue.length === 0) {
        run.sourcesSuccessful += 1;
        continue;
      }
      reactionObs.events_processed += 1;
      const eventAt = eventReferenceInstant(event);
      const eventMs = eventAt ? Date.parse(eventAt) : NaN;
      let sharedReferencePrice: number | null = null;
      let sharedProvenance: ReferencePriceProvenance | null = null;
      let sharedBars: readonly EventPriceBar[] | null = null;
      let referenceLookupDone = false;
      const needsRadar = windowsDue.some((window) => !isBarTimedReactionWindow(window));
      const radarObservation = needsRadar ? await input.loadObservation(ticker.ticker) : null;
      for (const activeWindow of windowsDue) {
        const existing = await input.store.getReaction(event.id, activeWindow);
        let eventReferencePrice = existing?.referencePrice != null && existing.referencePrice > 0
          ? existing.referencePrice
          : sharedReferencePrice;
        let newProvenance: ReferencePriceProvenance | null = null;
        let referenceReused = false;
        if (eventReferencePrice != null && existing) {
          referenceReused = true;
          reactionObs.reference_prices_reused += 1;
        } else if (!referenceLookupDone && eventAt && input.loadReferenceBars) {
          referenceLookupDone = true;
          reactionObs.polygon_lookups_attempted += 1;
          sharedBars = await input.loadReferenceBars(ticker.ticker, eventAt);
          const resolved = resolvePolygonReference({
            bars: sharedBars,
            eventAtIso: eventAt,
            ticker: ticker.ticker,
            event,
            resolvedAt: input.now,
          });
          sharedReferencePrice = resolved.price;
          sharedProvenance = resolved.provenance;
          eventReferencePrice = sharedReferencePrice;
          if (eventReferencePrice != null) reactionObs.polygon_reference_resolved += 1;
          else reactionObs.polygon_reference_unavailable += 1;
        } else if (sharedReferencePrice != null) {
          eventReferencePrice = sharedReferencePrice;
          newProvenance = sharedProvenance;
        }
        let assessment;
        let observedAt: string | null = null;
        if (isBarTimedReactionWindow(activeWindow)) {
          const offsetMs = reactionWindowOffsetMs(activeWindow);
          const bars = sharedBars ?? [];
          const windowMs = Number.isFinite(eventMs) && offsetMs != null ? eventMs + offsetMs : NaN;
          const windowPrice = Number.isFinite(windowMs)
            ? referencePriceAtOrBefore(bars, windowMs)
            : null;
          if (Number.isFinite(windowMs)) observedAt = new Date(windowMs).toISOString();
          assessment = assessBarTimedWindowReaction(eventReferencePrice, windowPrice);
        } else {
          assessment = assessReactionMarketContext(
            radarObservation,
            eventReferencePrice,
            input.now,
            input.maxAgeMs,
          );
          observedAt = radarObservation?.observedAt ?? null;
        }
        if (assessment.availability !== "available" && existing?.availability === "available") {
          reactionObs.events_skipped_stale_preservation += 1;
          continue;
        }
        const reaction = preserveObservedMetrics(reactionFromAssessment(
          event.id,
          activeWindow,
          observedAt,
          assessment,
          existing?.id ?? crypto.randomUUID(),
        ), existing);
        reaction.payload = buildReactionPayload(reaction, {
          existing,
          newProvenance: newProvenance ?? sharedProvenance,
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
          const next = advanceForReaction(event.lifecycle, activeWindow);
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

function recordSecFilingsFetch(
  obs: IngestObservability,
  fetchState: { providerHttpAttempts?: number; providerHttpStatus?: number | null; providerRetryAfterSeconds?: number | null },
): void {
  obs.sec_filings_http_attempts = fetchState.providerHttpAttempts ?? 0;
  obs.sec_filings_http_status = fetchState.providerHttpStatus ?? null;
  obs.sec_filings_retry_after_seconds = fetchState.providerRetryAfterSeconds ?? null;
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
