import type { RepeatMoverComparableEpisode, RepeatMoverContext } from "@/types/repeat-mover";
import {
  formatRadarDollarVolume,
  formatRadarPercent,
  formatRadarVolume,
} from "./radar-metrics";

export interface HistoryDetailFact {
  label: string;
  value: string;
}

const HORIZONS = ["D1", "D2", "D3", "D5"] as const;

function signedPercent(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const formatted = formatRadarPercent(value);
  return formatted === "—" ? null : formatted;
}

function positiveVolume(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || !(value > 0)) return null;
  const formatted = formatRadarVolume(value);
  return formatted === "—" ? null : formatted;
}

function positiveDollars(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || !(value > 0)) return null;
  const formatted = formatRadarDollarVolume(value);
  return formatted.startsWith("Unavailable") ? null : formatted;
}

function rvolLabel(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || !(value > 0)) return null;
  return `${value.toFixed(1)}×`;
}

function rangePosition(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) return null;
  return `${Math.round(value * 100)}% of day range`;
}

function clockLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

function eventLabel(eventType: string, title: string): string | null {
  const named = title.trim();
  if (named) return named;
  const words = eventType
    .split("_")
    .filter(Boolean)
    .map((word) => {
      if (word === "FDA" || word === "SEC" || word === "AI") return word;
      return word.charAt(0) + word.slice(1).toLowerCase();
    });
  return words.length > 0 ? words.join(" ") : null;
}

function pushFact(facts: HistoryDetailFact[], label: string, value: string | null) {
  if (!value) return;
  facts.push({ label, value });
}

/**
 * Facts taken only from fields on the comparable episode. Missing values are
 * omitted. Pattern summaries that need peak time, retracement, or a return
 * to baseline are not derived here because those fields are not on the
 * Radar episode payload.
 */
export function comparableEpisodeFacts(episode: RepeatMoverComparableEpisode): HistoryDetailFact[] {
  const facts: HistoryDetailFact[] = [];
  pushFact(facts, "Move", signedPercent(episode.movePct));
  pushFact(facts, "Volume", positiveVolume(episode.volume));
  pushFact(facts, "Dollar volume", positiveDollars(episode.dollarVolume));
  pushFact(facts, "RVOL", rvolLabel(episode.rvol));
  pushFact(facts, "Close in range", rangePosition(episode.closePosition));
  pushFact(facts, "Next session", signedPercent(episode.nextSessionMovePct));
  if (episode.nextSessionContinuation === true) {
    facts.push({ label: "Continuation", value: "Continued next session" });
  } else if (episode.nextSessionContinuation === false) {
    facts.push({ label: "Continuation", value: "Did not continue next session" });
  }

  const intraday = episode.observedIntradayReconstruction;
  if (intraday) {
    pushFact(facts, "Peak time", clockLabel(intraday.hodAt));
    pushFact(facts, "Retracement", signedPercent(intraday.largestPullbackPct));
    pushFact(facts, "Close vs high", signedPercent(intraday.closeVsHodPct));
    if (intraday.recoveredFromPullback === true) {
      facts.push({ label: "Pullback", value: "Recovered" });
    } else if (intraday.recoveredFromPullback === false) {
      facts.push({ label: "Pullback", value: "Did not recover" });
    }
  }

  for (const event of episode.historicalEvents ?? []) {
    pushFact(facts, "Catalyst", eventLabel(event.eventType, event.title));
  }

  const returns = episode.observedForwardOutcomes?.closeToCloseReturnPct;
  if (returns) {
    for (const horizon of HORIZONS) {
      pushFact(facts, `${horizon} return`, signedPercent(returns[horizon]));
    }
  }

  return facts;
}

export function episodeSessionHeading(sessionDate: string | null | undefined): string | null {
  if (!sessionDate) return null;
  const date = new Date(`${sessionDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return sessionDate;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function episodeTierLabel(tier: string | null | undefined): string | null {
  if (!tier) return null;
  const known: Record<string, string> = {
    NOTABLE: "Notable",
    SIGNIFICANT: "Significant",
    EXTREME: "Extreme",
  };
  return known[tier] ?? null;
}

export interface HistoryDetailCopy {
  verifiedRuns: string;
  showing: string | null;
  emptyDetails: string | null;
}

export function historyDetailCopy(
  context: RepeatMoverContext,
  verifiedCount: number,
): HistoryDetailCopy {
  const loaded = context.comparableHistory?.closestComparableEpisodes?.length ?? 0;
  const verifiedRuns = verifiedCount === 1
    ? "1 verified prior run"
    : `${verifiedCount} verified prior runs`;
  if (loaded === 0) {
    return {
      verifiedRuns,
      showing: null,
      emptyDetails: "Comparable episode details are not available yet.",
    };
  }
  const showing = loaded < verifiedCount
    ? loaded === 1
      ? "Showing 1 closest comparable episode"
      : `Showing ${loaded} closest comparable episodes`
    : null;
  return { verifiedRuns, showing, emptyDetails: null };
}

export function loadedComparableEpisodes(
  context: RepeatMoverContext | null | undefined,
): RepeatMoverComparableEpisode[] {
  return context?.comparableHistory?.closestComparableEpisodes ?? [];
}
