/**
 * Batch 32 — deterministic historical episode exploration from persisted evidence only.
 */

import type { EpisodeLinkedEventEvidence } from "@/lib/episode-event-linkage/episode-linked-event-evidence";
import type { PostMomentumForwardOutcomesByHorizon } from "@/lib/intraday-reconstruction/compute-post-momentum-forward-outcomes";
import type { EpisodeIntradayTimelineEvent } from "@/lib/intraday-reconstruction/intraday-reconstruction-types";
import type { HistoricalMatchSummary } from "@/lib/historical-intelligence/historical-match-summary";
import type {
  RepeatMoverComparableEpisode,
  RepeatMoverContext,
} from "@/types/repeat-mover";
import type { SecurityId } from "@/types/security-identity";

export type HistoricalReplayPhase =
  | "known_at_event"
  | "market_observation"
  | "observed_afterward";

export interface HistoricalEpisodeReplayStep {
  id: string;
  phase: HistoricalReplayPhase;
  eventAt: string | null;
  eventAtMs: number | null;
  label: string;
  detail: string | null;
  price: number | null;
  volume: number | null;
}

export type HistoricalEpisodeReplayMode =
  | "stored_timeline"
  | "observation_timeline"
  | "insufficient";

export interface HistoricalEpisodeMatchRationale {
  knownAtEventLines: string[];
  observedAfterwardLines: string[];
}

export interface HistoricalEpisodeExplorerModel {
  episodeId: string;
  sessionDate: string | null;
  securityId: SecurityId | null;
  symbol: string;
  tier: string;
  direction: string;
  movePct: number | null;
  volume: number | null;
  rvol: number | null;
  gapPct: number | null;
  floatTurnover: number | null;
  momentumEventLabel: string;
  replayMode: HistoricalEpisodeReplayMode;
  replaySteps: HistoricalEpisodeReplayStep[];
  matchRationale: HistoricalEpisodeMatchRationale;
  catalystEvents: readonly EpisodeLinkedEventEvidence[];
  postMomentumOutcomes: PostMomentumForwardOutcomesByHorizon | null;
  limitationLine: string;
}

const FORWARD_LABELS: Record<string, string> = {
  "5": "+5 minutes after momentum reference",
  "15": "+15 minutes after momentum reference",
  "30": "+30 minutes after momentum reference",
  "60": "+60 minutes after momentum reference",
  SESSION_CLOSE: "Session close after momentum reference",
};

const MAX_EPISODES = 8;

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

function rejectFutureTimestamp(ms: number | null, nowMs: number): number | null {
  if (ms === null) return null;
  if (ms > nowMs + 60_000) return null;
  return ms;
}

