import type { RadarV2ScreenerRow } from "@/lib/screeners/radar-v2-adapter";
import { mapRadarEnrichmentRequest } from "@/lib/radar/map-radar-row-to-repeat-mover-input";
import type { RadarHistoricalContextEnrichmentRequest } from "@/lib/radar/radar-historical-context-types";
import { chunkRadarHistoricalContextRequests } from "@/lib/radar/radar-historical-context-bounds";

function discoveryRank(row: RadarV2ScreenerRow): number {
  const rank = row.radar_rank;
  if (typeof rank === "number" && Number.isFinite(rank) && rank > 0) return rank;
  return Number.MAX_SAFE_INTEGER;
}

function volumeScore(row: RadarV2ScreenerRow): number {
  const volume = row.volume;
  return typeof volume === "number" && Number.isFinite(volume) ? volume : 0;
}

/**
 * Volume-first Discovery order. Stable tie-break on symbol.
 */
export function orderRadarRowsForHistoricalPriority(
  rows: readonly RadarV2ScreenerRow[],
): RadarV2ScreenerRow[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const rankDelta = discoveryRank(a.row) - discoveryRank(b.row);
      if (rankDelta !== 0) return rankDelta;
      const volumeDelta = volumeScore(b.row) - volumeScore(a.row);
      if (volumeDelta !== 0) return volumeDelta;
      return a.index - b.index;
    })
    .map(({ row }) => row);
}

export function buildPrioritizedHistoricalBatches(input: {
  rows: readonly RadarV2ScreenerRow[];
  userPrioritySymbols?: readonly string[];
}): RadarHistoricalContextEnrichmentRequest[][] {
  const prioritySet = new Set(
    (input.userPrioritySymbols ?? []).map((symbol) => symbol.trim().toUpperCase()).filter(Boolean),
  );
  const ordered = orderRadarRowsForHistoricalPriority(input.rows);
  const userFirst: RadarV2ScreenerRow[] = [];
  const rest: RadarV2ScreenerRow[] = [];
  for (const row of ordered) {
    if (prioritySet.has(row.symbol.toUpperCase())) userFirst.push(row);
    else rest.push(row);
  }
  const requests = [...userFirst, ...rest].map((row) => mapRadarEnrichmentRequest(row));
  return chunkRadarHistoricalContextRequests(requests);
}

/** Publication token for merge guards — not used as a historical cache key. */
export function radarHistoricalPublicationToken(input: {
  publicationSeq: number;
}): number {
  return input.publicationSeq;
}
