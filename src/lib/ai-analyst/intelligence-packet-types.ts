import type { HistoricalWorkflowContext } from "@/lib/historical-workflow/historical-workflow-types";
import type { LateSessionContinuationContext } from "@/lib/am-inbox/late-session-continuation-types";
import type { HistoricalMatchSummary } from "@/lib/historical-intelligence/historical-match-summary";
import type { VolumeAccelerationState } from "@/config/scanner-intelligence-v2.config";
import type { CurrentCatalystAnalysis } from "@/lib/ai-analyst/current-catalyst";
import type { FreshCatalystDiscoveryMeta } from "@/lib/ai-analyst/catalyst-search-types";

export interface AnalystKeyLevels {
  vwap: number | null;
  hod: number | null;
  lod: number | null;
  priorClose: number | null;
  lastPrice: number | null;
  pmHigh: number | null;
  pmLow: number | null;
  source: "radar_v22_candidates" | "watchlist_analysis_v2" | "unavailable";
}

export interface AnalystRadarEventRow {
  eventType: string | null;
  eventAt: string | null;
  sessionKind: string | null;
  tradingDate: string | null;
}

export interface AnalystRadarSnapshot {
  available: boolean;
  symbol: string;
  tradingDate: string | null;
  sessionKind: string | null;
  lifecycle: string | null;
  radarEventLifecycle: string | null;
  promotionReason: string | null;
  primaryScannerEvent: string | null;
  primaryScannerEventAt: string | null;
  participationState: string | null;
  timeAdjustedRvol: number | null;
  rvol5m: number | null;
  volumeVelocity: number | null;
  volumeAccelerationPct: number | null;
  acceleration5m: number | null;
  distanceFromHodPct: number | null;
  volumeAccelerationState: VolumeAccelerationState | null;
  volumeVelocityRatio: number | null;
  keyLevels: AnalystKeyLevels;
  recentEvents: AnalystRadarEventRow[];
}

export interface AnalystWatchlistSnapshot {
  available: boolean;
  ticker: string;
  sessionDate: string | null;
  sessionType: string | null;
  direction: string | null;
  rvol: number | null;
  rvolClass: string | null;
  changePct: number | null;
  explanationExcerpt: string | null;
  keyLevels: Record<string, unknown> | null;
  marketSignals: Record<string, unknown> | null;
  failureReason: string | null;
}

export interface AnalystCatalystRow {
  eventType: string;
  eventDate: string | null;
  title: string | null;
  publishedAt: string | null;
  verificationState: string;
  sourceName?: string | null;
  sourceUrl?: string | null;
  officialSource?: boolean;
  evidenceOrigin?: "stocksist_catalyst" | "fresh_web_search";
  attributionClass?: "direct" | "provider_associated" | "sector_related" | "unverified";
  tickerSpecific?: boolean;
}

export interface AnalystJournalRow {
  symbol: string;
  side: string | null;
  status: string | null;
  setupTag: string | null;
  entryDate: string | null;
}

export interface AnalystIntelligencePacket {
  symbol: string;
  handoffSource: string | null;
  assembledAt: string;
  VERIFIED_FACTS: {
    symbol: string;
    handoffSource: string | null;
    workflowHandoff: HistoricalWorkflowContext | null;
    catalystRows: AnalystCatalystRow[];
    journalRows: AnalystJournalRow[];
    /** Set only when a claimed handoff event matches stored radar data. */
    confirmedScannerEvent: string | null;
  };
  HISTORICAL_EVIDENCE: {
    workflowSummary: {
      historicalContextAvailable: boolean;
      comparableEpisodeCount: number;
      mostRecentComparableDate: string | null;
      sampleSizeQuality: string | null;
      evidenceLabels: readonly string[];
      note: string;
    };
    /** Full episode detail lives in separate historicalMemory payload. */
    defersDetailedEpisodesToHistoricalMemory: true;
    historicalMatchSummary: HistoricalMatchSummary | null;
  };
  CURRENT_SESSION_EVIDENCE: {
    radar: AnalystRadarSnapshot;
    watchlist: AnalystWatchlistSnapshot;
    priorSessionContinuation: LateSessionContinuationContext[];
    temporalNote: string;
  };
  MODEL_INTERPRETATION: {
    responseStructure: string;
    dataHonesty: string;
    catalystAnswerMode?: "CURRENT_CATALYST_FIRST";
    catalystAnswerGuidance?: string;
    volumeLanguageRule?: string;
    personalizationRule?: string;
    noSpeculationRule?: string;
    freshDiscoveryAttempted?: boolean;
    freshDiscoverySucceeded?: boolean;
  };
  /** Present when the user asked a why-is-it-moving style question. */
  CURRENT_CATALYST_ANALYSIS?: CurrentCatalystAnalysis;
  FRESH_CATALYST_DISCOVERY?: FreshCatalystDiscoveryMeta;
  unavailable: {
    radar: boolean;
    watchlist: boolean;
    catalyst: boolean;
    continuation: boolean;
    keyLevels: boolean;
    historicalDetail: boolean;
  };
}
