import { etSessionBounds } from "@/lib/historical-backfill/dates";
import type { MarketBehaviorEpisode } from "@/types/security-intelligence";

export interface EpisodeSessionContext {
  sessionDate: string;
  sessionOpenMs: number;
  sessionCloseMs: number;
  episodeStartMs: number;
  episodeEndMs: number;
}

export function episodeSessionDateFromEpisode(episode: MarketBehaviorEpisode): string | null {
  if (episode.episodeStart.length >= 10) {
    return episode.episodeStart.slice(0, 10);
  }
  return null;
}

export function buildEpisodeSessionContext(episode: MarketBehaviorEpisode): EpisodeSessionContext | null {
  const sessionDate = episodeSessionDateFromEpisode(episode);
  if (!sessionDate) return null;
  const bounds = etSessionBounds(sessionDate);
  if (!bounds) return null;
  const sessionOpenMs = Date.parse(bounds.open);
  const sessionCloseMs = Date.parse(bounds.close);
  const episodeStartMs = Date.parse(episode.episodeStart);
  if (!Number.isFinite(sessionOpenMs) || !Number.isFinite(sessionCloseMs) || !Number.isFinite(episodeStartMs)) {
    return null;
  }
  const episodeEndMs = episode.episodeEnd ? Date.parse(episode.episodeEnd) : sessionCloseMs;
  if (!Number.isFinite(episodeEndMs)) return null;
  return {
    sessionDate,
    sessionOpenMs,
    sessionCloseMs,
    episodeStartMs,
    episodeEndMs,
  };
}
