import {
  REPEAT_MOVER_EVIDENCE_LABELS,
  REPEAT_MOVER_VERSION,
} from "@/config/repeat-mover.config";
import type { RepeatMoverEvidenceLabel } from "@/config/repeat-mover.config";
import type {
  RepeatMoverComparableEpisode,
  RepeatMoverComparableHistory,
  RepeatMoverContext,
  RepeatMoverProfileSnapshot,
} from "@/types/repeat-mover";
import { unavailableRepeatMoverProfileSnapshot } from "@/lib/repeat-movers/get-repeat-mover-context";

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

function coerceComparableEpisode(raw: unknown): RepeatMoverComparableEpisode | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.episodeId !== "string" || !e.episodeId) return null;
  const tier = e.tier;
  const direction = e.direction;
  if (typeof tier !== "string" || typeof direction !== "string") return null;
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
