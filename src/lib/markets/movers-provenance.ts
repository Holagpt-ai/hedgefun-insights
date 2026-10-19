/**
 * Public market-movers observation provenance and honest universe labeling.
 * Wall-clock session text stays separate from provider as-of timestamps.
 */

import {
  PUBLIC_MARKET_DATA_DELAY_DISCLOSURE,
  formatStockHeaderSessionLine,
  resolveMarketSession,
} from "@/lib/price-utils";
import { getEtParts, tradingSessionDateForInstant } from "@/lib/market-calendar";
import { dailyAggregateBarDate } from "@/lib/etf/snapshot-volume";
import {
  etSessionDate,
  type CanonicalMover,
  type MoverSession,
} from "./movers-integrity";
import {
  formatMoverObservationEt,
  observationMsFromIso,
  referenceTradingSessionDate,
} from "./movers-observation";

export const MOST_ACTIVE_TRACKED_UNIVERSE_TITLE = "Most Active Among Tracked Movers";

export const MOST_ACTIVE_TRACKED_UNIVERSE_DETAIL =
  "Ranked by verified volume among symbols appearing in the provider top gainers and losers lists. This is not a market-wide most-active universe and does not include every listed stock.";

export const TRACKED_GAINERS_LOSERS_UNIVERSE_DETAIL =
  "Lists reflect the provider top gainers and losers snapshot — not every listed stock.";

export const PREMARKET_CANDIDATE_UNIVERSE_DETAIL =
  "Pre-market movers are derived from the same provider mover snapshot, validated against the prior regular close. Dedicated extended-hours feeds are not enabled on this plan.";

export const DELAYED_MARKET_DATA_SEO_PHRASE = "15-minute delayed market data";

export type MoverUniverseKind =
  | "top_gainers"
  | "top_losers"
  | "tracked_gainers_losers"
  | "after_hours_feed";

export type MoversObservationFreshness =
  | "current_session"
  | "prior_session"
  | "delayed_snapshot"
  | "historical"
  | "unverified"
  | "mixed";

export type SessionDateMode = "unverified" | "homogeneous_current" | "homogeneous_prior" | "mixed";

export interface MoversListProvenance {
  sessionLine: string;
  observationLine: string | null;
  observationTimeUnavailable: boolean;
  observationMixed: boolean;
  observationPartiallyUntimed: boolean;
  sessionDateMode: SessionDateMode;
  universeTitle: string | null;
  universeDetail: string | null;
  delayDisclosure: string;
  sessionDate: string | null;
  freshness: MoversObservationFreshness;
  isPriorSession: boolean;
}

function validMovers(movers: CanonicalMover[]): CanonicalMover[] {
  return movers.filter((m) => m.valid);
}

function hasUnverifiedSessionDate(movers: CanonicalMover[]): boolean {
  return movers.some((m) => m.valid && m.session_date_unverified);
}

function referenceSessionDateForMoverSession(moverSession: MoverSession, nowMs: number): string {
  if (moverSession === "regular") return referenceTradingSessionDate(nowMs);
  return etSessionDate(nowMs);
}

function isPriorSessionDate(date: string, moverSession: MoverSession, nowMs: number): boolean {
  return date !== referenceSessionDateForMoverSession(moverSession, nowMs);
}

