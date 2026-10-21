import { coerceRepeatMoverContextForDisplay } from "@/lib/radar/coerce-repeat-mover-context-for-display";
import type { RadarHistoricalContextLoadStatus } from "@/lib/radar/radar-historical-context-types";
import type { RepeatMoverContext } from "@/types/repeat-mover";

export function resolveHistoricalContextLoadStatus(
  context: RepeatMoverContext | null,
): RadarHistoricalContextLoadStatus {
  if (!context) return "unavailable";
  if (context.profile?.profileAvailable === false) return "unavailable";
  const quality = context.profile?.sampleSizeQuality;
  if (quality === "LIMITED" || quality === "INSUFFICIENT") return "limited";
  return "available";
}

/**
 * Edge `radar-historical-context` returns HTTP 200 with null `historicalContext` for
 * per-request timeouts, bridge failures, and whole-batch timeouts. It does not expose
 * a distinct "verified empty history" signal in those cases. Until the Edge function
 * adds an explicit retrieval outcome field, null bodies are classified as unavailable —
 * not confirmed absence of history.
 */
export function classifyHistoricalContextBatchResult(input: {
  historicalContext: RepeatMoverContext | null | undefined;
  priorContext?: RepeatMoverContext | null;
}): RadarHistoricalContextLoadStatus {
  const coerced = coerceRepeatMoverContextForDisplay(input.historicalContext);
  if (coerced) return resolveHistoricalContextLoadStatus(coerced);
  if (input.priorContext) {
    return resolveHistoricalContextLoadStatus(input.priorContext);
  }
  return "unavailable";
}
