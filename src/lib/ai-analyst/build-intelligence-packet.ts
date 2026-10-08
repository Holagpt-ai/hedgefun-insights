import {
  AI_ANALYST_INTELLIGENCE_BOUNDS,
  AI_ANALYST_RESPONSE_STRUCTURE,
} from "@/config/ai-analyst-intelligence.config";
import { listStoredLateSessionHandoffs } from "@/lib/am-inbox/late-session-handoff-storage";
import type { HistoricalWorkflowContext } from "@/lib/historical-workflow/historical-workflow-types";
import { readHistoricalWorkflowContext } from "@/lib/historical-workflow/workflow-handoff-storage";
import { confirmStoredScannerEvent } from "@/lib/scanner-intelligence/confirmed-event";
import {
  buildCurrentSetupFromRadarCandidate,
  rankHistoricalMatches,
} from "@/lib/historical-intelligence/historical-match-engine";
import { summarizeHistoricalMatches } from "@/lib/historical-intelligence/historical-match-summary";
import {
  classifyVolumeAccelerationState,
  volumeVelocityRatio,
} from "@/lib/scanner-intelligence/volume-participation";
import { readPreloadedRepeatMoverContext } from "@/lib/historical-workflow/workflow-handoff-storage";
import { normalizeHandoffSymbol } from "@/lib/watchlist-v2/handoff";
import type {
  AnalystCatalystRow,
  AnalystIntelligencePacket,
  AnalystJournalRow,
  AnalystKeyLevels,
  AnalystRadarEventRow,
  AnalystRadarSnapshot,
  AnalystWatchlistSnapshot,
} from "@/lib/ai-analyst/intelligence-packet-types";
import { buildCurrentCatalystAnalysis } from "@/lib/ai-analyst/current-catalyst";
import { classifyCurrentCatalystIntent } from "@/lib/ai-analyst/current-catalyst-intent";
import {
  CURRENT_CATALYST_FORMATTING,
  CURRENT_CATALYST_INSTITUTIONAL_LANGUAGE,
  CURRENT_CATALYST_NO_SPECULATION,
  CURRENT_CATALYST_PERSONALIZATION,
} from "@/lib/ai-analyst/catalyst-response-rules";

export type RadarCandidateRow = {
  symbol: string;
  trading_date: string | null;
  session_kind: string | null;
  lifecycle: string | null;
  radar_event_lifecycle: string | null;
  promotion_reason: unknown;
  primary_scanner_event: string | null;
  primary_scanner_event_at: string | null;
  participation_state: string | null;
  time_adjusted_rvol: number | null;
  rvol_5m: number | null;
  volume_velocity: number | null;
  volume_acceleration_pct: number | null;
  acceleration_5m: number | null;
  distance_from_hod_pct: number | null;
  session_vwap: number | null;
  session_high: number | null;
  session_low: number | null;
  previous_close: number | null;
  last_price: number | null;
};

export type WatchlistAnalysisRow = {
  ticker: string;
  session_date: string | null;
  session_type: string | null;
  direction: string | null;
  rvol: number | null;
  rvol_class: string | null;
  change_pct: number | null;
  explanation: string | null;
  key_levels: unknown;
  market_signals: unknown;
  failure_reason: string | null;
};

function truncate(text: string | null | undefined, max: number): string | null {
  if (!text?.trim()) return null;
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function promotionReasonText(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "string") return truncate(raw, AI_ANALYST_INTELLIGENCE_BOUNDS.maxPromotionReasonChars);
  try {
    return truncate(JSON.stringify(raw), AI_ANALYST_INTELLIGENCE_BOUNDS.maxPromotionReasonChars);
  } catch {
    return null;
  }
}

