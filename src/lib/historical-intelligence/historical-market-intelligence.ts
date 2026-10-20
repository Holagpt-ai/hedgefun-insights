/**
 * Batch 25 — deterministic historical market intelligence from stored RepeatMover evidence.
 * Evidence only; no predictive claims.
 */

import { PUBLIC_MARKET_DATA_DELAY_DISCLOSURE } from "@/lib/price-utils";
import type { HistoricalMatchSummary } from "@/lib/historical-intelligence/historical-match-summary";
import type {
  RepeatMoverComparableEpisode,
  RepeatMoverContext,
} from "@/types/repeat-mover";
import {
  HISTORICAL_INTELLIGENCE_MAX_CATALYST_EVENTS,
  HISTORICAL_INTELLIGENCE_MAX_COMPARABLE_EPISODES,
} from "./historical-market-intelligence-config";

export type HistoricalIntelligenceStatus = "available" | "partial" | "unavailable";

export interface HistoricalMomentumObservation {
  sessionDate: string;
  movePct: number | null;
  rvol: number | null;
  volume: number | null;
  observationScope: "comparable_episode";
}

export interface HistoricalVerifiedCatalystRow {
  title: string;
  publishedAt: string | null;
  source: string | null;
  sessionDate: string | null;
  label: "Verified historical event";
}

export interface HistoricalContinuationEvidence {
  eligibleFollowUps: number;
  observedFollowUps: number;
  continuationCount: number;
  summaryLine: string | null;
}

export interface HistoricalMarketIntelligenceModel {
  symbol: string;
  status: HistoricalIntelligenceStatus;
  distinctSessionAppearances: number | null;
  lastAppearanceDate: string | null;
  lastRecordedVolume: number | null;
  lastRecordedRvol: number | null;
  momentumObservations: HistoricalMomentumObservation[];
  continuation: HistoricalContinuationEvidence;
  verifiedCatalystEvents: HistoricalVerifiedCatalystRow[];
  coverageLine: string | null;
  limitationLine: string;
  delayDisclosure: string;
  provenanceAssembledAt: string | null;
  historyStartDate: string | null;
  historyEndDate: string | null;
}

function normalizeSymbol(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase();
}

