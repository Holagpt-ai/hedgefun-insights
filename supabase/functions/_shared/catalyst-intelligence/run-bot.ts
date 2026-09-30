import type { CatalystSourceAdapter } from "./source-adapter.ts";
import { backoffSeconds, MAX_ITEMS_PER_SOURCE } from "./config.ts";
import { advanceForReaction, appendLifecycle } from "./lifecycle.ts";
import {
  assessMarketObservation,
  reactionFromAssessment,
} from "./market-reaction.ts";
import { isFixturePayload } from "./normalize.ts";
import { applyScores, ingestCandidate } from "./pipeline.ts";
import type { CatalystIntelStore } from "./persistence.ts";
import { selectDueSources } from "./source-registry.ts";
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
  cikMap?: ReadonlyMap<string, string[]>;
  itemLimit?: number;
}

export async function runCollectorBot(input: CollectorRunInput): Promise<RunTelemetry> {
  const wallStart = Date.now();
  const run = emptyRun(input.bot, crypto.randomUUID(), new Date(wallStart).toISOString());
  const sources = selectDueSources(
    await input.store.listSources({ sourceType: input.adapter.sourceType, enabledOnly: true }),
    input.now,
    input.batchLimit,
    input.allowlist,
  );
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
      companies: input.companies,
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
          companies: input.companies,
          cikMap: input.cikMap,
        }));
        if (outcome.status === "created") run.eventsCreated += 1;
        else if (outcome.status === "updated") run.eventsUpdated += 1;
        else if (outcome.status === "duplicate") run.duplicates += 1;
        if (outcome.rawItemId && outcome.status !== "duplicate") run.newItems += 1;
      }
      markSuccess(source, input.now, ctx.fetchState);
      await input.store.saveSource(source);
      run.sourcesSuccessful += 1;
    } catch (err) {
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
  run.status = "completed";
  await input.store.saveRun(run);
  console.log(formatRunLog(run));
  return run;
}

export interface ReactionRunInput {
  store: CatalystIntelStore;
  now: Date;
  batchLimit: number;
  loadObservation: (symbol: string) => Promise<MarketObservation | null>;
  windowKind?: ReactionWindow;
  maxAgeMs?: number;
}

export async function runReactionBot(input: ReactionRunInput): Promise<RunTelemetry> {
  const wallStart = Date.now();
  const run = emptyRun("reactions", crypto.randomUUID(), new Date(wallStart).toISOString());
  const events = await input.store.listReactionCandidates(input.batchLimit);
  const windowKind = input.windowKind ?? "point";
  for (const event of events) {
    run.sourcesAttempted += 1;
    const startedEvent = Date.now();
    try {
      const ticker = (await input.store.listTickers(event.id)).find((row) => row.isPrimary);
      if (!ticker) {
        run.sourcesSuccessful += 1;
        continue;
      }
      const observation = await input.loadObservation(ticker.ticker);
      const assessment = assessMarketObservation(observation, input.now, input.maxAgeMs);
      const existing = await input.store.getReaction(event.id, windowKind);
      if (assessment.availability !== "available" && existing?.availability === "available") {
        run.sourcesSuccessful += 1;
        continue;
      }
      await input.store.upsertReaction(reactionFromAssessment(
        event.id,
        windowKind,
        observation?.observedAt ?? null,
        assessment,
        existing?.id ?? crypto.randomUUID(),
      ));
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
        err instanceof SourceFetchError ? err.category : "market_data",
        null,
        true,
        Date.now() - startedEvent,
      ));
    }
  }
  run.completedAt = new Date().toISOString();
  run.elapsedMs = Date.now() - wallStart;
  run.status = "completed";
  await input.store.saveRun(run);
  console.log(formatRunLog(run));
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