function keyLevelsFromRadar(row: RadarCandidateRow | null): AnalystKeyLevels {
  if (!row) {
    return {
      vwap: null,
      hod: null,
      lod: null,
      priorClose: null,
      lastPrice: null,
      pmHigh: null,
      pmLow: null,
      source: "unavailable",
    };
  }
  const isPremarket = row.session_kind === "pre-market";
  return {
    vwap: row.session_vwap,
    hod: row.session_high,
    lod: row.session_low,
    priorClose: row.previous_close,
    lastPrice: row.last_price,
    pmHigh: isPremarket ? row.session_high : null,
    pmLow: isPremarket ? row.session_low : null,
    source: "radar_v22_candidates",
  };
}

function keyLevelsFromWatchlist(row: WatchlistAnalysisRow | null): AnalystKeyLevels | null {
  if (!row?.key_levels || typeof row.key_levels !== "object") return null;
  const kl = row.key_levels as Record<string, unknown>;
  const num = (k: string) => (typeof kl[k] === "number" ? kl[k] : null);
  return {
    vwap: num("vwap"),
    hod: num("hod") ?? num("session_high"),
    lod: num("lod") ?? num("session_low"),
    priorClose: num("prior_close") ?? num("previous_close"),
    lastPrice: num("last_price") ?? num("price"),
    pmHigh: num("pm_high"),
    pmLow: num("pm_low"),
    source: "watchlist_analysis_v2",
  };
}

export function buildRadarSnapshot(
  symbol: string,
  candidate: RadarCandidateRow | null,
  events: AnalystRadarEventRow[],
): AnalystRadarSnapshot {
  const boundedEvents = events.slice(0, AI_ANALYST_INTELLIGENCE_BOUNDS.maxRadarEvents);
  return {
    available: candidate != null,
    symbol,
    tradingDate: candidate?.trading_date ?? null,
    sessionKind: candidate?.session_kind ?? null,
    lifecycle: candidate?.lifecycle ?? null,
    radarEventLifecycle: candidate?.radar_event_lifecycle ?? null,
    promotionReason: promotionReasonText(candidate?.promotion_reason),
    primaryScannerEvent: candidate?.primary_scanner_event ?? null,
    primaryScannerEventAt: candidate?.primary_scanner_event_at ?? null,
    participationState: candidate?.participation_state ?? null,
    timeAdjustedRvol: candidate?.time_adjusted_rvol ?? null,
    rvol5m: candidate?.rvol_5m ?? null,
    volumeVelocity: candidate?.volume_velocity ?? null,
    volumeAccelerationPct: candidate?.volume_acceleration_pct ?? null,
    acceleration5m: candidate?.acceleration_5m ?? null,
    distanceFromHodPct: candidate?.distance_from_hod_pct ?? null,
    volumeAccelerationState: classifyVolumeAccelerationState(candidate?.volume_acceleration_pct),
    volumeVelocityRatio: volumeVelocityRatio({
      currentVelocity: candidate?.volume_velocity,
      volumeAccelerationPct: candidate?.volume_acceleration_pct,
    }),
    keyLevels: keyLevelsFromRadar(candidate),
    recentEvents: boundedEvents,
  };
}

export function buildWatchlistSnapshot(row: WatchlistAnalysisRow | null): AnalystWatchlistSnapshot {
  if (!row) {
    return {
      available: false,
      ticker: "",
      sessionDate: null,
      sessionType: null,
      direction: null,
      rvol: null,
      rvolClass: null,
      changePct: null,
      explanationExcerpt: null,
      keyLevels: null,
      marketSignals: null,
      failureReason: null,
    };
  }
  const kl = row.key_levels && typeof row.key_levels === "object"
    ? (row.key_levels as Record<string, unknown>)
    : null;
  const ms = row.market_signals && typeof row.market_signals === "object"
    ? (row.market_signals as Record<string, unknown>)
    : null;
  return {
    available: !row.failure_reason,
    ticker: row.ticker,
    sessionDate: row.session_date,
    sessionType: row.session_type,
    direction: row.direction,
    rvol: row.rvol,
    rvolClass: row.rvol_class,
    changePct: row.change_pct,
    explanationExcerpt: truncate(row.explanation, AI_ANALYST_INTELLIGENCE_BOUNDS.maxWatchlistExplanationChars),
    keyLevels: kl,
    marketSignals: ms,
    failureReason: row.failure_reason,
  };
}

