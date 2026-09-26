import { attachHistoricalEventsFromStore } from "../episode-event-linkage/attach-events-to-comparables.ts";
import { parseEventReactionLinkRows } from "../episode-event-linkage/bridge-link-rows.ts";
import { attachForwardOutcomesToComparables } from "../forward-outcomes/attach-comparables.ts";
import { attachIntradayReconstructionToComparables } from "../intraday-reconstruction/attach-comparables.ts";
import type { RepeatMoverComparableEpisode } from "./types.ts";

export const REPEAT_MOVER_COMPARABLE_ENRICHMENT_RPC = {
  forwardOutcomes: "forward_outcome_list_by_episodes_v1",
  intradayReconstruction: "intraday_reconstruction_list_by_episodes_v1",
  eventReactionLinks: "event_reaction_link_list_for_episodes_v1",
} as const;

export type RepeatMoverComparableRpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<Response>;

async function readRpcResultRows(response: Response): Promise<Record<string, unknown>[]> {
  if (!response.ok) return [];
  try {
    const parsed = JSON.parse(await response.text()) as Record<string, unknown>;
    if (Array.isArray(parsed.result)) {
      return parsed.result as Record<string, unknown>[];
    }
    return [];
  } catch {
    return [];
  }
}

function syncMostRecentComparable(
  comparables: RepeatMoverComparableEpisode[],
  previous: RepeatMoverComparableEpisode | null,
): RepeatMoverComparableEpisode | null {
  if (!previous) return null;
  return comparables.find((episode) => episode.episodeId === previous.episodeId) ?? previous;
}

/**
 * Batch-enriches comparable episodes with forward outcomes, intraday reconstruction,
 * and episode-linked historical events. Fail-soft per enrichment source.
 */
export async function enrichRepeatMoverComparableEpisodes(input: {
  comparables: readonly RepeatMoverComparableEpisode[];
  mostRecentComparableEpisode: RepeatMoverComparableEpisode | null;
  rpc: RepeatMoverComparableRpc;
}): Promise<{
  closestComparableEpisodes: RepeatMoverComparableEpisode[];
  mostRecentComparableEpisode: RepeatMoverComparableEpisode | null;
  enrichmentQueryCount: number;
}> {
  const episodeIds = input.comparables.map((episode) => episode.episodeId);
  if (episodeIds.length === 0) {
    return {
      closestComparableEpisodes: [],
      mostRecentComparableEpisode: null,
      enrichmentQueryCount: 0,
    };
  }

  const rpcArgs = { p_episode_ids: episodeIds };
  const [foResponse, intradayResponse, eventResponse] = await Promise.all([
    input.rpc(REPEAT_MOVER_COMPARABLE_ENRICHMENT_RPC.forwardOutcomes, rpcArgs),
    input.rpc(REPEAT_MOVER_COMPARABLE_ENRICHMENT_RPC.intradayReconstruction, rpcArgs),
    input.rpc(REPEAT_MOVER_COMPARABLE_ENRICHMENT_RPC.eventReactionLinks, rpcArgs),
  ]);

  let enriched: RepeatMoverComparableEpisode[] = [...input.comparables];

  const foRows = await readRpcResultRows(foResponse);
  if (foRows.length > 0) {
    enriched = attachForwardOutcomesToComparables(enriched, foRows);
  }

  const intradayRows = await readRpcResultRows(intradayResponse);
  if (intradayRows.length > 0) {
    enriched = attachIntradayReconstructionToComparables(enriched, intradayRows);
  }

  const eventRows = await readRpcResultRows(eventResponse);
  if (eventRows.length > 0) {
    const { links, eventsById } = parseEventReactionLinkRows(eventRows);
    enriched = attachHistoricalEventsFromStore(enriched, links, eventsById);
  }

  return {
    closestComparableEpisodes: enriched,
    mostRecentComparableEpisode: syncMostRecentComparable(
      enriched,
      input.mostRecentComparableEpisode,
    ),
    enrichmentQueryCount: 3,
  };
}
