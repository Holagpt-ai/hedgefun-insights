/**
 * ETF header quote states.
 * Wall-clock session text and the provider observation time stay separate.
 */

import { getEtParts } from "@/lib/market-calendar";
import { polygonSnapshotFieldToMs } from "@/lib/market-data/polygon-snapshot-timestamps";
import {
  formatPriceObservationTime,
  formatStockHeaderSessionLine,
  PUBLIC_MARKET_DATA_DELAY_DISCLOSURE,
  resolveMarketSession,
  resolveStockHeaderPriceState,
  stockHeaderPriceSourceLabel,
  stockHeaderSessionContext,
  type StockHeaderTimestampSource,
} from "@/lib/price-utils";

export type EtfQuotePresentation =
  | { status: "loading" }
  | { status: "error"; message: string; delayDisclosure: string }
  | { status: "unavailable"; message: string; delayDisclosure: string }
  | {
      status: "snapshot";
      price: number;
      change: number | null;
      changePercent: number | null;
      sessionLine: string;
      sessionContext: string | null;
      observationLine: string | null;
      sourceLabel: string | null;
      priorSession: boolean;
      delayDisclosure: string;
    }
  | {
      status: "database_fallback";
      price: number;
      detail: string;
      delayDisclosure: string;
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function finitePrice(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || !(value > 0)) return null;
  return value;
}

function observationMs(
  snapshot: unknown,
  source: StockHeaderTimestampSource,
  now: Date,
): number | null {
  if (!source) return null;
  const tick = asRecord(snapshot);
  if (!tick) return null;
  const nowMs = now.getTime();
  if (source === "lastTrade") {
    return polygonSnapshotFieldToMs(asRecord(tick.lastTrade)?.t, "lastTrade", nowMs);
  }
  if (source === "min") {
    const min = asRecord(tick.min);
    return (
      polygonSnapshotFieldToMs(min?.t, "minAggregate", nowMs)
      ?? polygonSnapshotFieldToMs(min?.e, "minAggregate", nowMs)
    );
  }
  if (source === "day") return polygonSnapshotFieldToMs(asRecord(tick.day)?.t, "dayAggregate", nowMs);
  return polygonSnapshotFieldToMs(asRecord(tick.prevDay)?.t, "prevDayAggregate", nowMs);
}

export function formatDatabaseRecordTime(updatedAt: string | null, now = new Date()): string | null {
  if (!updatedAt) return null;
  const ms = Date.parse(updatedAt);
  if (!Number.isFinite(ms)) return null;
  if (ms > now.getTime() + 5 * 60_000) return null;
  return new Date(ms).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function databaseDetail(providerFailed: boolean, updatedAt: string | null, now: Date): string {
  const recordTime = formatDatabaseRecordTime(updatedAt, now);
  const freshness = recordTime
    ? `record updated ${recordTime}`
    : "observation time unavailable";
  const prefix = providerFailed ? "Provider quote unavailable. " : "";
  return `${prefix}Database price · not a live quote · ${freshness}`;
}

function snapshotMove(
  snapshot: unknown,
  basis: string,
  headerChange: number | null,
  headerPercent: number | null,
): { change: number; changePercent: number } | null {
  if (basis === "extended_vs_prior_close" || basis === "extended_vs_regular_close") {
    if (
      headerChange === null
      || headerPercent === null
      || !Number.isFinite(headerChange)
      || !Number.isFinite(headerPercent)
    ) {
      return null;
    }
    return { change: headerChange, changePercent: headerPercent };
  }
  const tick = asRecord(snapshot);
  const change = tick?.todaysChange;
  const changePercent = tick?.todaysChangePerc;
  if (typeof change !== "number" || typeof changePercent !== "number") return null;
  if (!Number.isFinite(change) || !Number.isFinite(changePercent)) return null;
  return { change, changePercent };
}

export function presentEtfQuote(input: {
  snapshotStatus: "pending" | "error" | "success";
  snapshot: unknown;
  databasePrice: number | null;
  databaseUpdatedAt: string | null;
  now?: Date;
}): EtfQuotePresentation {
  const now = input.now ?? new Date();
  const delayDisclosure = PUBLIC_MARKET_DATA_DELAY_DISCLOSURE;
  if (input.snapshotStatus === "pending") return { status: "loading" };

  const dbPrice = finitePrice(input.databasePrice);
  const session = resolveMarketSession(now);
  const header = input.snapshotStatus === "success"
    ? resolveStockHeaderPriceState(input.snapshot, session)
    : null;
  const snapshotPrice = header ? finitePrice(header.displayedPrice) : null;

  if (snapshotPrice !== null && header) {
    const move = snapshotMove(input.snapshot, header.basis, header.change, header.changePercent);
    const observedMs = observationMs(input.snapshot, header.timestampSource, now);
    const today = getEtParts(now).date;
    const observedDate = observedMs === null || !header.timestampSource
      ? null
      : header.timestampSource === "day" || header.timestampSource === "prevDay"
        ? new Date(observedMs).toISOString().slice(0, 10)
        : getEtParts(new Date(observedMs)).date;
    const priorSession = header.timestampSource === "prevDay" || (observedDate !== null && observedDate < today);
    return {
      status: "snapshot",
      price: snapshotPrice,
      change: move?.change ?? null,
      changePercent: move?.changePercent ?? null,
      sessionLine: formatStockHeaderSessionLine(now),
      sessionContext: stockHeaderSessionContext(header),
      observationLine: formatPriceObservationTime(input.snapshot, header.timestampSource, now),
      sourceLabel: stockHeaderPriceSourceLabel(header.timestampSource),
      priorSession,
      delayDisclosure,
    };
  }

  if (dbPrice !== null) {
    return {
      status: "database_fallback",
      price: dbPrice,
      detail: databaseDetail(input.snapshotStatus === "error", input.databaseUpdatedAt, now),
      delayDisclosure,
    };
  }

  if (input.snapshotStatus === "error") {
    return { status: "error", message: "Market data unavailable", delayDisclosure };
  }
  return { status: "unavailable", message: "Quote unavailable", delayDisclosure };
}
