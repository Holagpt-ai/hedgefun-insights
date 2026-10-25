/** Minimal intel shapes for client-side distribution bridge tests. */

export type IntelEventType =
  | "EARNINGS"
  | "GUIDANCE"
  | "SEC_FILING"
  | "FINANCING"
  | "DILUTION"
  | "M_AND_A"
  | "EXECUTIVE_CHANGE"
  | "CONTRACT"
  | "PARTNERSHIP"
  | "PRODUCT_LAUNCH"
  | "PRODUCT_STRATEGY_EVENT"
  | "INVESTOR_EVENT"
  | "CONFERENCE"
  | "REGULATORY"
  | "FDA_CLINICAL"
  | "LEGAL"
  | "ANALYST_ACTION"
  | "CORPORATE_ACTION"
  | "OTHER_MATERIAL_EVENT";

export type LifecycleState =
  | "discovered"
  | "scheduled"
  | "approaching"
  | "live"
  | "announced"
  | "reacting"
  | "follow_through"
  | "resolved"
  | "invalidated";

export type VerificationState =
  | "VERIFIED_PRIMARY"
  | "VERIFIED_MULTI_SOURCE"
  | "REPORTED"
  | "UNVERIFIED"
  | "CONFLICTING"
  | "INVALIDATED";

export interface CanonicalEventLike {
  id: string;
  canonicalKey: string;
  title: string;
  summary: string | null;
  announcementSummary: string | null;
  eventType: IntelEventType;
  eventSubtype: string | null;
  lifecycle: LifecycleState;
  sourcePublishedAt: string | null;
  scheduledStartAt: string | null;
  scheduledDate: string | null;
  announcementAt: string | null;
  firstDiscoveredAt: string;
  verificationState: VerificationState;
  materiality: number;
  distributionStatus: "observation" | "ready";
}

export interface EvidenceRecordLike {
  evidenceRole: "primary" | "secondary";
  canonicalUrl: string | null;
  publishedAt: string | null;
  authorityKey: string;
  conflict: boolean;
}

export interface TickerLinkLike {
  ticker: string;
  isPrimary: boolean;
}
