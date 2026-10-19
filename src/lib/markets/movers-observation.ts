/**
 * Provider-backed session dates and price observation timestamps for market movers.
 * Never uses browser fetch time or snapshot `updated` as a trade/aggregate observation.
 */

import { getEtParts, tradingSessionDateForInstant } from "@/lib/market-calendar";
import { dailyAggregateBarDate } from "@/lib/etf/snapshot-volume";
import { polygonSnapshotFieldToMs } from "@/lib/market-data/polygon-snapshot-timestamps";
import { PUBLIC_MARKET_DATA_DELAY_DISCLOSURE } from "@/lib/price-utils";
import { etSessionDate, type MoverSession } from "./movers-integrity";

export type MoverObservationBasis = "day_aggregate" | "minute_aggregate" | "last_trade" | "extended_feed";

export type DisplayedPriceSource = "day_close" | "last_trade" | "minute_close";

const BASIS_LABEL: Record<MoverObservationBasis, string> = {
  day_aggregate: "Daily bar",
  minute_aggregate: "Minute bar",
  last_trade: "Last trade",
  extended_feed: "Extended quote",
};

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function positivePrice(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

export function referenceTradingSessionDate(nowMs: number): string {
  const et = getEtParts(new Date(nowMs));
  return tradingSessionDateForInstant(et.date, et.minutes);
}

export function formatMoverObservationEt(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function formatMoverObservationLine(ms: number, basis: MoverObservationBasis): string {
  return `${BASIS_LABEL[basis]} · As of ${formatMoverObservationEt(ms)} · ${PUBLIC_MARKET_DATA_DELAY_DISCLOSURE}`;
}

export function formatMoverObservationUnavailable(basis: MoverObservationBasis): string {
  return `${BASIS_LABEL[basis]} · Observation time unavailable · ${PUBLIC_MARKET_DATA_DELAY_DISCLOSURE}`;
}

/** Which snapshot field supplies the displayed positive price for this session. */
export function resolveDisplayedPriceSource(
  session: MoverSession,
  lastTradePrice: number | null,
  minuteClose: number | null,
  dayClose: number | null,
): DisplayedPriceSource | null {
  if (session === "regular") {
    return positivePrice(dayClose) ? "day_close" : null;
  }
  if (positivePrice(lastTradePrice)) return "last_trade";
  if (positivePrice(minuteClose)) return "minute_close";
  return null;
}

export function resolvePolygonMoverSourceEvidence(
  session: MoverSession,
  raw: { day?: unknown; min?: unknown; lastTrade?: unknown },
  nowMs: number,
  displayed: DisplayedPriceSource | null,
): {
  sessionDate: string | null;
  providerAsOfMs: number | null;
  basis: MoverObservationBasis | null;
  sessionDateUnverified: boolean;
  observationTimeUnavailable: boolean;
} {
  const day = isPlainObject(raw.day) ? raw.day : {};
  const min = isPlainObject(raw.min) ? raw.min : {};
  const lastTrade = isPlainObject(raw.lastTrade) ? raw.lastTrade : {};

  if (displayed === "day_close") {
    const dayObsMs = polygonSnapshotFieldToMs(day.t, "dayAggregate", nowMs);
    if (dayObsMs !== null) {
      return {
        sessionDate: dailyAggregateBarDate(dayObsMs),
        providerAsOfMs: dayObsMs,
        basis: "day_aggregate",
        sessionDateUnverified: false,
        observationTimeUnavailable: false,
      };
    }
    return {
      sessionDate: null,
      providerAsOfMs: null,
      basis: "day_aggregate",
      sessionDateUnverified: true,
      observationTimeUnavailable: true,
    };
  }

  if (displayed === "last_trade") {
    const lastTradeMs = polygonSnapshotFieldToMs(lastTrade.t, "lastTrade", nowMs);
    if (lastTradeMs !== null) {
      return {
        sessionDate: etSessionDate(lastTradeMs),
        providerAsOfMs: lastTradeMs,
        basis: "last_trade",
        sessionDateUnverified: false,
        observationTimeUnavailable: false,
      };
    }
    return {
      sessionDate: null,
      providerAsOfMs: null,
      basis: "last_trade",
      sessionDateUnverified: true,
      observationTimeUnavailable: true,
    };
  }

  if (displayed === "minute_close") {
    const minuteMs =
      polygonSnapshotFieldToMs(min.t, "minAggregate", nowMs)
      ?? polygonSnapshotFieldToMs(min.e, "minAggregate", nowMs);
    if (minuteMs !== null) {
      return {
        sessionDate: etSessionDate(minuteMs),
        providerAsOfMs: minuteMs,
        basis: "minute_aggregate",
        sessionDateUnverified: false,
        observationTimeUnavailable: false,
      };
    }
    return {
      sessionDate: null,
      providerAsOfMs: null,
      basis: "minute_aggregate",
      sessionDateUnverified: true,
      observationTimeUnavailable: true,
    };
  }

  return {
    sessionDate: null,
    providerAsOfMs: null,
    basis: null,
    sessionDateUnverified: true,
    observationTimeUnavailable: true,
  };
}

export function isPriorRegularDayBar(dayBarMs: number, nowMs: number): boolean {
  const observationSessionDate = dailyAggregateBarDate(dayBarMs);
  return observationSessionDate !== referenceTradingSessionDate(nowMs);
}

export function observationMsFromIso(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}
