import { BEHAVIOR_PROFILE_VERSION } from "@/config/behavior-profile.config";
import type { BehaviorProfileRepository } from "@/lib/behavior-profile/behavior-profile-repository";
import { buildSecurityBehaviorProfile } from "@/lib/behavior-profile/build-security-behavior-profile";
import type { MarketBehaviorEpisode, SecurityDailyHistory } from "@/types/security-intelligence";
import type { SecurityId } from "@/types/security-identity";

export interface BehaviorProfileSourceReader {
  listDailyHistory(securityId: SecurityId): Promise<readonly SecurityDailyHistory[]>;
  listEpisodes(securityId: SecurityId): Promise<readonly MarketBehaviorEpisode[]>;
}

export function profileNeedsRecompute(input: {
  candidateMaxHistoryDate: string | null;
  candidateMaxEpisodeDate: string | null;
  storedLatestHistoryDate: string | null;
  storedLatestEpisodeDate: string | null;
  storedProfileVersion: string | null;
  candidateForwardOutcomeD1Count?: number | null;
  candidateForwardOutcomeD5Count?: number | null;
  storedForwardOutcomeD1Count?: number | null;
  storedForwardOutcomeD5Count?: number | null;
  force?: boolean;
}): boolean {
  if (input.force) return true;
  if (input.storedProfileVersion !== BEHAVIOR_PROFILE_VERSION) return true;
  if (input.candidateMaxHistoryDate && input.storedLatestHistoryDate !== input.candidateMaxHistoryDate) return true;
  if (input.candidateMaxEpisodeDate && input.storedLatestEpisodeDate !== input.candidateMaxEpisodeDate) return true;
  if (!input.storedLatestHistoryDate && input.candidateMaxHistoryDate) return true;
  if (
    input.candidateForwardOutcomeD1Count != null
    && input.storedForwardOutcomeD1Count != null
    && input.candidateForwardOutcomeD1Count !== input.storedForwardOutcomeD1Count
  ) {
    return true;
  }
  if (
    input.candidateForwardOutcomeD5Count != null
    && input.storedForwardOutcomeD5Count != null
    && input.candidateForwardOutcomeD5Count !== input.storedForwardOutcomeD5Count
  ) {
    return true;
  }
  if (
    input.candidateForwardOutcomeD1Count != null
    && input.storedForwardOutcomeD1Count == null
    && input.candidateForwardOutcomeD1Count > 0
  ) {
    return true;
  }
  return false;
}

export async function recomputeSecurityBehaviorProfile(input: {
  securityId: SecurityId;
  profiles: BehaviorProfileRepository;
  source: BehaviorProfileSourceReader;
  computedAt?: string;
}): Promise<{ profile: ReturnType<typeof buildSecurityBehaviorProfile>; upserted: true }> {
  const computedAt = input.computedAt ?? new Date().toISOString();
  const [dailyHistory, episodes, forwardOutcomeAggregate] = await Promise.all([
    input.source.listDailyHistory(input.securityId),
    input.source.listEpisodes(input.securityId),
    input.profiles.getForwardOutcomeAggregate(input.securityId),
  ]);
  const profile = buildSecurityBehaviorProfile({
    securityId: input.securityId,
    dailyHistory,
    episodes,
    computedAt,
    forwardOutcomeAggregate,
  });
  await input.profiles.upsertSecurityBehaviorProfile(profile);
  return { profile, upserted: true };
}
