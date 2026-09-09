// Canonical Catalyst Intelligence V1A types.
// Consumes already-normalized catalyst_events rows. Does not rewrite
// provider facts, event_type, or provider identity.

export const SCORING_VERSION = "catalyst_intelligence_v1a";

/** Processor/idempotency identity. Distinct from scoring_version. */
export const RULES_VERSION = "catalyst-intelligence-v1";

export type IntelligenceLifecycle =
  | "scheduled"
  | "developing"
  | "confirmed"
  | "outcome"
  | "stale";

export const INTELLIGENCE_LIFECYCLES: readonly IntelligenceLifecycle[] = [
  "scheduled",
  "developing",
  "confirmed",
  "outcome",
  "stale",
] as const;

export type CatalystClassification = "hard" | "emerging" | "context" | "commentary";

export const CATALYST_CLASSIFICATIONS: readonly CatalystClassification[] = [
  "hard",
  "emerging",
  "context",
  "commentary",
] as const;

export type CatalystDirection = "bullish" | "bearish" | "mixed" | "unknown";

export const CATALYST_DIRECTIONS: readonly CatalystDirection[] = [
  "bullish",
  "bearish",
  "mixed",
  "unknown",
] as const;

export type FactState = "provider_fact" | "derived" | "ai_interpretation";

export const FACT_STATES: readonly FactState[] = [
  "provider_fact",
  "derived",
  "ai_interpretation",
] as const;

export type KnownCatalystProvider =
  | "earnings_calendar"
  | "polygon"
  | "sec_edgar";

export const KNOWN_CATALYST_PROVIDERS: readonly KnownCatalystProvider[] = [
  "earnings_calendar",
  "polygon",
  "sec_edgar",
] as const;

export type AttributionClass =
  | "direct"
  | "provider_associated"
  | "sector_related"
  | "unverified";

/** Already-normalized catalyst row. No raw provider payload. */
export interface NormalizedCatalystInput {
  id?: string | null;
  dedupe_key: string;
  symbol: string;
  company_name?: string | null;
  event_type: string;
  verification_state?: string | null;
  event_date: string;
  event_time?: string | null;
  time_of_day?: string | null;
  title: string;
  description?: string | null;
  source_name: string;
  source_url?: string | null;
  provider: string;
  provider_article_id?: string | null;
  related_symbols?: string[];
  facts?: Record<string, unknown>;
  published_at?: string | null;
  created_at?: string | null;
}

export interface ScoreBreakdown {
  source_quality: number;
  ticker_specificity: number;
  materiality: number;
  freshness: number;
  confidence: number;
  catalyst_score: number;
}

export interface EvidenceItem {
  field: string;
  value: string | number | boolean | null;
  fact_state: FactState;
  source_url: string | null;
}

export interface EvidenceTrail {
  source_event_id: string | null;
  source_dedupe_key: string;
  provider: string;
  source_name: string;
  source_url: string | null;
  event_type: string;
  attribution_class: AttributionClass | null;
  ticker_specific: boolean;
  classification_reasons: string[];
  score_breakdown: ScoreBreakdown;
  items: EvidenceItem[];
  evidence_as_of: string | null;
  market_context_as_of: string | null;
}

export interface CatalystIntelligenceRecord {
  id: string;
  source_event_id: string | null;
  source_dedupe_key: string;
  symbol: string;
  classification: CatalystClassification;
  direction: CatalystDirection;
  fact_state: FactState;
  scores: ScoreBreakdown;
  provider: string;
  event_type: string;
  title: string;
  source_name: string;
  source_url: string | null;
  evidence: EvidenceTrail;
  scoring_version: string;
  rules_version: string;
  lifecycle: IntelligenceLifecycle;
  evidence_as_of: string | null;
  market_context_as_of: string | null;
  created_at: string;
}

export type AlertDeliveryStatus = "queued" | "suppressed" | "failed";

export interface AlertEvent {
  dedupeKey: string;
  intelligenceId: string;
  sourceEventDedupeKey: string;
  symbol: string;
  classification: CatalystClassification;
  direction: CatalystDirection;
  catalystScore: number;
  title: string;
  sourceUrl: string | null;
  sourceName: string;
  provider: string;
  factState: FactState;
  evidence: EvidenceTrail;
  createdAt: string;
  deliveryStatus: AlertDeliveryStatus;
  deliverySuppressedReason: string | null;
}

export interface NotificationRouteResult {
  attempted: boolean;
  delivered: boolean;
  reason: string;
  channels: {
    push: false;
    sms: false;
    email: false;
  };
}

export interface NotificationRouter {
  route(event: AlertEvent): NotificationRouteResult;
}

export type ProviderAdapterName = KnownCatalystProvider;

export interface ProviderAdapterResult {
  executed: false;
  reason: "PROVIDER_ADAPTERS_DISABLED_IN_V1";
  adapter: string;
}
