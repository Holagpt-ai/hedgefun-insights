import { AI_ANALYST_HISTORICAL_MEMORY_BOUNDS } from "@/config/ai-analyst-historical.config";
import { FORWARD_OUTCOME_SESSION_HORIZONS } from "@/config/forward-outcomes.config";
import { INTRADAY_COMPLETENESS_STATES } from "@/config/intraday-reconstruction.config";
import {
  REPEAT_MOVER_EVIDENCE_LABELS,
  REPEAT_MOVER_VERSION,
} from "@/config/repeat-mover.config";
import type { RepeatMoverEvidenceLabel } from "@/config/repeat-mover.config";
import { EPISODE_TEMPORAL_RELATIONSHIPS } from "@/config/episode-event-linkage.config";
import { CORPORATE_EVENT_TYPES } from "@/config/security-intelligence.config";
import type { EpisodeLinkedEventEvidence } from "@/lib/episode-event-linkage/episode-linked-event-evidence";
import type { RepeatMoverForwardOutcomeEvidence } from "@/lib/forward-outcomes/forward-outcome-types";
import type { RepeatMoverIntradayEvidence } from "@/lib/intraday-reconstruction/intraday-reconstruction-types";
import type {
  RepeatMoverComparableEpisode,
  RepeatMoverComparableHistory,
  RepeatMoverContext,
  RepeatMoverProfileSnapshot,
} from "@/types/repeat-mover";
import { unavailableRepeatMoverProfileSnapshot } from "@/lib/repeat-movers/get-repeat-mover-context";

const CORPORATE_EVENT_TYPE_SET = new Set<string>(CORPORATE_EVENT_TYPES);
const TEMPORAL_RELATIONSHIP_SET = new Set<string>(EPISODE_TEMPORAL_RELATIONSHIPS);
const INTRADAY_COMPLETENESS_SET = new Set<string>(INTRADAY_COMPLETENESS_STATES);
const FORWARD_HORIZONS = FORWARD_OUTCOME_SESSION_HORIZONS.map((row) => row.horizon);

function finiteOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function coerceProfile(raw: unknown): RepeatMoverProfileSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.profileAvailable !== "boolean") return null;
  const base = unavailableRepeatMoverProfileSnapshot();
  return {
    ...base,
    profileAvailable: p.profileAvailable,
    sampleSizeQuality:
      typeof p.sampleSizeQuality === "string" ? p.sampleSizeQuality as RepeatMoverProfileSnapshot["sampleSizeQuality"] : null,
    sessionsObserved: finiteOrNull(p.sessionsObserved),
    episodeCount: finiteOrNull(p.episodeCount),
    historyStartDate: typeof p.historyStartDate === "string" ? p.historyStartDate : null,
    historyEndDate: typeof p.historyEndDate === "string" ? p.historyEndDate : null,
    computedAt: typeof p.computedAt === "string" ? p.computedAt : null,
    latestSourceHistoryDate: typeof p.latestSourceHistoryDate === "string" ? p.latestSourceHistoryDate : null,
    sourceDailyRowCount: finiteOrNull(p.sourceDailyRowCount),
    sourceEpisodeCount: finiteOrNull(p.sourceEpisodeCount),
  };
}

function coerceHorizonNumberMap(
  raw: unknown,
): Partial<Record<(typeof FORWARD_HORIZONS)[number], number | null>> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const mapped: Partial<Record<(typeof FORWARD_HORIZONS)[number], number | null>> = {};
  let hasField = false;
  for (const horizon of FORWARD_HORIZONS) {
    if (!(horizon in source)) continue;
    hasField = true;
    mapped[horizon] = finiteOrNull(source[horizon]);
  }
  return hasField ? mapped : null;
}

