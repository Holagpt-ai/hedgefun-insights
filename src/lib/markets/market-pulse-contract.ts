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
