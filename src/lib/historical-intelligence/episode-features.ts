import type { RepeatMoverComparableEpisode } from "@/types/repeat-mover";
import type { EpisodeLinkedEventEvidence } from "@/lib/episode-event-linkage/episode-linked-event-evidence";

export interface HistoricalEpisodeFeatureSet {
  episodeId: string;
  symbol: string | null;
  sessionDate: string | null;
  setupCategory: string | null;
  gapPct: number | null;
  movePct: number | null;
  closePosition: number | null;
  sessionVolume: number | null;
  rvol: number | null;
  rvol5m: number | null;
  volumeVelocity: number | null;
  volumeAccelerationPct: number | null;
  vwapRelationship: string | null;
  hodProximityPct: number | null;
  floatTurnover: number | null;
  catalystType: string | null;
  catalystSummary: string | null;
  catalystEventAt: string | null;
  closeReturnPct: number | null;
  nextSessionReturnPct: number | null;
  d1ReturnPct: number | null;
  d5ReturnPct: number | null;
  maxFavorableExcursionPct: number | null;
  maxAdverseExcursionPct: number | null;
  continuation: boolean | null;
  dayTwoContinuation: boolean | null;
}

function firstLinkedEvent(
  events: readonly EpisodeLinkedEventEvidence[] | undefined,
): EpisodeLinkedEventEvidence | null {
  return events?.[0] ?? null;
}

function horizonReturn(
  episode: RepeatMoverComparableEpisode,
  horizon: "D1" | "D5",
): number | null {
  const outcomes = episode.observedForwardOutcomes?.closeToCloseReturnPct;
  if (!outcomes) return null;
  const hit = outcomes[horizon];
  return typeof hit === "number" && Number.isFinite(hit) ? hit : null;
}

/** Derive display features from persisted episode evidence only. */
export function episodeToFeatureSet(
  episode: RepeatMoverComparableEpisode,
  symbol: string | null,
): HistoricalEpisodeFeatureSet {
  const linked = firstLinkedEvent(episode.historicalEvents);
  const intraday = episode.observedIntradayReconstruction;
  const fwd = episode.observedForwardOutcomes;
  const nextObs = fwd?.nextSession;

  return {
    episodeId: episode.episodeId,
    symbol,
    sessionDate: episode.sessionDate,
    setupCategory: `${episode.tier}/${episode.direction}`,
    gapPct: null,
    movePct: episode.movePct,
    closePosition: episode.closePosition,
    sessionVolume: episode.volume,
    rvol: episode.rvol,
    rvol5m: null,
    volumeVelocity: null,
    volumeAccelerationPct: null,
    vwapRelationship: intraday?.vwapReclaimCount != null && intraday.vwapReclaimCount > 0
      ? "reclaim_observed"
      : null,
    hodProximityPct: intraday?.closeVsHodPct ?? null,
    floatTurnover: null,
    catalystType: linked?.eventType ?? null,
    catalystSummary: linked?.title ?? linked?.source ?? null,
    catalystEventAt: linked?.publishedAt ?? null,
    closeReturnPct: null,
    nextSessionReturnPct: episode.nextSessionMovePct ?? nextObs?.nextSessionReturnPct ?? null,
    d1ReturnPct: horizonReturn(episode, "D1"),
    d5ReturnPct: horizonReturn(episode, "D5"),
    maxFavorableExcursionPct: nextObs?.nextSessionHighExcursionPct ?? null,
    maxAdverseExcursionPct: nextObs?.nextSessionLowExcursionPct ?? null,
    continuation: episode.nextSessionContinuation ?? nextObs?.nextSessionContinuation ?? null,
    dayTwoContinuation: episode.nextSessionContinuation,
  };
}