function parseSessionMs(date: string | null | undefined): number {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Number.NEGATIVE_INFINITY;
  const ms = Date.parse(`${date}T12:00:00.000Z`);
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

function isSessionDate(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

/** Prefer profile latest episode when comparables omit a more recent stored appearance. */
function resolveLastAppearanceDate(
  profile: RepeatMoverContext["profile"],
  mostRecentComparable: RepeatMoverComparableEpisode | null,
): string | null {
  const profileDate = isSessionDate(profile.latestEpisodeDateUsed)
    ? profile.latestEpisodeDateUsed.trim()
    : null;
  const comparableDate = isSessionDate(mostRecentComparable?.sessionDate)
    ? mostRecentComparable!.sessionDate!.trim()
    : null;
  const profileMs = parseSessionMs(profileDate);
  const comparableMs = parseSessionMs(comparableDate);
  if (profileMs > comparableMs && profileDate) return profileDate;
  if (comparableDate) return comparableDate;
  return profileDate;
}

function volumeObservationForSession(
  episodes: readonly RepeatMoverComparableEpisode[],
  sessionDate: string | null,
): { volume: number | null; rvol: number | null } {
  if (!sessionDate) return { volume: null, rvol: null };
  const match = episodes.find((ep) => ep.sessionDate?.trim() === sessionDate);
  if (!match) return { volume: null, rvol: null };
  return {
    volume: typeof match.volume === "number" && Number.isFinite(match.volume) ? match.volume : null,
    rvol: typeof match.rvol === "number" && Number.isFinite(match.rvol) ? match.rvol : null,
  };
}

/** One episode per ET session date — repeated polls must not inflate counts. */
export function dedupeEpisodesBySessionDate(
  episodes: readonly RepeatMoverComparableEpisode[],
): RepeatMoverComparableEpisode[] {
  const bySession = new Map<string, RepeatMoverComparableEpisode>();
  for (const ep of episodes) {
    const session = ep.sessionDate?.trim();
    const key = session && /^\d{4}-\d{2}-\d{2}$/.test(session) ? session : ep.episodeId;
    const prev = bySession.get(key);
    if (!prev) {
      bySession.set(key, ep);
      continue;
    }
    if (parseSessionMs(ep.sessionDate) >= parseSessionMs(prev.sessionDate)) {
      bySession.set(key, ep);
    }
  }
  return [...bySession.values()].sort(
    (a, b) => parseSessionMs(b.sessionDate) - parseSessionMs(a.sessionDate),
  );
}

export function collectComparableEpisodes(context: RepeatMoverContext | null | undefined): RepeatMoverComparableEpisode[] {
  if (!context) return [];
  const list: RepeatMoverComparableEpisode[] = [];
  const seen = new Set<string>();
  const push = (ep: RepeatMoverComparableEpisode | null | undefined) => {
    if (!ep || seen.has(ep.episodeId)) return;
    seen.add(ep.episodeId);
    list.push(ep);
  };
  push(context.comparableHistory?.mostRecentComparableEpisode ?? null);
  for (const ep of context.comparableHistory?.closestComparableEpisodes ?? []) {
    push(ep);
  }
  return dedupeEpisodesBySessionDate(list).slice(0, HISTORICAL_INTELLIGENCE_MAX_COMPARABLE_EPISODES);
}

function catalystFromEpisodes(
  episodes: readonly RepeatMoverComparableEpisode[],
): HistoricalVerifiedCatalystRow[] {
  const out: HistoricalVerifiedCatalystRow[] = [];
  const seen = new Set<string>();
  for (const ep of episodes) {
    for (const event of ep.historicalEvents ?? []) {
      const key = `${event.title}|${event.publishedAt ?? ""}|${event.source ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!event.title?.trim()) continue;
      out.push({
        title: event.title.trim(),
        publishedAt: event.publishedAt,
        source: event.source,
        sessionDate: ep.sessionDate,
        label: "Verified historical event",
      });
      if (out.length >= HISTORICAL_INTELLIGENCE_MAX_CATALYST_EVENTS) return out;
    }
  }
  return out;
}

function buildContinuationEvidence(
  episodes: readonly RepeatMoverComparableEpisode[],
  match: HistoricalMatchSummary | null | undefined,
): HistoricalContinuationEvidence {
  const fromEpisodes = episodes.filter((ep) => ep.nextSessionContinuation !== null);
  const eligible = fromEpisodes.length;
  const continuationCount = fromEpisodes.filter((ep) => ep.nextSessionContinuation === true).length;

  const eligibleFollowUps = match?.continuationKnownCount ?? eligible;
  const observedFollowUps = match?.outcomeObservedCount ?? eligible;
  const continuationSuccess = match?.continuationSuccessCount ?? continuationCount;

  let summaryLine: string | null = null;
  if (eligibleFollowUps > 0) {
    summaryLine = `${continuationSuccess} of ${eligibleFollowUps} eligible next-session follow-ups with known outcomes`;
    if (observedFollowUps < eligibleFollowUps) {
      summaryLine += ` (${observedFollowUps} fully observed)`;
    }
  } else if (match?.outcomeConfidence === "INSUFFICIENT") {
    summaryLine = "Next-session continuation not yet observed in stored history";
  }

  return {
    eligibleFollowUps,
    observedFollowUps,
    continuationCount: continuationSuccess,
    summaryLine,
  };
}

function formatCoverageLine(profile: RepeatMoverContext["profile"]): string | null {
  const parts: string[] = [];
  if (profile.historyStartDate && profile.historyEndDate) {
    parts.push(`Stored coverage ${profile.historyStartDate} – ${profile.historyEndDate}`);
  }
  if (typeof profile.sessionsObserved === "number" && profile.sessionsObserved > 0) {
    parts.push(`${profile.sessionsObserved.toLocaleString()} sessions in profile`);
  }
  if (typeof profile.sourceEpisodeCount === "number" && profile.sourceEpisodeCount >= 0) {
    parts.push(`${profile.sourceEpisodeCount} source episodes indexed`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function buildHistoricalMarketIntelligence(input: {
  context: RepeatMoverContext | null | undefined;
  matchSummary?: HistoricalMatchSummary | null;
  symbol?: string | null;
}): HistoricalMarketIntelligenceModel {
  const context = input.context;
  const symbol = normalizeSymbol(input.symbol ?? context?.currentSymbol ?? "");
  const profile = context?.profile;
  const available = profile?.profileAvailable === true;

  if (!context || !available) {
    return {
      symbol,
      status: "unavailable",
      distinctSessionAppearances: null,
      lastAppearanceDate: null,
      lastRecordedVolume: null,
      lastRecordedRvol: null,
      momentumObservations: [],
      continuation: {
        eligibleFollowUps: 0,
        observedFollowUps: 0,
        continuationCount: 0,
        summaryLine: null,
      },
      verifiedCatalystEvents: [],
      coverageLine: null,
      limitationLine: "Missing stored historical records — not evidence that activity never occurred.",
      delayDisclosure: PUBLIC_MARKET_DATA_DELAY_DISCLOSURE,
      provenanceAssembledAt: context?.assembledAt ?? null,
      historyStartDate: null,
      historyEndDate: null,
    };
  }

  const episodes = collectComparableEpisodes(context);
  const distinctFromProfile =
    typeof profile.episodeCount === "number" && profile.episodeCount > 0
      ? Math.floor(profile.episodeCount)
      : null;
  const distinctSessionAppearances = distinctFromProfile ?? (episodes.length > 0 ? episodes.length : null);

  const mostRecentComparable =
    episodes[0] ?? context.comparableHistory?.mostRecentComparableEpisode ?? null;
  const lastAppearanceDate = resolveLastAppearanceDate(profile, mostRecentComparable);
  const { volume: lastRecordedVolume, rvol: lastRecordedRvol } = volumeObservationForSession(
    episodes,
    lastAppearanceDate,
  );

  const momentumObservations: HistoricalMomentumObservation[] = episodes
    .filter((ep) => ep.movePct !== null || ep.rvol !== null || ep.volume !== null)
    .map((ep) => ({
      sessionDate: ep.sessionDate ?? "—",
      movePct: ep.movePct,
      rvol: ep.rvol,
      volume: ep.volume,
      observationScope: "comparable_episode" as const,
    }));

  const partial =
    !profile.sampleSizeQuality ||
    profile.sampleSizeQuality === "INSUFFICIENT" ||
    profile.sampleSizeQuality === "LIMITED";

  return {
    symbol,
    status: partial ? "partial" : "available",
    distinctSessionAppearances,
    lastAppearanceDate,
    lastRecordedVolume: typeof lastRecordedVolume === "number" ? lastRecordedVolume : null,
    lastRecordedRvol: typeof lastRecordedRvol === "number" ? lastRecordedRvol : null,
    momentumObservations,
    continuation: buildContinuationEvidence(episodes, input.matchSummary),
    verifiedCatalystEvents: catalystFromEpisodes(episodes),
    coverageLine: formatCoverageLine(profile),
    limitationLine:
      "Historical figures reflect stored Stocksist observations only — not predictions or complete market history.",
    delayDisclosure: PUBLIC_MARKET_DATA_DELAY_DISCLOSURE,
    provenanceAssembledAt: context.assembledAt ?? null,
    historyStartDate: profile.historyStartDate,
    historyEndDate: profile.historyEndDate,
  };
}