function coerceObservedForwardOutcomes(raw: unknown): RepeatMoverForwardOutcomeEvidence | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, unknown>;
  const closeToCloseReturnPct = coerceHorizonNumberMap(source.closeToCloseReturnPct);
  const highExcursionPct = coerceHorizonNumberMap(source.highExcursionPct);
  const lowExcursionPct = coerceHorizonNumberMap(source.lowExcursionPct);
  const closePosition = coerceHorizonNumberMap(source.closePosition);

  let nextSession: RepeatMoverForwardOutcomeEvidence["nextSession"] = null;
  const nextRaw = source.nextSession;
  if (nextRaw && typeof nextRaw === "object" && !Array.isArray(nextRaw)) {
    const n = nextRaw as Record<string, unknown>;
    if (typeof n.nextSessionAvailable === "boolean") {
      nextSession = {
        nextSessionAvailable: n.nextSessionAvailable,
        nextSessionReturnPct: finiteOrNull(n.nextSessionReturnPct),
        nextSessionHighExcursionPct: finiteOrNull(n.nextSessionHighExcursionPct),
        nextSessionLowExcursionPct: finiteOrNull(n.nextSessionLowExcursionPct),
        nextSessionClosePosition: finiteOrNull(n.nextSessionClosePosition),
        nextSessionVolume: finiteOrNull(n.nextSessionVolume),
        nextSessionRvol: finiteOrNull(n.nextSessionRvol),
        nextSessionContinuation:
          typeof n.nextSessionContinuation === "boolean" ? n.nextSessionContinuation : null,
        episodeDirection:
          n.episodeDirection === "POSITIVE" || n.episodeDirection === "NEGATIVE" || n.episodeDirection === "MIXED"
            ? n.episodeDirection
            : null,
      };
    }
  }

  if (!closeToCloseReturnPct && !highExcursionPct && !lowExcursionPct && !closePosition && !nextSession) {
    return undefined;
  }

  return {
    closeToCloseReturnPct: closeToCloseReturnPct ?? {},
    highExcursionPct: highExcursionPct ?? {},
    lowExcursionPct: lowExcursionPct ?? {},
    closePosition: closePosition ?? {},
    nextSession,
  };
}

function coerceHistoricalEvent(raw: unknown): EpisodeLinkedEventEvidence | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.eventType !== "string" || !CORPORATE_EVENT_TYPE_SET.has(e.eventType)) return null;
  if (typeof e.title !== "string" || e.title.trim().length === 0) return null;
  if (typeof e.temporalRelationship !== "string" || !TEMPORAL_RELATIONSHIP_SET.has(e.temporalRelationship)) {
    return null;
  }
  return {
    eventType: e.eventType as EpisodeLinkedEventEvidence["eventType"],
    title: e.title.trim(),
    publishedAt: typeof e.publishedAt === "string" ? e.publishedAt : null,
    temporalRelationship: e.temporalRelationship as EpisodeLinkedEventEvidence["temporalRelationship"],
    source: typeof e.source === "string" ? e.source : null,
  };
}

function coerceHistoricalEvents(raw: unknown): EpisodeLinkedEventEvidence[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const max = AI_ANALYST_HISTORICAL_MEMORY_BOUNDS.maxEventsPerComparableEpisode;
  const events = raw
    .slice(0, max)
    .map(coerceHistoricalEvent)
    .filter((event): event is EpisodeLinkedEventEvidence => event !== null);
  return events.length > 0 ? events : undefined;
}

function coerceObservedIntradayReconstruction(raw: unknown): RepeatMoverIntradayEvidence | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, unknown>;
  if (typeof source.completenessState !== "string"
    || !INTRADAY_COMPLETENESS_SET.has(source.completenessState)) {
    return undefined;
  }
  return {
    completenessState: source.completenessState as RepeatMoverIntradayEvidence["completenessState"],
    hodAt: typeof source.hodAt === "string" ? source.hodAt : null,
    closeVsHodPct: finiteOrNull(source.closeVsHodPct),
    largestPullbackPct: finiteOrNull(source.largestPullbackPct),
    recoveredFromPullback:
      typeof source.recoveredFromPullback === "boolean" ? source.recoveredFromPullback : null,
    haltCount: finiteOrNull(source.haltCount),
    vwapReclaimCount: finiteOrNull(source.vwapReclaimCount),
    largestVolumeBurstAt: typeof source.largestVolumeBurstAt === "string" ? source.largestVolumeBurstAt : null,
  };
}

