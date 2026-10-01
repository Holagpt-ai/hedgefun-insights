// Catalyst Intelligence Network contracts.
// Scores stay separate: evidence confidence, materiality, timing urgency,
// observed reaction, and priority are never collapsed into one AI score.

export const CATALYST_SOURCE_TYPES = [
  "SEC_FILINGS",
  "COMPANY_IR",
  "COMPANY_EVENTS",
  "NEWS_PR",
  "MARKET_REACTION",
] as const;
export type CatalystSourceType = (typeof CATALYST_SOURCE_TYPES)[number];

export const FEED_FORMATS = [
  "sec_atom",
  "rss",
  "atom",
  "json",
  "html",
  "jsonld",
  "ics",
  "sitemap",
  "auto",
] as const;
export type FeedFormat = (typeof FEED_FORMATS)[number];

export const INTEL_EVENT_TYPES = [
  "EARNINGS",
  "GUIDANCE",
  "SEC_FILING",
  "FINANCING",
  "DILUTION",
  "M_AND_A",
  "EXECUTIVE_CHANGE",
  "CONTRACT",
  "PARTNERSHIP",
  "PRODUCT_LAUNCH",
  "PRODUCT_STRATEGY_EVENT",
  "INVESTOR_EVENT",
  "CONFERENCE",
  "REGULATORY",
  "FDA_CLINICAL",
  "LEGAL",
  "ANALYST_ACTION",
  "CORPORATE_ACTION",
  "OTHER_MATERIAL_EVENT",
] as const;
export type IntelEventType = (typeof INTEL_EVENT_TYPES)[number];

export const LIFECYCLE_STATES = [
  "discovered",
  "scheduled",
  "approaching",
  "live",
  "announced",
  "reacting",
  "follow_through",
  "resolved",
  "invalidated",
] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

export const CATALYST_STATES = [
  "IMMEDIATE",
  "DEVELOPING",
  "UPCOMING",
  "WATCH",
  "INFORMATIONAL",
] as const;
export type CatalystState = (typeof CATALYST_STATES)[number];

export const VERIFICATION_STATES = [
  "VERIFIED_PRIMARY",
  "VERIFIED_MULTI_SOURCE",
  "REPORTED",
  "UNVERIFIED",
  "CONFLICTING",
  "INVALIDATED",
] as const;
export type VerificationState = (typeof VERIFICATION_STATES)[number];

export const EVIDENCE_TIERS = [
  "TIER_1_PRIMARY",
  "TIER_2_STRONG_SECONDARY",
  "TIER_3_DISCOVERY",
] as const;
export type EvidenceTier = (typeof EVIDENCE_TIERS)[number];

export const TICKER_RELATIONS = [
  "DIRECT",
  "PRIMARY",
  "SECONDARY",
  "SUPPLIER",
  "CUSTOMER",
  "COMPETITOR",
  "SECTOR",
  "MENTION",
] as const;
export type TickerRelation = (typeof TICKER_RELATIONS)[number];

export const TIMING_BUCKETS = [
  "immediate",
  "premarket",
  "regular_session",
  "after_hours",
  "next_session",
  "scheduled_future",
  "unknown",
] as const;
export type TimingBucket = (typeof TIMING_BUCKETS)[number];

export const REACTION_WINDOWS = [
  "m1",
  "m5",
  "m15",
  "m30",
  "session_end",
  "after_hours",
  "next_session",
  "multi_day",
  "point",
] as const;
export type ReactionWindow = (typeof REACTION_WINDOWS)[number];

export const BOT_IDS = ["sec", "ir", "events", "news", "reactions"] as const;
export type BotId = (typeof BOT_IDS)[number];

export const FIXTURE_MARKER = "x-stocksist-fixture";

export interface SourceRecord {
  id: string;
  sourceKey: string;
  companyName: string | null;
  ticker: string | null;
  cik: string | null;
  sourceType: CatalystSourceType;
  url: string;
  hostname: string;
  feedFormat: FeedFormat;
  pollIntervalSeconds: number;
  enabled: boolean;
  priority: number;
  evidenceTier: EvidenceTier;
  /** Independent publisher. Feed URL is not this identity. */
  authorityKey: string;
  lastSuccessAt: string | null;
  lastContentHash: string | null;
  lastEtag: string | null;
  lastModified: string | null;
  failureCount: number;
  backoffUntil: string | null;
  lastErrorCategory: string | null;
  metadata: Record<string, unknown>;
}

export interface BotConfig {
  bot: BotId;
  enabled: boolean;
  batchLimit: number;
  concurrency: number;
  pollIntervalSeconds: number;
}

export interface RawSourceItem {
  sourceId: string;
  sourceType: CatalystSourceType;
  externalId: string | null;
  canonicalUrl: string | null;
  publishedAt: string | null;
  discoveredAt: string;
  title: string | null;
  summary: string | null;
  contentHash: string;
  metadata: Record<string, unknown>;
}

export interface FetchState {
  unchanged: boolean;
  etag: string | null;
  lastModified: string | null;
  contentHash: string | null;
  checkpoint: Record<string, unknown> | null;
}

export interface CompanyRecord {
  ticker: string;
  name: string;
  aliases?: string[];
  cik?: string | null;
}

export interface SourceRunContext {
  now: Date;
  source: SourceRecord;
  userAgent: string;
  fetchImpl: typeof fetch;
  cikMap?: ReadonlyMap<string, string[]>;
  companies?: readonly CompanyRecord[];
  itemLimit: number;
  allowFixtures: boolean;
  fetchState: FetchState;
}

