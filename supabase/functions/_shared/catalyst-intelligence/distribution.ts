import type {
  CanonicalEvent,
  DistributionRecord,
  EvidenceRecord,
  ReactionRecord,
  TickerLink,
} from "./types.ts";

export function toDistributionRecord(
  event: CanonicalEvent,
  tickers: readonly TickerLink[],
  evidence: readonly EvidenceRecord[],
  reaction: ReactionRecord | null,
): DistributionRecord {
  const primary = tickers.find((row) => row.isPrimary) ?? null;
  const tiers = evidence.map((row) => row.evidenceTier);
  const topTier = tiers.includes("TIER_1_PRIMARY")
    ? "TIER_1_PRIMARY"
    : tiers.includes("TIER_2_STRONG_SECONDARY")
    ? "TIER_2_STRONG_SECONDARY"
    : tiers[0] ?? null;
  const primaryEvidence = evidence.find((row) => row.evidenceRole === "primary") ?? evidence[0] ?? null;
  return {
    eventId: event.id,
    ticker: primary?.ticker ?? null,
    title: event.title,
    summary: event.announcementSummary ?? event.summary,
    eventType: event.eventType,
    lifecycle: event.lifecycle,
    catalystState: event.catalystState,
    scheduledAt: event.scheduledStartAt,
    scheduledDate: event.scheduledDate,
    verification: event.verificationState,
    evidenceConfidence: event.evidenceConfidence,
    materiality: event.materiality,
    timingUrgency: event.timingUrgency,
    priority: event.priorityScore,
    reactionScore: event.reactionScore,
    reaction,
    evidenceSummary: {
      tier: topTier,
      sourceCount: new Set(evidence.map((row) => row.sourceId)).size,
      primaryUrl: primaryEvidence?.canonicalUrl ?? null,
    },
    distributionStatus: event.distributionStatus,
  };
}
