/**
 * Public market-movers observation provenance and honest universe labeling.
 * Wall-clock session text stays separate from provider as-of timestamps.
 */

import {
  PUBLIC_MARKET_DATA_DELAY_DISCLOSURE,
  estTimezoneAbbr,
  formatStockHeaderSessionLine,
  resolveMarketSession,
} from "@/lib/price-utils";
import {
  etSessionDate,
  type CanonicalMover,
  type MoverSession,
} from "./movers-integrity";

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
  | "unverified";

export interface MoversListProvenance {
  sessionLine: string;
  observationLine: string | null;
  observationTimeUnavailable: boolean;
  universeTitle: string | null;
  universeDetail: string | null;
  delayDisclosure: string;
  sessionDate: string | null;
  freshness: MoversObservationFreshness;
  isPriorSession: boolean;
}

function maxProviderAsOf(movers: CanonicalMover[]): string | null {
  let bestMs = 0;
  let bestIso: string | null = null;
  for (const m of movers) {
    const iso = m.provider_as_of;
    if (!iso) continue;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) continue;
    if (ms >= bestMs) {
      bestMs = ms;
      bestIso = iso;
    }
  }
  return bestIso;
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

function formatObservationLine(iso: string | null, nowMs: number): { line: string | null; unavailable: boolean } {
  if (!iso) return { line: null, unavailable: true };
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return { line: null, unavailable: true };
  const tz = estTimezoneAbbr(new Date(nowMs));
  const observed = new Date(ms);
  const line = `As of ${observed.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  })} ${tz} · ${PUBLIC_MARKET_DATA_DELAY_DISCLOSURE}`;
  return { line, unavailable: false };
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
  sessionDate: string | null,
  nowMs: number,
  moverSession: MoverSession,
  hasObservation: boolean,
): MoversObservationFreshness {
  const today = etSessionDate(nowMs);
  if (sessionDate && sessionDate !== today) return "prior_session";
  const clock = resolveMarketSession(new Date(nowMs));
  if (!hasObservation) return "unverified";
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
  const asOf = maxProviderAsOf(movers);
  const { line, unavailable } = formatObservationLine(asOf, nowMs);
  const today = etSessionDate(nowMs);
  const isPriorSession = Boolean(sessionDate && sessionDate !== today);
  const universe = universeCopy(opts.universe);
  if (opts.premarket) {
    universe.detail = PREMARKET_CANDIDATE_UNIVERSE_DETAIL;
  }
  const freshness = classifyFreshness(sessionDate, nowMs, opts.moverSession, !unavailable);
  let sessionLine = formatStockHeaderSessionLine(new Date(nowMs));
  if (isPriorSession && sessionDate) {
    sessionLine = `Prior session · ${sessionDate} · ${sessionLine}`;
  }
  return {
    sessionLine,
    observationLine: line,
    observationTimeUnavailable: unavailable,
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
