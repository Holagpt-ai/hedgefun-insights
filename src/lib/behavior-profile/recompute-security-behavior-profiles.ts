import type {
  BehaviorProfileCandidate,
  BehaviorProfileRepository,
} from "@/lib/behavior-profile/behavior-profile-repository";
import {
  profileNeedsRecompute,
  recomputeSecurityBehaviorProfile,
  type BehaviorProfileSourceReader,
} from "@/lib/behavior-profile/recompute-behavior-profile";
import type { SecurityId } from "@/types/security-identity";

export const BEHAVIOR_PROFILE_DEFAULT_BATCH_SIZE = 50;

export interface RecomputeSecurityBehaviorProfilesInput {
  profiles: BehaviorProfileRepository;
  source: BehaviorProfileSourceReader;
  afterSecurityId?: SecurityId | null;
  batchSize?: number;
  force?: boolean;
  computedAt?: string;
}

export interface RecomputeSecurityBehaviorProfilesResult {
  processed: number;
  recomputed: number;
  skipped: number;
  done: boolean;
  nextAfterSecurityId: SecurityId | null;
  lastSecurityId: SecurityId | null;
}

function shouldRecompute(candidate: BehaviorProfileCandidate, force: boolean): boolean {
  return profileNeedsRecompute({
    candidateMaxHistoryDate: candidate.maxHistoryDate,
    candidateMaxEpisodeDate: candidate.maxEpisodeDate,
    storedLatestHistoryDate: candidate.profileLatestHistoryDate,
    storedLatestEpisodeDate: candidate.profileLatestEpisodeDate,
    storedProfileVersion: candidate.profileVersion,
    candidateForwardOutcomeD1Count: candidate.forwardOutcomeD1Count,
    candidateForwardOutcomeD5Count: candidate.forwardOutcomeD5Count,
    storedForwardOutcomeD1Count: candidate.profileForwardOutcomeD1Count,
    storedForwardOutcomeD5Count: candidate.profileForwardOutcomeD5Count,
    force,
  });
}

export async function recomputeSecurityBehaviorProfiles(
  input: RecomputeSecurityBehaviorProfilesInput,
): Promise<RecomputeSecurityBehaviorProfilesResult> {
  const batchSize = Math.min(Math.max(input.batchSize ?? BEHAVIOR_PROFILE_DEFAULT_BATCH_SIZE, 1), 500);
  const afterSecurityId = input.afterSecurityId ?? null;
  const candidates = await input.profiles.listRecomputeCandidates(afterSecurityId, batchSize);
  if (candidates.length === 0) {
    return {
      processed: 0,
      recomputed: 0,
      skipped: 0,
      done: true,
      nextAfterSecurityId: null,
      lastSecurityId: afterSecurityId,
    };
  }

  let recomputed = 0;
  let skipped = 0;
  let lastSecurityId: SecurityId | null = null;
  for (const candidate of candidates) {
    lastSecurityId = candidate.securityId;
    if (!shouldRecompute(candidate, input.force === true)) {
      skipped += 1;
      continue;
    }
    await recomputeSecurityBehaviorProfile({
      securityId: candidate.securityId,
      profiles: input.profiles,
      source: input.source,
      computedAt: input.computedAt,
    });
    recomputed += 1;
  }

  const done = candidates.length < batchSize;
  return {
    processed: candidates.length,
    recomputed,
    skipped,
    done,
    nextAfterSecurityId: done ? null : lastSecurityId,
    lastSecurityId,
  };
}