function coerceComparableEpisode(raw: unknown): RepeatMoverComparableEpisode | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.episodeId !== "string" || !e.episodeId) return null;
  const tier = e.tier;
  const direction = e.direction;
  if (typeof tier !== "string" || typeof direction !== "string") return null;

  const observedForwardOutcomes = coerceObservedForwardOutcomes(e.observedForwardOutcomes);
  const historicalEvents = coerceHistoricalEvents(e.historicalEvents);
  const observedIntradayReconstruction = coerceObservedIntradayReconstruction(
    e.observedIntradayReconstruction,
  );

  return {
    episodeId: e.episodeId,
    sessionDate: typeof e.sessionDate === "string" ? e.sessionDate : null,
    tier: tier as RepeatMoverComparableEpisode["tier"],
    direction: direction as RepeatMoverComparableEpisode["direction"],
    movePct: finiteOrNull(e.movePct),
    volume: finiteOrNull(e.volume),
    rvol: finiteOrNull(e.rvol),
    dollarVolume: finiteOrNull(e.dollarVolume),
    closePosition: finiteOrNull(e.closePosition),
    nextSessionMovePct: finiteOrNull(e.nextSessionMovePct),
    nextSessionContinuation:
      typeof e.nextSessionContinuation === "boolean" ? e.nextSessionContinuation : null,
    ...(observedForwardOutcomes ? { observedForwardOutcomes } : {}),
    ...(historicalEvents ? { historicalEvents } : {}),
    ...(observedIntradayReconstruction ? { observedIntradayReconstruction } : {}),
    similarity: {
      sameDirection: Boolean((e.similarity as Record<string, unknown> | undefined)?.sameDirection),
      sameTier: Boolean((e.similarity as Record<string, unknown> | undefined)?.sameTier),
      movePctDelta: finiteOrNull((e.similarity as Record<string, unknown> | undefined)?.movePctDelta),
    },
  };
}

function coerceComparableHistory(raw: unknown): RepeatMoverComparableHistory {
  if (!raw || typeof raw !== "object") {
    return {
      comparableEpisodeCount: 0,
      closestComparableEpisodes: [],
      mostRecentComparableEpisode: null,
    };
  }
  const h = raw as Record<string, unknown>;
  const closest = Array.isArray(h.closestComparableEpisodes)
    ? h.closestComparableEpisodes.map(coerceComparableEpisode).filter((e): e is RepeatMoverComparableEpisode => e !== null)
    : [];
  const mostRecent = coerceComparableEpisode(h.mostRecentComparableEpisode);
  return {
    comparableEpisodeCount: finiteOrNull(h.comparableEpisodeCount) ?? closest.length,
    closestComparableEpisodes: closest,
    mostRecentComparableEpisode: mostRecent,
  };
}

const EVIDENCE_LABELS = new Set<string>(REPEAT_MOVER_EVIDENCE_LABELS);

/**
 * Normalize bridge/edge Repeat Mover payloads before Radar UI reads them.
 * Returns null when the payload cannot be rendered safely.
 */
export function coerceRepeatMoverContextForDisplay(raw: unknown): RepeatMoverContext | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const profile = coerceProfile(r.profile);
  if (!profile) return null;
  const securityId = typeof r.securityId === "string" && r.securityId.trim().length > 0
    ? r.securityId.trim()
    : null;
  if (!securityId) return null;

  const evidenceLabels = Array.isArray(r.evidenceLabels)
    ? r.evidenceLabels.filter(
      (label): label is RepeatMoverEvidenceLabel =>
        typeof label === "string" && EVIDENCE_LABELS.has(label as RepeatMoverEvidenceLabel),
    )
    : [];

  const currentContextRaw = r.currentContext;
  const currentContext = currentContextRaw && typeof currentContextRaw === "object"
    ? {
      observedSymbol: typeof (currentContextRaw as Record<string, unknown>).observedSymbol === "string"
        ? (currentContextRaw as Record<string, unknown>).observedSymbol as string
        : null,
      sessionDate: null,
      movePct: null,
      volume: null,
      rvol: null,
      dollarVolume: null,
      direction: null,
      tier: null,
      recordedAt: null,
    }
    : {
      observedSymbol: null,
      sessionDate: null,
      movePct: null,
      volume: null,
      rvol: null,
      dollarVolume: null,
      direction: null,
      tier: null,
      recordedAt: null,
    };

  return {
    version: REPEAT_MOVER_VERSION,
    securityId,
    currentSymbol: typeof r.currentSymbol === "string" ? r.currentSymbol : null,
    currentContext,
    profile,
    comparableHistory: coerceComparableHistory(r.comparableHistory),
    evidenceLabels,
    assembledAt: typeof r.assembledAt === "string" ? r.assembledAt : new Date(0).toISOString(),
  };
}
