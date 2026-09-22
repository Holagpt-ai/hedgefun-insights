import type { ForwardOutcomeSessionHorizon } from "@/config/forward-outcomes.config";
import { nextSessionContinuationFromD1 } from "@/lib/forward-outcomes/next-session-continuation";
import type {
  PersistedForwardOutcomeRow,
  RepeatMoverForwardOutcomeEvidence,
} from "@/lib/forward-outcomes/forward-outcome-types";
import { forwardOutcomesByEpisodeId } from "@/lib/forward-outcomes/forward-outcome-record";
import type { EpisodeDirection } from "@/config/security-intelligence.config";
import type { RepeatMoverComparableEpisode } from "@/types/repeat-mover";

export function buildRepeatMoverForwardOutcomeEvidence(input: {
  byHorizon: ReadonlyMap<ForwardOutcomeSessionHorizon, PersistedForwardOutcomeRow>;
  episodeDirection: EpisodeDirection;
}): RepeatMoverForwardOutcomeEvidence {
  const closeToCloseReturnPct: RepeatMoverForwardOutcomeEvidence["closeToCloseReturnPct"] = {};
  const highExcursionPct: RepeatMoverForwardOutcomeEvidence["highExcursionPct"] = {};
  const lowExcursionPct: RepeatMoverForwardOutcomeEvidence["lowExcursionPct"] = {};
  const closePosition: RepeatMoverForwardOutcomeEvidence["closePosition"] = {};

  for (const [horizon, facts] of input.byHorizon.entries()) {
    if (!facts.dataAvailable) continue;
    closeToCloseReturnPct[horizon] = facts.returnPct;
    highExcursionPct[horizon] = facts.maxGainPct;
    lowExcursionPct[horizon] = facts.maxDrawdownPct;
    closePosition[horizon] = facts.closePosition;
  }

  const d1 = input.byHorizon.get("D1");
  const nextSession = d1
    ? nextSessionContinuationFromD1({ d1, episodeDirection: input.episodeDirection })
    : null;

  return {
    closeToCloseReturnPct,
    highExcursionPct,
    lowExcursionPct,
    closePosition,
    nextSession,
  };
}

export function attachForwardOutcomesFromStore(
  episodes: readonly RepeatMoverComparableEpisode[],
  persistedRows: readonly PersistedForwardOutcomeRow[],
): RepeatMoverComparableEpisode[] {
  const byEpisode = forwardOutcomesByEpisodeId(persistedRows);
  return episodes.map((episode) => {
    const bucket = byEpisode.get(episode.episodeId);
    if (!bucket) return episode;
    const evidence = buildRepeatMoverForwardOutcomeEvidence({
      byHorizon: bucket as ReadonlyMap<ForwardOutcomeSessionHorizon, PersistedForwardOutcomeRow>,
      episodeDirection: episode.direction,
    });
    return attachForwardOutcomesToComparableEpisode(episode, evidence);
  });
}

export function attachForwardOutcomesToComparableEpisode(
  episode: RepeatMoverComparableEpisode,
  evidence: RepeatMoverForwardOutcomeEvidence | null | undefined,
): RepeatMoverComparableEpisode {
  if (!evidence) return episode;
  const next = evidence.nextSession;
  return {
    ...episode,
    nextSessionMovePct: next?.nextSessionReturnPct ?? episode.nextSessionMovePct,
    nextSessionContinuation: next?.nextSessionContinuation ?? episode.nextSessionContinuation,
    observedForwardOutcomes: evidence,
  };
}
