import type {
  DataFreshnessState,
  DataProvenanceState,
  DataQualityState,
} from "@/config/data-quality.config";
import type {
  BackfillJobState,
  CorporateEventType,
  EpisodeDirection,
  EpisodeEventType,
  EpisodeOrigin,
  EpisodeTier,
  EventRelationType,
  ForwardOutcomeHorizon,
  SecurityIntelligenceVersion,
} from "@/config/security-intelligence.config";
import type { SecurityId } from "@/types/security-identity";

export interface IntelligenceEvidence {
  source: string | null;
  sourceAsOf: string | null;
  fetchedAt: string | null;
  computedAt: string | null;
  quality: DataQualityState;
  freshness: DataFreshnessState;
  provenance: DataProvenanceState;
}

export interface SecurityDailyHistory extends IntelligenceEvidence {
  securityId: SecurityId;
  sessionDate: string;
  observedSymbol: string | null;
  exchange: string | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  dollarVolume: number | null;
  previousClose: number | null;
  movePct: number | null;
}

export interface MarketBehaviorEpisode extends IntelligenceEvidence {
  episodeId: string;
  securityId: SecurityId;
  episodeStart: string;
  episodeEnd: string | null;
  observedSymbol: string | null;
  direction: EpisodeDirection;
  tier: EpisodeTier;
  startPrice: number | null;
  highPrice: number | null;
  lowPrice: number | null;
  endPrice: number | null;
  maxPositiveMovePct: number | null;
  maxNegativeMovePct: number | null;
  volume: number | null;
  dollarVolume: number | null;
  rvol: number | null;
  floatTurnover: number | null;
  haltCount: number | null;
  closeStrength: number | null;
  detectedBy: string | null;
  origin: EpisodeOrigin;
  createdAt: string;
  updatedAt: string;
}

export interface CorporateEvent extends IntelligenceEvidence {
  eventId: string;
  securityId: SecurityId;
  observedSymbol: string | null;
  eventType: CorporateEventType;
  eventAt: string;
  title: string;
  summary: string | null;
  sourceUrl: string | null;
  providerEventId: string | null;
  accessionId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface EventReactionLink {
  linkId: string;
  eventId: string;
  episodeId: string;
  securityId: SecurityId;
  relationType: EventRelationType;
  timeDeltaSeconds: number | null;
  timeDeltaMinutes: number | null;
  confidence: number | null;
  evidence: string | null;
  provenance: DataProvenanceState;
  source: string | null;
  sourceAsOf: string | null;
  createdAt: string;
}

export interface ForwardOutcome extends IntelligenceEvidence {
  episodeId: string;
  horizon: ForwardOutcomeHorizon;
  referenceTimestamp: string | null;
  referencePrice: number | null;
  outcomePrice: number | null;
  returnPct: number | null;
  maxGainPct: number | null;
  maxDrawdownPct: number | null;
  highPrice: number | null;
  lowPrice: number | null;
  dataAvailable: boolean;
}

export interface SecurityEpisodeEvent {
  episodeEventId: string;
  episodeId: string;
  securityId: SecurityId;
  eventType: EpisodeEventType;
  eventAt: string;
  price: number | null;
  volume: number | null;
  metadata: Record<string, unknown> | null;
  provenance: DataProvenanceState;
  source: string | null;
  sourceAsOf: string | null;
  createdAt: string;
}

export interface SecurityBackfillJob {
  jobId: string;
  jobType: string;
  state: BackfillJobState;
  dateFrom: string;
  dateTo: string;
  cursorDate: string | null;
  cursorToken: string | null;
  processedCount: number;
  errorCount: number;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  metadata: Record<string, unknown> | null;
}

export interface IntelligenceWriteSuccess<T> {
  version: SecurityIntelligenceVersion;
  ok: true;
  record: T;
  /** True when an idempotent write found the same security/date facts already stored. */
  noop?: boolean;
}

export interface IntelligenceWriteFailure {
  version: SecurityIntelligenceVersion;
  ok: false;
  reason: string;
}

export type IntelligenceWriteResult<T> = IntelligenceWriteSuccess<T> | IntelligenceWriteFailure;
