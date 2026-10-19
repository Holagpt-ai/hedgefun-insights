/**
 * Provider-neutral Market Pulse presentation contract (AI-ready, explanation disabled in Batch 22).
 */

export type MarketPulseDirection = "up" | "down";

export type MarketPulseAiVerificationState = "disabled" | "unverified" | "verified";

export type MarketPulseSessionEvidence =
  | "current_session"
  | "prior_session_historical"
  | "mixed_evidence"
  | "partially_unverified"
  | "unverified"
  | "delayed_snapshot";

/** Verified price change vs documented catalyst vs no linked catalyst evidence. */
export type MarketPulseMovementContext =
  | "verified_movement_with_event"
  | "verified_movement_unexplained";

export interface MarketPulseVerifiedCatalyst {
  label: "Verified event";
  eventId: string;
  title: string;
  sourceName: string;
  sourceUrl: string | null;
  eventDate: string;
  publishedAt: string | null;
  eventTimingLine: string | null;
  catalystPath: string;
  /** Always false in Batch 23 — causation requires separate authoritative evidence. */
  causationEstablished: false;
}

/** Optional AI fields remain null/disabled until a grounded enrichment service is approved. */
export interface MarketPulseIntelligenceRecord {
  symbol: string;
  name: string;
  direction: MarketPulseDirection;
  changePercent: number;
  price: number;
  volume: number | null;
  movementLabel: string;
  observationLine: string | null;
  observationTimeUnavailable: boolean;
  sessionEvidence: MarketPulseSessionEvidence;
  eventIdentity: string;
  stockDetailPath: string;
  movementContext: MarketPulseMovementContext;
  verifiedCatalyst: MarketPulseVerifiedCatalyst | null;
  /** Deprecated for Batch 23 homepage — catalyst records replace market_news headline matching. */
  relatedHeadline: MarketPulseRelatedHeadline | null;
  catalystEvidenceUrl: string | null;
  catalystEvidenceAt: string | null;
  aiExplanationText: null;
  aiVerificationState: MarketPulseAiVerificationState;
  observationFreshnessMs: number | null;
}

export interface MarketPulseRelatedHeadline {
  headline: string;
  source: string | null;
  url: string;
  publishedAt: string;
  /** Neutral copy only — not causation. */
  label: "Related headline";
}

export interface MarketPulsePanelModel {
  items: MarketPulseIntelligenceRecord[];
  sessionLine: string | null;
  observationLine: string | null;
  universeDisclosure: string;
  delayDisclosure: string;
  status: "loading" | "error" | "empty" | "ready";
  isPriorSessionPanel: boolean;
}
