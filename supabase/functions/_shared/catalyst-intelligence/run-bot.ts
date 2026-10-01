import type { CatalystSourceAdapter } from "./source-adapter.ts";
import { backoffSeconds, MAX_ITEMS_PER_SOURCE } from "./config.ts";
import { advanceForReaction, appendLifecycle, applyScheduleClock } from "./lifecycle.ts";
import { eventReferenceInstant, referencePriceAtOrBefore, type EventPriceBar } from "./event-bars.ts";
import {
  assessReactionMarketContext,
  preserveObservedMetrics,
  reactionFromAssessment,
} from "./market-reaction.ts";
import { DatabaseReadError } from "./conflicts.ts";
import { isFixturePayload, normalizeTicker } from "./normalize.ts";
import { applyScores, ingestCandidate } from "./pipeline.ts";
import type { CatalystIntelStore } from "./persistence.ts";
import { SourceFetchError } from "./source-fetch.ts";
import { emptyRun, formatRunLog, safeError } from "./telemetry.ts";
import type {
  BotId,
  CompanyRecord,
  MarketObservation,
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
}

export async function runCollectorBot(input: CollectorRunInput): Promise<RunTelemetry> {
  const wallStart = Date.now();
  const run = emptyRun(input.bot, crypto.randomUUID(), new Date(wallStart).toISOString());
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
  let ingestQueue = Promise.resolve();
  const ingestNext = <T>(fn: () => Promise<T>): Promise<T> => {
    const result = ingestQueue.then(fn, fn);
    ingestQueue = result.then(() => undefined, () => undefined);
    return result;
  };
  await mapPool(sources, input.concurrency ?? 3, async (source) => {
    const startedSource = Date.now();
    run.sourcesAttempted += 1;
    const ctx = {
      now: input.now,
      source,
      userAgent: input.userAgent,
      fetchImpl: input.fetchImpl ?? fetch,
      cikMap: input.cikMap,
      companies,
      itemLimit: input.itemLimit ?? MAX_ITEMS_PER_SOURCE,
      allowFixtures: input.allowFixtures === true,
      fetchState: {
        unchanged: false,
        etag: null,
        lastModified: null,
        contentHash: null,
        checkpoint: null,
      },
    };
    try {
      if (isFixturePayload(source.metadata) && !input.allowFixtures) {
        run.sourcesSuccessful += 1;
        return;
      }
      const items = await input.adapter.discover(ctx);
      if (ctx.fetchState.unchanged) {
        markSuccess(source, input.now, ctx.fetchState);
        await input.store.saveSource(source);
        run.sourcesSuccessful += 1;
        return;
      }
      for (const item of items) {
        run.rawItemsSeen += 1;
        if ((item.metadata["x-stocksist-fixture"] === true || item.metadata.fixture === true) && !ctx.allowFixtures) {
          continue;
        }
        const candidate = await input.adapter.normalize(item, ctx);
        if (!candidate) continue;
        const outcome = await ingestNext(() => ingestCandidate(input.store, candidate, {
          now: input.now,
          allowFixtures: ctx.allowFixtures,
          source,
          companies,
          cikMap: input.cikMap,
        }));
        if (outcome.status === "created") run.eventsCreated += 1;
        else if (outcome.status === "updated") run.eventsUpdated += 1;
        if (outcome.rawDisposition === "inserted") run.newItems += 1;
        else if (outcome.rawDisposition === "existing_resumed" || outcome.rawDisposition === "existing_linked") {
          run.duplicates += 1;
        }
      }
      markSuccess(source, input.now, ctx.fetchState);
      await input.store.saveSource(source);
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
  run.completedAt = new Date().toISOString();
  run.elapsedMs = Date.now() - wallStart;
  run.status = run.errors.some((error) => error.category === "database") ? "failed" : "completed";
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
}

export async function runReactionBot(input: ReactionRunInput): Promise<RunTelemetry> {
  const wallStart = Date.now();
  const run = emptyRun("reactions", crypto.randomUUID(), new Date(wallStart).toISOString());
  let events;
  try {
    events = await input.store.listReactionCandidates(input.batchLimit);
  } catch (err) {
    if (err instanceof DatabaseReadError) return failDatabaseRun(input.store, run, wallStart);
    throw err;
  }
  const windowKind = input.windowKind ?? "point";
  for (const event of events) {
    run.sourcesAttempted += 1;
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
      }
      if (eventStillAhead(event, input.now)) {
        run.sourcesSuccessful += 1;
        continue;
      }
      const ticker = (await input.store.listTickers(event.id)).find((row) => row.isPrimary);
      if (!ticker) {
        run.sourcesSuccessful += 1;
        continue;
      }
      const existing = await input.store.getReaction(event.id, windowKind);
      const eventAt = eventReferenceInstant(event);
      let eventReferencePrice = existing?.referencePrice != null && existing.referencePrice > 0
        ? existing.referencePrice
        : null;
      if (eventReferencePrice == null && eventAt && input.loadReferenceBars) {
        const bars = await input.loadReferenceBars(ticker.ticker, eventAt);
        eventReferencePrice = referencePriceAtOrBefore(bars, Date.parse(eventAt));
      }
      const radarObservation = await input.loadObservation(ticker.ticker);
      const assessment = assessReactionMarketContext(
        radarObservation,
        eventReferencePrice,
        input.now,
        input.maxAgeMs,
      );
      if (assessment.availability !== "available" && existing?.availability === "available") {
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
      await input.store.upsertReaction(reaction);
      if (assessment.availability === "available") {
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
  await input.store.saveRun(run);
  console.log(formatRunLog(run));
  return run;
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
  fetchState: { etag: string | null; lastModified: string | null; contentHash: string | null; checkpoint: Record<string, unknown> | null },
): void {
  source.lastSuccessAt = now.toISOString();
  source.failureCount = 0;
  source.backoffUntil = null;
  source.lastErrorCategory = null;
  if (fetchState.etag) source.lastEtag = fetchState.etag;
  if (fetchState.lastModified) source.lastModified = fetchState.lastModified;
  if (fetchState.contentHash) source.lastContentHash = fetchState.contentHash;
  if (fetchState.checkpoint) source.metadata = { ...source.metadata, checkpoint: fetchState.checkpoint };
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
