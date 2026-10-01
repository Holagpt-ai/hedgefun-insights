import type { BotId, RunTelemetry, SourceRunError } from "./types.ts";

/** Bot-specific counters persisted via the run `errors` jsonb array (category `metrics`). */
export interface RunObservability {
  bot: BotId;
  ingestion?: IngestObservability;
  reactions?: ReactionObservability;
}

export interface IngestObservability {
  items_encountered: number;
  items_qualifying: number;
  items_rejected: number;
  rejection_reasons: Record<string, number>;
}

export interface ReactionObservability {
  events_evaluated: number;
  events_skipped_future: number;
  events_skipped_no_primary_ticker: number;
  events_skipped_stale_preservation: number;
  events_processed: number;
  reaction_rows_inserted: number;
  reaction_rows_updated: number;
  reaction_rows_unchanged: number;
  polygon_lookups_attempted: number;
  polygon_reference_resolved: number;
  polygon_reference_unavailable: number;
  reference_prices_reused: number;
  events_reaction_scored: number;
  canonical_events_updated: number;
}

export function emptyIngestObservability(): IngestObservability {
  return {
    items_encountered: 0,
    items_qualifying: 0,
    items_rejected: 0,
    rejection_reasons: {},
  };
}

export function emptyReactionObservability(): ReactionObservability {
  return {
    events_evaluated: 0,
    events_skipped_future: 0,
    events_skipped_no_primary_ticker: 0,
    events_skipped_stale_preservation: 0,
    events_processed: 0,
    reaction_rows_inserted: 0,
    reaction_rows_updated: 0,
    reaction_rows_unchanged: 0,
    polygon_lookups_attempted: 0,
    polygon_reference_resolved: 0,
    polygon_reference_unavailable: 0,
    reference_prices_reused: 0,
    events_reaction_scored: 0,
    canonical_events_updated: 0,
  };
}

export function recordRejection(obs: IngestObservability, reason: string): void {
  obs.items_rejected += 1;
  obs.rejection_reasons[reason] = (obs.rejection_reasons[reason] ?? 0) + 1;
}

export function ingestRejectionReason(
  item: { title: string | null },
  _candidateMissing: boolean,
): string {
  if (!item.title?.trim()) return "missing_title";
  return "normalization_rejected";
}

export function attachRunObservability(run: RunTelemetry, observability: RunObservability): void {
  run.observability = observability as unknown as Record<string, unknown>;
}

export function serializeRunErrors(run: RunTelemetry): SourceRunError[] {
  const errors = [...run.errors];
  if (run.observability) {
    errors.push({
      sourceId: "_observability",
      category: "metrics",
      statusCode: null,
      retryable: false,
      elapsedMs: 0,
      details: run.observability as unknown as Record<string, unknown>,
    });
  }
  return errors;
}
