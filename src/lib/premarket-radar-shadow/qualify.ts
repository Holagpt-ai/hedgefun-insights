/**
 * Production Day-Trade Radar filters (copied, not imported from Deno)
 * vs pre-market shadow filters. Production qualification is not modified.
 */

import {
  DAY_TRADE_MOVE_MIN_PCT,
  DAY_TRADE_PRICE_MAX,
  DAY_TRADE_PRICE_MIN,
  DAY_TRADE_PRIOR_RATIO_MIN,
  type PriceComparison,
  type ProductionExclusionReason,
  type SnapshotTicker,
  type VolumeComparison,
} from "./types";
import { dayClose, daySessionMovePct, extendedHoursPrice } from "./price";
import { priorSessionRatio } from "./volume";
import { normalizeSymbol } from "./numbers";

export type DayTradeQualify = {
  ok: boolean;
  symbol: string;
  price: number | null;
  movePct: number | null;
  ratio: number | null;
  reasons: string[];
};

/**
 * Exact production Day-Trade Radar rule:
 * day.c in $2–$20, (day.c − prevDay.c)/prevDay.c ≥ 10%, day.v/prevDay.v ≥ 5.
 */
export function qualifyDayTradeRadar(t: SnapshotTicker): DayTradeQualify {
  const symbol = normalizeSymbol(t.ticker) ?? "UNKNOWN";
  const price = dayClose(t);
  const movePct = daySessionMovePct(t);
  const ratio = priorSessionRatio(t);
  const reasons: string[] = [];
  if (price === null) reasons.push("missing day.c (production price)");
  if (movePct === null) reasons.push("missing day-session move (day.c / prevDay.c)");
  if (ratio === null) reasons.push("missing prior-session volume ratio (day.v / prevDay.v)");
  if (price !== null && (price < DAY_TRADE_PRICE_MIN || price > DAY_TRADE_PRICE_MAX)) {
    reasons.push(
      `price_band: day.c=${price} is outside $${DAY_TRADE_PRICE_MIN}–$${DAY_TRADE_PRICE_MAX}`,
    );
  }
  if (movePct !== null && movePct < DAY_TRADE_MOVE_MIN_PCT) {
    reasons.push(
      `day.c move=${movePct.toFixed(2)}% is below ${DAY_TRADE_MOVE_MIN_PCT}%`,
    );
  }
  if (ratio !== null && ratio < DAY_TRADE_PRIOR_RATIO_MIN) {
    reasons.push(
      `prior-session ratio=${ratio.toFixed(2)}x is below ${DAY_TRADE_PRIOR_RATIO_MIN}x`,
    );
  }
  const ok =
    price !== null &&
    movePct !== null &&
    ratio !== null &&
    price >= DAY_TRADE_PRICE_MIN &&
    price <= DAY_TRADE_PRICE_MAX &&
    movePct >= DAY_TRADE_MOVE_MIN_PCT &&
    ratio >= DAY_TRADE_PRIOR_RATIO_MIN;
  return { ok, symbol, price, movePct, ratio, reasons };
}

export type ShadowQualify = {
  ok: boolean;
  reasons: string[];
};

/**
 * Shadow list B: same nominal $2–$20 / ≥10% bounds, using extended-hours
 * price and bar-derived pre-market cumulative volume. Prior-session ratio
 * is NOT required.
 */
export function qualifyPremarketShadow(opts: {
  ticker: SnapshotTicker;
  priceComp: PriceComparison;
  volumeComp: VolumeComparison;
}): ShadowQualify {
  const reasons: string[] = [];
  const { price } = extendedHoursPrice(opts.ticker);
  const move = opts.priceComp.extendedMovePct;
  const vol = opts.volumeComp.barCumulative;
  if (price === null) reasons.push("missing extended-hours price (lastTrade.p and min.c)");
  if (move === null) reasons.push("missing extended-hours move vs prevDay.c");
  if (vol === null) reasons.push("missing bar-derived pre-market cumulative volume");
  if (vol !== null && !(vol > 0)) reasons.push("bar-derived pre-market volume is not positive");
  if (price !== null && (price < DAY_TRADE_PRICE_MIN || price > DAY_TRADE_PRICE_MAX)) {
    reasons.push(
      `shadow price_band: ${price} is outside $${DAY_TRADE_PRICE_MIN}–$${DAY_TRADE_PRICE_MAX}`,
    );
  }
  if (move !== null && move < DAY_TRADE_MOVE_MIN_PCT) {
    reasons.push(`extended-hours move=${move.toFixed(2)}% is below ${DAY_TRADE_MOVE_MIN_PCT}%`);
  }
  const ok =
    price !== null &&
    move !== null &&
    vol !== null &&
    vol > 0 &&
    price >= DAY_TRADE_PRICE_MIN &&
    price <= DAY_TRADE_PRICE_MAX &&
    move >= DAY_TRADE_MOVE_MIN_PCT;
  return { ok, reasons };
}

export function productionExclusion(
  symbol: string,
  dtr: DayTradeQualify,
  priceComp: PriceComparison,
): ProductionExclusionReason {
  const lostToPriorSessionRatioOnly =
    !dtr.ok &&
    dtr.price !== null &&
    dtr.price >= DAY_TRADE_PRICE_MIN &&
    dtr.price <= DAY_TRADE_PRICE_MAX &&
    dtr.movePct !== null &&
    dtr.movePct >= DAY_TRADE_MOVE_MIN_PCT &&
    (dtr.ratio === null || dtr.ratio < DAY_TRADE_PRIOR_RATIO_MIN);

  const extra: string[] = [];
  if (
    priceComp.daySessionMovePct !== null &&
    priceComp.extendedMovePct !== null &&
    priceComp.daySessionMovePct < DAY_TRADE_MOVE_MIN_PCT &&
    priceComp.extendedMovePct >= DAY_TRADE_MOVE_MIN_PCT
  ) {
    extra.push(
      `existing day.c move=${priceComp.daySessionMovePct.toFixed(2)}% while last extended-hours price move=${priceComp.extendedMovePct.toFixed(2)}%`,
    );
  }
  const reasons = [...dtr.reasons, ...extra];
  const summary =
    reasons.length === 0
      ? `${symbol} — excluded by current Day-Trade Radar filters`
      : `${symbol} — excluded because ${reasons.join("; ")}`;
  return {
    symbol,
    reasons,
    summary,
    lostToPriorSessionRatioOnly,
  };
}