export function lateSessionHandoffsForSymbol(symbol: string) {
  const normalized = normalizeHandoffSymbol(symbol) ?? symbol.trim().toUpperCase();
  return listStoredLateSessionHandoffs()
    .map((s) => s.context)
    .filter((c) => c.symbol.toUpperCase() === normalized)
    .slice(0, AI_ANALYST_INTELLIGENCE_BOUNDS.maxLateSessionHandoffs);
}

export function mergeKeyLevels(
  radar: AnalystKeyLevels,
  watchlist: WatchlistAnalysisRow | null,
): AnalystKeyLevels {
  const fromWl = keyLevelsFromWatchlist(watchlist);
  if (radar.source !== "unavailable") return radar;
  return fromWl ?? radar;
}

export function buildAnalystIntelligencePacket(input: {
  symbol: string;
  handoffSource?: string | null;
  workflow?: HistoricalWorkflowContext | null;
  radarCandidate?: RadarCandidateRow | null;
  radarEvents?: AnalystRadarEventRow[];
  watchlistRow?: WatchlistAnalysisRow | null;
  catalystRows?: AnalystCatalystRow[];
  journalRows?: AnalystJournalRow[];
  nowIso?: string;
  claimedEvent?: string | null;
  userQuestion?: string | null;
}): AnalystIntelligencePacket {
  const symbol = normalizeHandoffSymbol(input.symbol) ?? input.symbol.trim().toUpperCase();
  const workflow = input.workflow ?? readHistoricalWorkflowContext(symbol);
  const catalystRows = (input.catalystRows ?? []).slice(0, AI_ANALYST_INTELLIGENCE_BOUNDS.maxCatalystRows);
  const journalRows = (input.journalRows ?? []).slice(0, AI_ANALYST_INTELLIGENCE_BOUNDS.maxJournalTrades);
  const radar = buildRadarSnapshot(symbol, input.radarCandidate ?? null, input.radarEvents ?? []);
  radar.keyLevels = mergeKeyLevels(radar.keyLevels, input.watchlistRow ?? null);
  const watchlist = buildWatchlistSnapshot(input.watchlistRow ?? null);
  if (watchlist.ticker === "") watchlist.ticker = symbol;
  const continuation = lateSessionHandoffsForSymbol(symbol);
  const confirmedScannerEvent = confirmStoredScannerEvent(input.claimedEvent, [
    radar.primaryScannerEvent,
    ...radar.recentEvents.map((row) => row.eventType),
  ]);

  const catalystIntent = classifyCurrentCatalystIntent(input.userQuestion ?? "");
  const movementQuestion = catalystIntent.movementQuestion;

  const repeatMoverContext = readPreloadedRepeatMoverContext(symbol);
  const historicalMatchSummary =
    !movementQuestion && repeatMoverContext && input.radarCandidate
      ? summarizeHistoricalMatches(
          rankHistoricalMatches(
            buildCurrentSetupFromRadarCandidate(input.radarCandidate),
            repeatMoverContext,
          ),
        )
      : null;

  const keyLevelsMissing =
    radar.keyLevels.source === "unavailable" ||
    (radar.keyLevels.vwap == null && radar.keyLevels.hod == null && radar.keyLevels.lod == null);

  const currentCatalystAnalysis = movementQuestion
    ? buildCurrentCatalystAnalysis(symbol, catalystRows)
    : undefined;
  const journalForPacket = movementQuestion ? [] : journalRows;

  return {
    symbol,
    handoffSource: input.handoffSource ?? workflow?.sourceSurface ?? null,
    assembledAt: input.nowIso ?? new Date().toISOString(),
    VERIFIED_FACTS: {
      symbol,
      handoffSource: input.handoffSource ?? workflow?.sourceSurface ?? null,
      workflowHandoff: workflow,
      catalystRows,
      journalRows: journalForPacket,
      confirmedScannerEvent,
    },
    HISTORICAL_EVIDENCE: {
      workflowSummary: {
        historicalContextAvailable: workflow?.historicalContextAvailable ?? false,
        comparableEpisodeCount: workflow?.comparableEpisodeCount ?? 0,
        mostRecentComparableDate: workflow?.mostRecentComparableDate ?? null,
        sampleSizeQuality: workflow?.sampleSizeQuality ?? null,
        evidenceLabels: [...(workflow?.evidenceLabels ?? [])],
        note: "Episode-level detail, forward outcomes, linked catalysts, and intraday reconstruction are in historicalMemory when contextLoaded=true.",
      },
      defersDetailedEpisodesToHistoricalMemory: true,
      historicalMatchSummary,
    },
    CURRENT_SESSION_EVIDENCE: {
      radar,
      watchlist,
      priorSessionContinuation: continuation,
      temporalNote:
        "priorSessionContinuation describes prior-session / day-two handoff evidence, not live price action. "
        + "radar and watchlist blocks describe the current or last-completed Stocksist session snapshot.",
    },
    MODEL_INTERPRETATION: {
      responseStructure: movementQuestion
        ? currentCatalystAnalysis?.responseSections
          ?? "PRIMARY CATALYST / KEY DETAILS / WHY MARKET CARES / SECONDARY CONTEXT / MARKET CONFIRMATION / CONFIDENCE."
        : AI_ANALYST_RESPONSE_STRUCTURE,
      dataHonesty:
        "Null fields and available=false mean unavailable verified data. Do not substitute estimates or generic market commentary. confirmedScannerEvent is included only when a claimed handoff event matches stored radar data.",
      ...(movementQuestion && currentCatalystAnalysis
        ? {
          catalystAnswerMode: "CURRENT_CATALYST_FIRST" as const,
          catalystAnswerGuidance: currentCatalystAnalysis.answerGuidance,
          volumeLanguageRule: currentCatalystAnalysis.volumeLanguageRule,
          institutionalLanguageRule: currentCatalystAnalysis.institutionalLanguageRule,
          personalizationRule: currentCatalystAnalysis.personalizationRule,
          formattingRule: CURRENT_CATALYST_FORMATTING,
          noSpeculationRule: CURRENT_CATALYST_NO_SPECULATION,
          verifiedVsInferredGuidance: currentCatalystAnalysis.verifiedVsInferredGuidance,
        }
        : {}),
    },
    ...(currentCatalystAnalysis ? { CURRENT_CATALYST_ANALYSIS: currentCatalystAnalysis } : {}),
    unavailable: {
      radar: !radar.available,
      watchlist: !watchlist.available,
      catalyst: catalystRows.length === 0,
      continuation: continuation.length === 0,
      keyLevels: keyLevelsMissing,
      historicalDetail: !(workflow?.historicalContextAvailable ?? false),
    },
  };
}

export function serializeAnalystIntelligencePacket(packet: AnalystIntelligencePacket): string {
  const json = JSON.stringify(packet);
  return json.slice(0, AI_ANALYST_INTELLIGENCE_BOUNDS.maxSerializedChars);
}

export function assertNoFabricatedPredictionFields(packet: AnalystIntelligencePacket): void {
  const json = JSON.stringify(packet).toLowerCase();
  for (const forbidden of ["\"winrate\"", "\"expectedmove\"", "\"probability\""]) {
    if (json.includes(forbidden)) {
      throw new Error(`intelligence packet must not include fabricated field ${forbidden}`);
    }
  }
}
