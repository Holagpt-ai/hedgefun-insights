import {
  reconstructionFactsToPersistRow,
  timelineEventsToPersistRows,
} from "@/lib/intraday-reconstruction/intraday-reconstruction-record";
import type { EpisodeIntradayReconstructionFacts } from "@/lib/intraday-reconstruction/intraday-reconstruction-types";
import type { HistoricalBridgeClient } from "@/lib/persistence/historical-bridge-client";

export async function applyIntradayReconstructionBatch(input: {
  bridge: HistoricalBridgeClient;
  factsRows: readonly EpisodeIntradayReconstructionFacts[];
}): Promise<{ reconApplied: number; eventsApplied: number }> {
  if (input.factsRows.length === 0) return { reconApplied: 0, eventsApplied: 0 };
  const reconRows = input.factsRows.map(reconstructionFactsToPersistRow);
  const eventRows = input.factsRows.flatMap(timelineEventsToPersistRows);
  const reconResult = await input.bridge.call("intraday_reconstruction_apply_batch", { rows: reconRows });
  const eventsResult = await input.bridge.call("intraday_episode_event_apply_batch", { rows: eventRows });
  return {
    reconApplied: Number(reconResult.applied ?? reconRows.length),
    eventsApplied: Number(eventsResult.applied ?? eventRows.length),
  };
}
