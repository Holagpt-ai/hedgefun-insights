// Descriptive (non-predictive) historical catalyst facts derived from the
// already-available Repeat Movers / Behavior Profile V2 / Forward Outcomes
// evidence. Pure — no fetching, no invented values.

import {
  CATALYST_CATEGORY_LABEL,
  TEMPORAL_RELATIONSHIP_LABEL,
  historicalEventCategory,
  type CatalystDisplayCategory,
} from "@/lib/catalyst/catalyst-event-visuals";
import type { RepeatMoverContext } from "@/types/repeat-mover";

export interface CatalystPriorEventCard {
  key: string;
  eventDate: string | null;
  category: CatalystDisplayCategory;
  categoryLabel: string;
  title: string;
  source: string | null;
  temporalRelationshipLabel: string;
  observedD1: string | null;
  observedD5: string | null;
}

export interface CatalystHistoricalSummary {
  available: boolean;
  /** Descriptive fact lines, already worded for display. */
  lines: string[];
  linkedEventCount: number;
  comparableEpisodeCount: number;
  priorEvents: CatalystPriorEventCard[];
}

export const MAX_PRIOR_EVENT_CARDS = 3;

function formatPercent(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatIsoDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function buildCatalystHistoricalSummary(
  context: RepeatMoverContext | null | undefined,
): CatalystHistoricalSummary {
  const profile = context?.profile;
  const episodes = context?.comparableHistory.closestComparableEpisodes ?? [];

  const priorEvents: CatalystPriorEventCard[] = [];
  let linkedEventCount = 0;

  for (const episode of episodes) {
    const outcomes = episode.observedForwardOutcomes?.closeToCloseReturnPct;
    for (const [index, evidence] of (episode.historicalEvents ?? []).entries()) {
      linkedEventCount += 1;
      if (priorEvents.length >= MAX_PRIOR_EVENT_CARDS) continue;
      const category = historicalEventCategory(evidence.eventType);
      priorEvents.push({
        key: `${episode.episodeId}:${index}`,
        eventDate: formatIsoDate(evidence.publishedAt ?? episode.sessionDate),
        category,
        categoryLabel: CATALYST_CATEGORY_LABEL[category],
        title: evidence.title,
        source: evidence.source,
        temporalRelationshipLabel: TEMPORAL_RELATIONSHIP_LABEL[evidence.temporalRelationship],
        observedD1: formatPercent(outcomes?.D1 ?? null),
        observedD5: formatPercent(outcomes?.D5 ?? null),
      });
    }
  }

  const available = profile?.profileAvailable === true;
  if (!available) {
    return {
      available: false,
      lines: [],
      linkedEventCount,
      comparableEpisodeCount: context?.comparableHistory.comparableEpisodeCount ?? 0,
      priorEvents,
    };
  }

  const comparableEpisodeCount = context?.comparableHistory.comparableEpisodeCount ?? 0;
  const lines: string[] = [];

  if (comparableEpisodeCount > 0) {
    lines.push(
      `${comparableEpisodeCount} similar prior ${comparableEpisodeCount === 1 ? "episode" : "episodes"} observed`,
    );
  }
  if (linkedEventCount > 0) {
    lines.push(
      `${linkedEventCount} prior linked catalyst ${linkedEventCount === 1 ? "episode" : "episodes"}`,
    );
  }
  const medianD1 = formatPercent(profile.medianD1ReturnPct);
  if (medianD1) lines.push(`Median D1 move across observed episodes: ${medianD1}`);
  const medianD5 = formatPercent(profile.medianD5ReturnPct);
  if (medianD5) lines.push(`Median D5 move across observed episodes: ${medianD5}`);
  if (typeof profile.observedNextSessionSampleSize === "number") {
    lines.push(`Observed next-session sample size: ${profile.observedNextSessionSampleSize}`);
  }
  if (typeof profile.episodeCount === "number") {
    lines.push(`${profile.episodeCount} historical episodes recorded`);
  }

  return { available: true, lines, linkedEventCount, comparableEpisodeCount, priorEvents };
}

export function catalystHistoricalBadgeLabel(
  summary: CatalystHistoricalSummary,
): string | null {
  if (!summary.available) return null;
  if (summary.comparableEpisodeCount > 0) {
    return `${summary.comparableEpisodeCount} Similar Episodes`;
  }
  if (summary.linkedEventCount > 0) return "Linked History";
  return "Historical Context";
}

export interface CatalystFreshness {
  label: string;
  stale: boolean;
}

export function catalystFreshness(
  publishedAtIso: string | null,
  nowMs: number,
): CatalystFreshness {
  const stampMs = publishedAtIso ? Date.parse(publishedAtIso) : Number.NaN;
  if (!Number.isFinite(stampMs)) return { label: "Publish time unavailable", stale: true };
  const minutes = Math.max(0, Math.floor((nowMs - stampMs) / 60_000));
  if (minutes < 1) return { label: "Just now", stale: false };
  if (minutes < 60) return { label: `${minutes}m ago`, stale: false };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { label: `${hours}h ago`, stale: false };
  return { label: `${Math.floor(hours / 24)}d ago`, stale: true };
}
