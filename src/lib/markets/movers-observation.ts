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

const BASIS_LABEL: Record<MoverObservationBasis, string> = {
  day_aggregate: "Daily bar",
  minute_aggregate: "Minute bar",
  last_trade: "Last trade",
  extended_feed: "Extended quote",
};

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
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

export function resolvePolygonMoverSourceEvidence(
  session: MoverSession,
  raw: { day?: unknown; min?: unknown; lastTrade?: unknown },
  nowMs: number,
): {
  sessionDate: string | null;
  providerAsOfMs: number | null;
  basis: MoverObservationBasis | null;
  sessionDateUnverified: boolean;
} {
  const day = isPlainObject(raw.day) ? raw.day : {};
  const min = isPlainObject(raw.min) ? raw.min : {};
  const lastTrade = isPlainObject(raw.lastTrade) ? raw.lastTrade : {};

  if (session === "regular") {
    const dayObsMs = polygonSnapshotFieldToMs(day.t, "dayAggregate", nowMs);
    if (dayObsMs !== null) {
      return {
        sessionDate: dailyAggregateBarDate(dayObsMs),
        providerAsOfMs: dayObsMs,
        basis: "day_aggregate",
        sessionDateUnverified: false,
      };
    }
    return {
      sessionDate: null,
      providerAsOfMs: null,
      basis: null,
      sessionDateUnverified: true,
    };
  }

  const lastTradeMs = polygonSnapshotFieldToMs(lastTrade.t, "lastTrade", nowMs);
  const minuteMs =
    polygonSnapshotFieldToMs(min.t, "minAggregate", nowMs)
    ?? polygonSnapshotFieldToMs(min.e, "minAggregate", nowMs);

  const providerAsOfMs = lastTradeMs ?? minuteMs;
  const basis: MoverObservationBasis | null =
    lastTradeMs !== null ? "last_trade" : minuteMs !== null ? "minute_aggregate" : null;

  if (providerAsOfMs === null) {
    return {
      sessionDate: null,
      providerAsOfMs: null,
      basis: null,
      sessionDateUnverified: true,
    };
  }

  return {
    sessionDate: etSessionDate(providerAsOfMs),
    providerAsOfMs,
    basis,
    sessionDateUnverified: false,
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
