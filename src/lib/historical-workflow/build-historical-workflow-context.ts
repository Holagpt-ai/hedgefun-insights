import type { RepeatMoverEvidenceLabel } from "@/config/repeat-mover.config";
import { deriveRepeatMoverProfileFreshness } from "@/lib/radar/radar-repeat-mover-freshness";
import type { RadarRepeatMoverCandidate } from "@/lib/radar/radar-repeat-movers-types";
import type {
  HistoricalWorkflowContext,
  HistoricalWorkflowSource,
} from "@/lib/historical-workflow/historical-workflow-types";
import { normalizeHandoffSymbol } from "@/lib/watchlist-v2/handoff";
import type { RepeatMoverContext } from "@/types/repeat-mover";
import type { SecurityId } from "@/types/security-identity";

export function unavailableHistoricalWorkflowContext(
  symbol: string,
  sourceSurface: HistoricalWorkflowSource = "unknown",
  securityId: SecurityId | null = null,
): HistoricalWorkflowContext {
  const normalized = normalizeHandoffSymbol(symbol) ?? symbol.trim().toUpperCase();
  return {
    securityId,
    symbol: normalized,
    historicalContextAvailable: false,
    evidenceLabels: [],
    sampleSizeQuality: null,
    comparableEpisodeCount: 0,
    mostRecentComparableDate: null,
    profileFreshness: "UNKNOWN",
    sourceSurface,
    handoffAt: new Date().toISOString(),
    contextAssembledAt: null,
  };
}

export function buildHistoricalWorkflowContext(input: {
  symbol: string;
  securityId?: SecurityId | null;
  sourceSurface: HistoricalWorkflowSource;
  repeatMoverContext?: RepeatMoverContext | null;
  candidate?: RadarRepeatMoverCandidate | null;
  nowMs?: number;
  handoffAt?: string;
}): HistoricalWorkflowContext {
  const symbol = normalizeHandoffSymbol(input.symbol) ?? input.symbol.trim().toUpperCase();
  const nowMs = input.nowMs ?? Date.now();
  const handoffAt = input.handoffAt ?? new Date(nowMs).toISOString();

  const context = input.repeatMoverContext ?? input.candidate?.historicalContext ?? null;
  if (context?.profile.profileAvailable) {
    const profile = context.profile;
    return {
      securityId: input.securityId ?? context.securityId ?? input.candidate?.securityId ?? null,
      symbol: context.currentSymbol ?? symbol,
      historicalContextAvailable: true,
      evidenceLabels: context.evidenceLabels,
      sampleSizeQuality: profile.sampleSizeQuality,
      comparableEpisodeCount: context.comparableHistory.comparableEpisodeCount,
      mostRecentComparableDate:
        context.comparableHistory.mostRecentComparableEpisode?.sessionDate ?? null,
      profileFreshness: deriveRepeatMoverProfileFreshness({ profile, nowMs }),
      sourceSurface: input.sourceSurface,
      handoffAt,
      contextAssembledAt: context.assembledAt ?? null,
    };
  }

  if (input.candidate) {
    return {
      securityId: input.candidate.securityId,
      symbol,
      historicalContextAvailable: input.candidate.qualification.qualifies,
      evidenceLabels: input.candidate.evidenceLabels,
      sampleSizeQuality: input.candidate.sampleSizeQuality,
      comparableEpisodeCount: input.candidate.comparableEpisodeCount,
      mostRecentComparableDate: input.candidate.mostRecentComparableDate,
      profileFreshness: input.candidate.profileFreshness,
      sourceSurface: input.sourceSurface,
      handoffAt,
      contextAssembledAt: input.candidate.profileComputedAt,
    };
  }

  return unavailableHistoricalWorkflowContext(symbol, input.sourceSurface, input.securityId ?? null);
}

export function mergeWorkflowSource(
  existing: HistoricalWorkflowContext,
  sourceSurface: HistoricalWorkflowSource,
): HistoricalWorkflowContext {
  return {
    ...existing,
    sourceSurface,
    handoffAt: new Date().toISOString(),
  };
}

export function workflowEvidenceSummary(labels: readonly RepeatMoverEvidenceLabel[]): string {
  return labels.length > 0 ? labels.join(", ") : "none";
}
