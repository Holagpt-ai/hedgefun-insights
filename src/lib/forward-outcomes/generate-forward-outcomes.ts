import { FORWARD_OUTCOME_GENERATION_DEFAULTS } from "@/config/forward-outcomes.config";
import { computeForwardOutcomesForEpisode } from "@/lib/forward-outcomes/compute-forward-outcome";
import type { PersistedForwardOutcomeRow } from "@/lib/forward-outcomes/forward-outcome-types";
import {
  buildEpisodeSessionMaps,
  episodeSessionDate,
} from "@/lib/behavior-profile/build-security-behavior-profile";
import type {
  MarketBehaviorEpisode,
  SecurityDailyHistory,
} from "@/types/security-intelligence";
import type { SecurityId } from "@/types/security-identity";

export interface GenerateForwardOutcomesInput {
  securityId: SecurityId;
  dailyHistory: readonly SecurityDailyHistory[];
  episodes: readonly MarketBehaviorEpisode[];
  /** Only (re)compute rows missing or with stale computedAt vs this watermark. */
  existingKeys?: ReadonlySet<string>;
  computedAt?: string;
  limit?: number;
}

export function forwardOutcomeRowKey(episodeId: string, horizon: string): string {
  return `${episodeId}:${horizon}`;
}

export function generateForwardOutcomes(input: GenerateForwardOutcomesInput): {
  rows: PersistedForwardOutcomeRow[];
  skippedExisting: number;
} {
  const computedAt = input.computedAt ?? new Date().toISOString();
  const limit = input.limit ?? FORWARD_OUTCOME_GENERATION_DEFAULTS.batchEpisodeLimit;
  const existing = input.existingKeys ?? new Set<string>();

  const dailyRows = [...input.dailyHistory]
    .filter((row) => row.securityId === input.securityId)
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));
  const episodeRows = [...input.episodes]
    .filter((row) => row.securityId === input.securityId)
    .sort((a, b) => a.episodeStart.localeCompare(b.episodeStart))
    .slice(0, limit);

  const sortedSessionDates = dailyRows.map((row) => row.sessionDate);
  const { openTimestampToDate, dailyByDate } = buildEpisodeSessionMaps(dailyRows);

  const rows: PersistedForwardOutcomeRow[] = [];
  let skippedExisting = 0;

  for (const episode of episodeRows) {
    const sessionDate = episodeSessionDate(episode, openTimestampToDate);
    const episodeDaily = sessionDate ? dailyByDate.get(sessionDate) ?? null : null;
    const computed = computeForwardOutcomesForEpisode({
      episode,
      episodeSessionDate: sessionDate,
      episodeDaily,
      sortedSessionDates,
      dailyByDate,
    });

    for (const facts of computed) {
      const key = forwardOutcomeRowKey(episode.episodeId, facts.horizon);
      if (existing.has(key)) {
        skippedExisting += 1;
        continue;
      }
      rows.push({
        ...facts,
        episodeId: episode.episodeId,
        securityId: input.securityId,
        horizonKey: facts.horizon,
      });
    }
  }

  return { rows, skippedExisting };
}
