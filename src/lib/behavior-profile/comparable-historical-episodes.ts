import { behaviorProfileConfig, type BehaviorProfileConfig } from "@/config/behavior-profile.config";
import type { EpisodeDirection, EpisodeTier } from "@/config/security-intelligence.config";
import {
  buildEpisodeSessionMaps,
  closePosition,
  episodeMovePct,
  episodeSessionDate,
} from "@/lib/behavior-profile/build-security-behavior-profile";
import type { MarketBehaviorEpisode, SecurityDailyHistory } from "@/types/security-intelligence";
import type { SecurityId } from "@/types/security-identity";

export interface ComparableEpisodeContext {
  direction?: EpisodeDirection;
  movePct?: number | null;
  tier?: EpisodeTier;
  sessionDate?: string | null;
}

export interface ComparableEpisodeSimilarity {
  sameDirection: boolean;
  movePctDelta: number | null;
  sameTier: boolean;
}

export interface ComparableHistoricalEpisodeEvidence {
  episodeId: string;
  sessionDate: string | null;
  tier: EpisodeTier;
  direction: EpisodeDirection;
  movePct: number | null;
  rvol: number | null;
  volume: number | null;
  dollarVolume: number | null;
  closePosition: number | null;
  nextSessionMovePct: number | null;
  nextSessionContinuation: boolean | null;
  similarity: ComparableEpisodeSimilarity;
}

function isComparable(
  candidateMove: number | null,
  referenceMove: number | null,
  candidateDirection: EpisodeDirection,
  referenceDirection: EpisodeDirection,
  config: BehaviorProfileConfig,
): boolean {
  if (config.comparableRequireSameDirection && candidateDirection !== referenceDirection) return false;
  if (referenceMove === null || candidateMove === null) return false;
  return Math.abs(Math.abs(referenceMove) - Math.abs(candidateMove)) <= config.comparableMovePctTolerance;
}

export function getComparableHistoricalEpisodes(input: {
  securityId: SecurityId;
  dailyHistory: readonly SecurityDailyHistory[];
  episodes: readonly MarketBehaviorEpisode[];
  currentContext?: ComparableEpisodeContext;
  config?: Partial<BehaviorProfileConfig>;
  limit?: number;
}): ComparableHistoricalEpisodeEvidence[] {
  const config = behaviorProfileConfig(input.config);
  const limit = input.limit ?? 20;
  const dailyRows = [...input.dailyHistory]
    .filter((row) => row.securityId === input.securityId)
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));
  const episodeRows = [...input.episodes]
    .filter((row) => row.securityId === input.securityId)
    .sort((a, b) => a.episodeStart.localeCompare(b.episodeStart));
  const { openTimestampToDate, dailyByDate } = buildEpisodeSessionMaps(dailyRows);

  const referenceDirection = input.currentContext?.direction ?? null;
  const referenceMove = input.currentContext?.movePct ?? null;
  const referenceTier = input.currentContext?.tier ?? null;
  const referenceDate = input.currentContext?.sessionDate ?? null;

  const sessionIndex = new Map(dailyRows.map((row, index) => [row.sessionDate, index]));
  const results: ComparableHistoricalEpisodeEvidence[] = [];
  for (const episode of episodeRows) {
    const sessionDate = episodeSessionDate(episode, openTimestampToDate);
    if (referenceDate && sessionDate === referenceDate) continue;
    const move = episodeMovePct(episode, dailyByDate, sessionDate);
    if (referenceDirection !== null || referenceMove !== null) {
      if (!isComparable(
        move,
        referenceMove,
        episode.direction,
        referenceDirection ?? episode.direction,
        config,
      )) {
        continue;
      }
    }
    const daily = sessionDate ? dailyByDate.get(sessionDate) : undefined;
    const position = daily ? closePosition(daily) : null;
    let nextSessionMovePct: number | null = null;
    let nextSessionContinuation: boolean | null = null;
    if (sessionDate) {
      const index = sessionIndex.get(sessionDate);
      if (index !== undefined && index + 1 < dailyRows.length) {
        const nextDaily = dailyRows[index + 1];
        if (nextDaily.movePct !== null && Number.isFinite(nextDaily.movePct)) {
          nextSessionMovePct = nextDaily.movePct;
          if (episode.direction === "POSITIVE") {
            nextSessionContinuation = nextDaily.movePct >= config.continuationMinMovePct;
          } else if (episode.direction === "NEGATIVE") {
            nextSessionContinuation = nextDaily.movePct <= -config.continuationMinMovePct;
          }
        }
      }
    }
    results.push({
      episodeId: episode.episodeId,
      sessionDate,
      tier: episode.tier,
      direction: episode.direction,
      movePct: move,
      rvol: episode.rvol,
      volume: episode.volume,
      dollarVolume: episode.dollarVolume ?? daily?.dollarVolume ?? null,
      closePosition: position,
      nextSessionMovePct,
      nextSessionContinuation,
      similarity: {
        sameDirection: referenceDirection === null || episode.direction === referenceDirection,
        movePctDelta: referenceMove !== null && move !== null
          ? Math.abs(Math.abs(referenceMove) - Math.abs(move))
          : null,
        sameTier: referenceTier === null || episode.tier === referenceTier,
      },
    });
  }

  return results
    .sort((left, right) => {
      const leftDelta = left.similarity.movePctDelta;
      const rightDelta = right.similarity.movePctDelta;
      if (leftDelta !== null && rightDelta !== null && leftDelta !== rightDelta) {
        return leftDelta - rightDelta;
      }
      if (leftDelta === null && rightDelta !== null) return 1;
      if (leftDelta !== null && rightDelta === null) return -1;
      return (right.sessionDate ?? "").localeCompare(left.sessionDate ?? "");
    })
    .slice(0, limit);
}