function timelineEventLabel(eventType: string): string {
  return eventType
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

function stepFromTimelineEvent(
  event: EpisodeIntradayTimelineEvent,
  nowMs: number,
): HistoricalEpisodeReplayStep | null {
  const eventAtMs = rejectFutureTimestamp(parseMs(event.eventAt), nowMs);
  const phase: HistoricalReplayPhase =
    event.eventType === "CLOSE" || event.eventType === "AFTER_HOURS_EXTENSION"
      ? "observed_afterward"
      : "market_observation";
  return {
    id: event.episodeEventId,
    phase,
    eventAt: event.eventAt,
    eventAtMs,
    label: timelineEventLabel(event.eventType),
    detail: null,
    price: event.price,
    volume: event.volume,
  };
}

function stepsFromCompactIntraday(
  episode: RepeatMoverComparableEpisode,
  nowMs: number,
): HistoricalEpisodeReplayStep[] {
  const intraday = episode.observedIntradayReconstruction;
  if (!intraday) return [];
  const steps: HistoricalEpisodeReplayStep[] = [];
  const push = (
    id: string,
    iso: string | null,
    label: string,
    phase: HistoricalReplayPhase,
  ) => {
    const eventAtMs = rejectFutureTimestamp(parseMs(iso), nowMs);
    if (!eventAtMs) return;
    steps.push({
      id,
      phase,
      eventAt: iso,
      eventAtMs,
      label,
      detail: null,
      price: null,
      volume: null,
    });
  };
  push(`${episode.episodeId}-volume-burst`, intraday.largestVolumeBurstAt, "Volume acceleration (recorded)", "market_observation");
  push(`${episode.episodeId}-hod`, intraday.hodAt, "High-of-day observation (recorded)", "market_observation");
  if (intraday.vwapReclaimCount != null && intraday.vwapReclaimCount > 0) {
    steps.push({
      id: `${episode.episodeId}-vwap-reclaims`,
      phase: "market_observation",
      eventAt: null,
      eventAtMs: null,
      label: "VWAP reclaim events (count recorded)",
      detail: `${intraday.vwapReclaimCount} reclaim(s) in stored reconstruction`,
      price: null,
      volume: null,
    });
  }
  return steps;
}

function stepsFromCatalystEvents(
  events: readonly EpisodeLinkedEventEvidence[] | undefined,
  episodeId: string,
  nowMs: number,
): HistoricalEpisodeReplayStep[] {
  if (!events?.length) return [];
  return events.flatMap((ev, index) => {
    const eventAtMs = rejectFutureTimestamp(parseMs(ev.publishedAt), nowMs);
    const phase: HistoricalReplayPhase =
      ev.temporalRelationship === "EVENT_FOLLOWS_EPISODE"
        ? "observed_afterward"
        : "known_at_event";
    return [{
      id: `${episodeId}-catalyst-${index}`,
      phase,
      eventAt: ev.publishedAt,
      eventAtMs,
      label: ev.title?.trim() || "Linked event",
      detail: [ev.eventType, ev.source, ev.temporalRelationship.replace(/_/g, " ").toLowerCase()]
        .filter(Boolean)
        .join(" · "),
      price: null,
      volume: null,
    }];
  });
}

function stepsFromPostMomentum(
  outcomes: PostMomentumForwardOutcomesByHorizon | null | undefined,
  episodeId: string,
): HistoricalEpisodeReplayStep[] {
  if (!outcomes) return [];
  const steps: HistoricalEpisodeReplayStep[] = [];
  for (const [horizonKey, window] of Object.entries(outcomes)) {
    if (!window) continue;
    const label = FORWARD_LABELS[horizonKey] ?? horizonKey;
    if (
      window.availabilityState === "INSUFFICIENT_BARS"
      || window.availabilityState === "INVALID_REFERENCE"
    ) {
      steps.push({
        id: `${episodeId}-fwd-${horizonKey}-na`,
        phase: "observed_afterward",
        eventAt: window.windowEndTimestamp,
        eventAtMs: parseMs(window.windowEndTimestamp),
        label,
        detail: "Outcome window unavailable in stored bars",
        price: null,
        volume: null,
      });
      continue;
    }
    const parts: string[] = [];
    if (window.endReturnPct != null) parts.push(`Return ${window.endReturnPct.toFixed(1)}%`);
    if (window.maxFavorablePct != null) parts.push(`MFE ${window.maxFavorablePct.toFixed(1)}%`);
    if (window.maxAdversePct != null) parts.push(`MAE ${window.maxAdversePct.toFixed(1)}%`);
    if (window.availabilityState === "PARTIAL_WINDOW") parts.push("Partial window");
    steps.push({
      id: `${episodeId}-fwd-${horizonKey}`,
      phase: "observed_afterward",
      eventAt: window.windowEndTimestamp ?? window.referenceTimestamp,
      eventAtMs: parseMs(window.windowEndTimestamp ?? window.referenceTimestamp),
      label,
      detail: parts.length > 0 ? parts.join(" · ") : "Recorded forward observation",
      price: null,
      volume: null,
    });
  }
  return steps;
}

function readStoredTimeline(
  episode: RepeatMoverComparableEpisode,
): readonly EpisodeIntradayTimelineEvent[] | null {
  const raw = episode.observedIntradayReconstruction as
    | { timeline?: readonly EpisodeIntradayTimelineEvent[] }
    | null
    | undefined;
  if (!raw?.timeline?.length) return null;
  return raw.timeline;
}

export function buildEpisodeMatchRationale(
  episode: RepeatMoverComparableEpisode,
): HistoricalEpisodeMatchRationale {
  const knownAtEventLines: string[] = [];
  if (episode.rvol != null) knownAtEventLines.push(`RVOL ${episode.rvol.toFixed(1)}× at episode`);
  if (episode.volume != null) knownAtEventLines.push(`Session volume ${episode.volume.toLocaleString()}`);
  if (episode.gapPct != null) knownAtEventLines.push(`Gap ${episode.gapPct > 0 ? "+" : ""}${episode.gapPct.toFixed(1)}%`);
  if (episode.floatTurnover != null) {
    knownAtEventLines.push(`Float turnover ${(episode.floatTurnover * 100).toFixed(0)}%`);
  }
  if (episode.movePct != null) knownAtEventLines.push(`Move ${episode.movePct > 0 ? "+" : ""}${episode.movePct.toFixed(1)}%`);
  if (episode.similarity.sameDirection) knownAtEventLines.push("Same direction as current session");
  if (episode.similarity.sameTier) knownAtEventLines.push("Same episode tier classification");
  if (episode.similarity.movePctDelta != null) {
    knownAtEventLines.push(`Move delta vs current ${episode.similarity.movePctDelta.toFixed(1)} pts`);
  }

  const observedAfterwardLines: string[] = [];
  if (episode.nextSessionContinuation === true) {
    observedAfterwardLines.push("Continued into the next session (recorded outcome)");
  } else if (episode.nextSessionContinuation === false) {
    observedAfterwardLines.push("Did not continue next session (recorded outcome)");
  }
  if (episode.nextSessionMovePct != null) {
    observedAfterwardLines.push(`Next session move ${episode.nextSessionMovePct > 0 ? "+" : ""}${episode.nextSessionMovePct.toFixed(1)}%`);
  }
  const returns = episode.observedForwardOutcomes?.closeToCloseReturnPct;
  if (returns) {
    for (const [horizon, value] of Object.entries(returns)) {
      if (value == null || !Number.isFinite(value)) continue;
      observedAfterwardLines.push(`${horizon} close-to-close ${value > 0 ? "+" : ""}${value.toFixed(1)}%`);
    }
  }

  return { knownAtEventLines, observedAfterwardLines };
}

export function buildHistoricalEpisodeExplorerModel(input: {
  episode: RepeatMoverComparableEpisode;
  symbol: string;
  securityId?: SecurityId | null;
  nowMs?: number;
}): HistoricalEpisodeExplorerModel {
  const nowMs = input.nowMs ?? Date.now();
  const episode = input.episode;
  const timeline = readStoredTimeline(episode);
  let replayMode: HistoricalEpisodeReplayMode = "insufficient";
  const replaySteps: HistoricalEpisodeReplayStep[] = [];

  if (timeline?.length) {
    replayMode = "stored_timeline";
    for (const event of timeline) {
      const step = stepFromTimelineEvent(event, nowMs);
      if (step) replaySteps.push(step);
    }
  } else {
    replaySteps.push(
      ...stepsFromCompactIntraday(episode, nowMs),
      ...stepsFromCatalystEvents(episode.historicalEvents, episode.episodeId, nowMs),
    );
    if (replaySteps.length > 0) replayMode = "observation_timeline";
  }

  replaySteps.push(
    ...stepsFromPostMomentum(
      episode.observedIntradayReconstruction?.postMomentumForwardOutcomes,
      episode.episodeId,
    ),
  );

  replaySteps.sort((a, b) => {
    if (a.eventAtMs != null && b.eventAtMs != null) return a.eventAtMs - b.eventAtMs;
    if (a.eventAtMs != null) return -1;
    if (b.eventAtMs != null) return 1;
    return a.label.localeCompare(b.label);
  });

  const momentumEventLabel = episode.tier
    ? `${episode.tier.replace(/_/g, " ")} momentum episode`
    : "Recorded momentum episode";

  return {
    episodeId: episode.episodeId,
    sessionDate: episode.sessionDate,
    securityId: input.securityId ?? null,
    symbol: input.symbol.trim().toUpperCase(),
    tier: episode.tier,
    direction: episode.direction,
    movePct: episode.movePct,
    volume: episode.volume,
    rvol: episode.rvol,
    gapPct: episode.gapPct ?? null,
    floatTurnover: episode.floatTurnover ?? null,
    momentumEventLabel,
    replayMode,
    replaySteps,
    matchRationale: buildEpisodeMatchRationale(episode),
    catalystEvents: episode.historicalEvents ?? [],
    postMomentumOutcomes: episode.observedIntradayReconstruction?.postMomentumForwardOutcomes ?? null,
    limitationLine:
      "Historical replay uses stored observations only — not live ticks, simulated prices, or forecasts.",
  };
}

export function listHistoricalExplorerEpisodes(
  context: RepeatMoverContext | null | undefined,
  symbol: string,
  options: { max?: number; nowMs?: number } = {},
): HistoricalEpisodeExplorerModel[] {
  const max = options.max ?? MAX_EPISODES;
  const episodes = context?.comparableHistory?.closestComparableEpisodes ?? [];
  const securityId = context?.securityId ?? null;
  return episodes.slice(0, max).map((episode) => buildHistoricalEpisodeExplorerModel({
    episode,
    symbol,
    securityId,
    nowMs: options.nowMs,
  }));
}

export function summarizeExplorerCoverage(
  matchSummary: HistoricalMatchSummary | null | undefined,
): string | null {
  if (!matchSummary || matchSummary.matchCount === 0) return null;
  const known = matchSummary.continuationKnownCount;
  const obs = matchSummary.outcomeObservedCount;
  return `Comparable set: ${matchSummary.matchCount} episodes · ${obs} with observed outcomes · ${known} with known continuation (historical only, not a forecast).`;
}
