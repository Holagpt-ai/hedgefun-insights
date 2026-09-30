import type { RunTelemetry, SourceRunError } from "./types.ts";

export function emptyRun(bot: RunTelemetry["bot"], runId: string, startedAt: string): RunTelemetry {
  return {
    runId,
    bot,
    startedAt,
    completedAt: null,
    sourcesAttempted: 0,
    sourcesSuccessful: 0,
    sourcesFailed: 0,
    rawItemsSeen: 0,
    newItems: 0,
    duplicates: 0,
    eventsCreated: 0,
    eventsUpdated: 0,
    eventsInvalidated: 0,
    elapsedMs: null,
    status: "running",
    errors: [],
  };
}

export function formatRunLog(run: RunTelemetry): string {
  const errors = run.errors.map((error) => ({
    source_id: error.sourceId,
    category: error.category,
    status_code: error.statusCode,
    retryable: error.retryable,
    elapsed_ms: error.elapsedMs,
  }));
  return JSON.stringify({
    component: "catalyst-intelligence",
    run_id: run.runId,
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
    errors,
  });
}

export function safeError(sourceId: string, category: string, statusCode: number | null, retryable: boolean, elapsedMs: number): SourceRunError {
  return { sourceId, category, statusCode, retryable, elapsedMs };
}