export function summarizeSessionDates(
  movers: CanonicalMover[],
  moverSession: MoverSession,
  nowMs: number,
): {
  mode: SessionDateMode;
  dominantDate: string | null;
  isPriorHomogeneous: boolean;
} {
  const dated = validMovers(movers).filter((m) => m.session_date);
  if (dated.length === 0) {
    return { mode: "unverified", dominantDate: null, isPriorHomogeneous: false };
  }
  const counts = new Map<string, number>();
  for (const m of dated) {
    const d = m.session_date as string;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (entries.length > 1) {
    return { mode: "mixed", dominantDate: entries[0][0], isPriorHomogeneous: false };
  }
  const onlyDate = entries[0][0];
  const prior = isPriorSessionDate(onlyDate, moverSession, nowMs);
  return {
    mode: prior ? "homogeneous_prior" : "homogeneous_current",
    dominantDate: onlyDate,
    isPriorHomogeneous: prior,
  };
}

export function summarizeListObservationTimes(
  movers: CanonicalMover[],
): {
  line: string | null;
  unavailable: boolean;
  mixed: boolean;
  partiallyUntimed: boolean;
} {
  const rows = validMovers(movers);
  const timed: number[] = [];
  let untimedCount = 0;
  for (const m of rows) {
    const ms = observationMsFromIso(m.provider_as_of);
    if (ms !== null && !m.observation_time_unavailable) {
      timed.push(ms);
    } else {
      untimedCount += 1;
    }
  }

  if (timed.length === 0) {
    return { line: null, unavailable: true, mixed: false, partiallyUntimed: false };
  }

  timed.sort((a, b) => a - b);
  const oldest = timed[0];
  const newest = timed[timed.length - 1];
  const timesSpanMixed = newest - oldest > 60_000;

  if (untimedCount > 0) {
    const timedPart = timesSpanMixed
      ? `Verified observations from ${formatMoverObservationEt(oldest)} through ${formatMoverObservationEt(newest)}`
      : `Some symbols verified as of ${formatMoverObservationEt(newest)}`;
    return {
      line: `${timedPart}; other symbols lack verified observation times · ${PUBLIC_MARKET_DATA_DELAY_DISCLOSURE}`,
      unavailable: false,
      mixed: true,
      partiallyUntimed: true,
    };
  }

  if (timesSpanMixed) {
    return {
      line: `Observations from ${formatMoverObservationEt(oldest)} through ${formatMoverObservationEt(newest)} · prices vary by symbol · ${PUBLIC_MARKET_DATA_DELAY_DISCLOSURE}`,
      unavailable: false,
      mixed: true,
      partiallyUntimed: false,
    };
  }

  return {
    line: `As of ${formatMoverObservationEt(newest)} · ${PUBLIC_MARKET_DATA_DELAY_DISCLOSURE}`,
    unavailable: false,
    mixed: false,
    partiallyUntimed: false,
  };
}

function universeCopy(universe: MoverUniverseKind): { title: string | null; detail: string | null } {
  if (universe === "tracked_gainers_losers") {
    return { title: MOST_ACTIVE_TRACKED_UNIVERSE_TITLE, detail: MOST_ACTIVE_TRACKED_UNIVERSE_DETAIL };
  }
  if (universe === "top_gainers" || universe === "top_losers") {
    return { title: null, detail: TRACKED_GAINERS_LOSERS_UNIVERSE_DETAIL };
  }
  return { title: null, detail: null };
}

function classifyFreshness(
  sessionSummary: ReturnType<typeof summarizeSessionDates>,
  observation: ReturnType<typeof summarizeListObservationTimes>,
  moverSession: MoverSession,
  nowMs: number,
): MoversObservationFreshness {
  if (sessionSummary.mode === "mixed" || observation.mixed) return "mixed";
  if (observation.unavailable || sessionSummary.mode === "unverified") return "unverified";
  if (sessionSummary.mode === "homogeneous_prior") return "prior_session";
  const clock = resolveMarketSession(new Date(nowMs));
  if (clock === "closed" && moverSession === "regular") return "delayed_snapshot";
  return "current_session";
}

export function summarizeMoversListProvenance(
  movers: CanonicalMover[],
  opts: {
    nowMs?: number;
    universe: MoverUniverseKind;
    moverSession: MoverSession;
    premarket?: boolean;
  },
): MoversListProvenance {
  const nowMs = opts.nowMs ?? Date.now();
  const sessionSummary = summarizeSessionDates(movers, opts.moverSession, nowMs);
  const observation = summarizeListObservationTimes(movers);
  const universe = universeCopy(opts.universe);
  if (opts.premarket) {
    universe.detail = PREMARKET_CANDIDATE_UNIVERSE_DETAIL;
  }
  const freshness = classifyFreshness(sessionSummary, observation, opts.moverSession, nowMs);

  let sessionLine = formatStockHeaderSessionLine(new Date(nowMs));
  if (sessionSummary.mode === "homogeneous_prior" && sessionSummary.dominantDate) {
    sessionLine = `Prior source session · ${sessionSummary.dominantDate} · ${sessionLine}`;
  } else if (sessionSummary.mode === "mixed") {
    sessionLine = `Mixed source sessions · ${sessionLine}`;
  } else if (sessionSummary.mode === "unverified" || hasUnverifiedSessionDate(movers)) {
    sessionLine = `Source session unverified · ${sessionLine}`;
  }

  const isPriorSession = sessionSummary.mode === "homogeneous_prior";

  return {
    sessionLine,
    observationLine: observation.line,
    observationTimeUnavailable: observation.unavailable,
    observationMixed: observation.mixed,
    observationPartiallyUntimed: observation.partiallyUntimed,
    sessionDateMode: sessionSummary.mode,
    universeTitle: universe.title,
    universeDetail: universe.detail,
    delayDisclosure: PUBLIC_MARKET_DATA_DELAY_DISCLOSURE,
    sessionDate: sessionSummary.dominantDate,
    freshness,
    isPriorSession,
  };
}

export function moversFetchErrorMessage(): string {
  return "We couldn't load market movers from the data provider. Try again in a moment.";
}

export function moversSuccessfulEmptyMessage(opts: {
  marketClosed: boolean;
  premarket?: boolean;
}): string {
  if (opts.marketClosed) {
    return "Markets are currently closed. Verified movers for the next session will appear when activity resumes.";
  }
  if (opts.premarket) {
    return "No verified pre-market movers matched our validation rules in the current provider snapshot.";
  }
  return "No verified movers matched our validation rules in the current provider snapshot.";
}

export function delayedMarketMoversSeoDescription(category: string, brandName: string): string {
  return `See ${category} on ${brandName} using ${DELAYED_MARKET_DATA_SEO_PHRASE}. Lists show validated provider snapshots, not every listed stock.`;
}

/** Exported for tests — Friday UTC day bar vs Monday premarket reference. */
export function regularDayBarSessionDate(dayBarMs: number): string {
  return dailyAggregateBarDate(dayBarMs);
}

export function tradingReferenceSessionDate(nowMs: number): string {
  const et = getEtParts(new Date(nowMs));
  return tradingSessionDateForInstant(et.date, et.minutes);
}