export interface NormalizedEventCandidate {
  raw: RawSourceItem;
  title: string;
  summary: string | null;
  suggestedType: IntelEventType | null;
  subtype: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  scheduledDate: string | null;
  isAnnouncement: boolean;
  evidenceTier: EvidenceTier;
  metadata: Record<string, unknown>;
}

export interface CanonicalEvent {
  id: string;
  canonicalKey: string;
  title: string;
  summary: string | null;
  announcementSummary: string | null;
  eventType: IntelEventType;
  eventSubtype: string | null;
  lifecycle: LifecycleState;
  catalystState: CatalystState;
  firstDiscoveredAt: string;
  sourcePublishedAt: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  scheduledDate: string | null;
  announcementAt: string | null;
  effectiveAt: string | null;
  timingBucket: TimingBucket;
  verificationState: VerificationState;
  evidenceConfidence: number;
  materiality: number;
  timingUrgency: number;
  reactionScore: number | null;
  priorityScore: number;
  attributionConfidence: number;
  distributionStatus: "observation" | "ready";
  lifecycleLog: LifecycleLogEntry[];
  scoreComponents: Record<string, unknown>;
  /** Row revision for optimistic concurrency (Supabase `updated_at`). */
  updatedAt?: string | null;
}

export interface LifecycleLogEntry {
  from: LifecycleState | null;
  to: LifecycleState;
  at: string;
  reason: string;
}

export interface RawItemRecord {
  id: string;
  sourceId: string;
  externalId: string | null;
  canonicalUrl: string | null;
  contentHash: string;
  publishedAt: string | null;
  discoveredAt: string;
  title: string | null;
  bodyExcerpt: string | null;
  metadata: Record<string, unknown>;
}

export interface EvidenceRecord {
  id: string;
  eventId: string;
  rawItemId: string;
  sourceId: string;
  authorityKey: string;
  evidenceTier: EvidenceTier;
  evidenceRole: "primary" | "secondary";
  canonicalUrl: string | null;
  contentHash: string;
  publishedAt: string | null;
  conflict: boolean;
}

export interface TickerLink {
  id: string;
  eventId: string;
  ticker: string;
  relation: TickerRelation;
  confidence: number;
  isPrimary: boolean;
  evidenceNote: string | null;
}

export interface ReactionRecord {
  id: string;
  eventId: string;
  windowKind: ReactionWindow;
  observedAt: string | null;
  availability: "available" | "unavailable" | "stale";
  referencePrice: number | null;
  currentPrice: number | null;
  percentMove: number | null;
  intradayHigh: number | null;
  intradayLow: number | null;
  volume: number | null;
  dollarVolume: number | null;
  rvol5m: number | null;
  timeAdjustedRvol: number | null;
  volumeVelocity: number | null;
  volumeAcceleration: number | null;
  vwap: number | null;
  vwapSide: string | null;
  hodDistancePct: number | null;
  lodDistancePct: number | null;
  floatTurnover: number | null;
  payload: Record<string, unknown>;
}

export interface SourceRunError {
  sourceId: string;
  category: string;
  statusCode: number | null;
  retryable: boolean;
  elapsedMs: number;
}

export interface RunTelemetry {
  runId: string;
  bot: BotId;
  startedAt: string;
  completedAt: string | null;
  sourcesAttempted: number;
  sourcesSuccessful: number;
  sourcesFailed: number;
  rawItemsSeen: number;
  newItems: number;
  duplicates: number;
  eventsCreated: number;
  eventsUpdated: number;
  eventsInvalidated: number;
  elapsedMs: number | null;
  status: "running" | "completed" | "disabled" | "failed";
  errors: SourceRunError[];
}

export type RawIngestDisposition = "inserted" | "existing_resumed" | "existing_linked";

export interface IngestOutcome {
  status: "created" | "updated" | "duplicate" | "unresolved" | "rejected";
  eventId: string | null;
  rawItemId: string | null;
  /** Set when a raw row was claimed; drives run new_items vs duplicates reporting. */
  rawDisposition?: RawIngestDisposition;
}

export interface MarketObservation {
  symbol: string;
  observedAt: string | null;
  freshness: "fresh" | "stale" | "unknown";
  referencePrice: number | null;
  currentPrice: number | null;
  intradayHigh: number | null;
  intradayLow: number | null;
  volume: number | null;
  dollarVolume: number | null;
  rvol5m: number | null;
  timeAdjustedRvol: number | null;
  volumeVelocity: number | null;
  volumeAcceleration: number | null;
  vwap: number | null;
  vwapSide: string | null;
  hodDistancePct: number | null;
  floatTurnover: number | null;
  payload?: Record<string, unknown>;
}

export interface DistributionRecord {
  eventId: string;
  ticker: string | null;
  title: string;
  summary: string | null;
  eventType: IntelEventType;
  lifecycle: LifecycleState;
  catalystState: CatalystState;
  scheduledAt: string | null;
  scheduledDate: string | null;
  verification: VerificationState;
  evidenceConfidence: number;
  materiality: number;
  timingUrgency: number;
  priority: number;
  reactionScore: number | null;
  reaction: ReactionRecord | null;
  evidenceSummary: {
    tier: EvidenceTier | null;
    sourceCount: number;
    primaryUrl: string | null;
  };
  distributionStatus: "observation" | "ready";
}
