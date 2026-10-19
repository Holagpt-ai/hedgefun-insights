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

export interface MoversListProvenance {
  sessionLine: string;
  observationLine: string | null;
  observationTimeUnavailable: boolean;
  observationMixed: boolean;
  universeTitle: string | null;
  universeDetail: string | null;
  delayDisclosure: string;
  sessionDate: string | null;
  freshness: MoversObservationFreshness;
  isPriorSession: boolean;
}

function dominantSessionDate(movers: CanonicalMover[]): string | null {
  const counts = new Map<string, number>();
  for (const m of movers) {
    if (!m.session_date) continue;
    counts.set(m.session_date, (counts.get(m.session_date) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [date, count] of counts) {
    if (count > bestCount) {
      best = date;
      bestCount = count;
    }
  }
  return best;
}

function hasUnverifiedSessionDate(movers: CanonicalMover[]): boolean {
  return movers.some((m) => m.valid && m.session_date_unverified);
}

function listHasPriorRegularEvidence(movers: CanonicalMover[], nowMs: number): boolean {
  const reference = referenceTradingSessionDate(nowMs);
  for (const m of movers) {
    if (!m.valid) continue;
    if (m.session === "regular" && m.session_date && m.session_date !== reference) return true;
    if (m.session !== "regular" && m.session_date) {
      const etToday = etSessionDate(nowMs);
      if (m.session_date !== etToday) return true;
    }
  }
  return false;
}

export function summarizeListObservationTimes(
  movers: CanonicalMover[],
): { line: string | null; unavailable: boolean; mixed: boolean } {
  const timed: number[] = [];
  for (const m of movers) {
    if (!m.valid) continue;
    const ms = observationMsFromIso(m.provider_as_of);
    if (ms !== null) timed.push(ms);
  }
  if (timed.length === 0) {
    return { line: null, unavailable: true, mixed: false };
  }
  timed.sort((a, b) => a - b);
  const oldest = timed[0];
  const newest = timed[timed.length - 1];
  const allSame = newest - oldest <= 60_000;
  if (allSame) {
    return {
      line: `As of ${formatMoverObservationEt(newest)} · ${PUBLIC_MARKET_DATA_DELAY_DISCLOSURE}`,
      unavailable: false,
      mixed: false,
    };
  }
  return {
    line: `Observations from ${formatMoverObservationEt(oldest)} through ${formatMoverObservationEt(newest)} · prices vary by symbol · ${PUBLIC_MARKET_DATA_DELAY_DISCLOSURE}`,
    unavailable: false,
    mixed: true,
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
  movers: CanonicalMover[],
  nowMs: number,
  moverSession: MoverSession,
  observation: { unavailable: boolean; mixed: boolean },
): MoversObservationFreshness {
  if (observation.mixed) return "mixed";
  if (listHasPriorRegularEvidence(movers, nowMs)) return "prior_session";
  if (observation.unavailable || hasUnverifiedSessionDate(movers)) return "unverified";
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
  const sessionDate = dominantSessionDate(movers);
  const observation = summarizeListObservationTimes(movers);
  const reference = referenceTradingSessionDate(nowMs);
  const isPriorSession = listHasPriorRegularEvidence(movers, nowMs)
    || Boolean(sessionDate && sessionDate !== reference && opts.moverSession === "regular");
  const universe = universeCopy(opts.universe);
  if (opts.premarket) {
    universe.detail = PREMARKET_CANDIDATE_UNIVERSE_DETAIL;
  }
  const freshness = classifyFreshness(movers, nowMs, opts.moverSession, observation);
  let sessionLine = formatStockHeaderSessionLine(new Date(nowMs));
  if (isPriorSession && sessionDate) {
    sessionLine = `Prior source session · ${sessionDate} · ${sessionLine}`;
  } else if (hasUnverifiedSessionDate(movers)) {
    sessionLine = `Source session unverified · ${sessionLine}`;
  }
  return {
    sessionLine,
    observationLine: observation.line,
    observationTimeUnavailable: observation.unavailable,
    observationMixed: observation.mixed,
    universeTitle: universe.title,
    universeDetail: universe.detail,
    delayDisclosure: PUBLIC_MARKET_DATA_DELAY_DISCLOSURE,
    sessionDate,
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
