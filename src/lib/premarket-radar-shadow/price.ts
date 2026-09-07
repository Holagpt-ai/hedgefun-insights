import { providerTimestampMs } from "@/lib/market-session";
import { finiteNumber, finitePositive, pctChange } from "./numbers";
import {
  PRICE_FIELD_DIVERGE_PCT,
  QUALITY_CURRENT_MAX_MS,
  QUALITY_DELAYED_MAX_MS,
  type DataQualityFlag,
  type PriceComparison,
  type PriceSource,
  type SnapshotTicker,
} from "./types";

export function prevClose(t: SnapshotTicker): number | null {
  return finitePositive(t.prevDay?.c);
}

export function dayClose(t: SnapshotTicker): number | null {
  return finitePositive(t.day?.c);
}

export function lastTradePrice(t: SnapshotTicker): number | null {
  return finitePositive(t.lastTrade?.p);
}

export function minuteClose(t: SnapshotTicker): number | null {
  return finitePositive(t.min?.c);
}

/** Existing day-session definition: (day.c − prevDay.c) / prevDay.c. */
export function daySessionMovePct(t: SnapshotTicker): number | null {
  return pctChange(dayClose(t), prevClose(t));
}

/** Candidate extended-hours definition: (lastTrade.p − prevDay.c) / prevDay.c. */
export function lastTradeMovePct(t: SnapshotTicker): number | null {
  return pctChange(lastTradePrice(t), prevClose(t));
}

/** Candidate extended-hours definition: (min.c − prevDay.c) / prevDay.c. */
export function minCloseMovePct(t: SnapshotTicker): number | null {
  return pctChange(minuteClose(t), prevClose(t));
}

/**
 * Pre-market display price. Prefers lastTrade.p, then min.c.
 * Never substitutes day.c as the extended-hours price.
 */
export function extendedHoursPrice(t: SnapshotTicker): {
  price: number | null;
  source: PriceSource | null;
} {
  const last = lastTradePrice(t);
  if (last !== null) return { price: last, source: "lastTrade.p" };
  const min = minuteClose(t);
  if (min !== null) return { price: min, source: "min.c" };
  return { price: null, source: null };
}

export function comparePrices(t: SnapshotTicker): PriceComparison {
  const { price, source } = extendedHoursPrice(t);
  const prev = prevClose(t);
  return {
    prevClose: prev,
    dayC: dayClose(t),
    lastTradeP: lastTradePrice(t),
    minC: minuteClose(t),
    todaysChangePerc: finiteNumber(t.todaysChangePerc),
    daySessionMovePct: daySessionMovePct(t),
    lastTradeMovePct: lastTradeMovePct(t),
    minCloseMovePct: minCloseMovePct(t),
    extendedPrice: price,
    extendedPriceSource: source,
    extendedMovePct: pctChange(price, prev),
  };
}

export function snapshotProviderMs(t: SnapshotTicker): number | null {
  return (
    providerTimestampMs(t.updated) ??
    providerTimestampMs(t.lastTrade?.t) ??
    providerTimestampMs(t.min?.t)
  );
}

export function qualityFlags(opts: {
  nowMs: number;
  providerMs: number | null;
  priceComp: PriceComparison;
  missingRequired: boolean;
}): DataQualityFlag[] {
  const flags: DataQualityFlag[] = [];
  if (opts.missingRequired) flags.push("missing");
  if (opts.providerMs === null) {
    if (!flags.includes("missing")) flags.push("missing");
  } else {
    const age = opts.nowMs - opts.providerMs;
    if (age > QUALITY_DELAYED_MAX_MS) flags.push("stale");
    else if (age > QUALITY_CURRENT_MAX_MS) flags.push("delayed");
    else {
      flags.push("current");
      flags.push("fresh");
    }
  }
  const prev = opts.priceComp.prevClose;
  const dayC = opts.priceComp.dayC;
  const last = opts.priceComp.lastTradeP;
  if (prev !== null && prev > 0 && dayC !== null && last !== null) {
    const divergePct = (Math.abs(dayC - last) / prev) * 100;
    if (divergePct > PRICE_FIELD_DIVERGE_PCT) flags.push("provider-ambiguous");
  }
  return flags;
}
