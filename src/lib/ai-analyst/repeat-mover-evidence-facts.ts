import {
  buildHistoricalMemoryFromRepeatMoverContext,
  type HistoricalMemoryFacts,
} from "@/lib/ai-analyst/historical-memory";
import type { RepeatMoverContext } from "@/types/repeat-mover";

/** @deprecated Prefer HistoricalMemoryFacts via buildHistoricalMemoryFromRepeatMoverContext */
export type RepeatMoverAnalystEvidenceFacts = HistoricalMemoryFacts;

export function repeatMoverContextToAnalystFacts(
  context: RepeatMoverContext | null | undefined,
): HistoricalMemoryFacts | null {
  if (!context) return null;
  return buildHistoricalMemoryFromRepeatMoverContext(context);
}