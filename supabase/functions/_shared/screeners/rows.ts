// Map volume-first Polygon tickers to screener_results row shapes.
// Field formulas intentionally unchanged from prior sync (RVOL/avg_volume/float).

import {
  dayVolume,
  gapPercent,
  lastPrice,
  normalizeSymbol,
  type PolygonTicker,
  rvol,
  safeNumber,
  type ScreenerTabId,
} from "./selection.ts";

export type ScreenerResultRow = {
  tab_id: string;
  symbol: string;
  company_name: string;
  price: number | null;
  change_percent: number | null;
  volume: number | null;
  avg_volume: number | null;
  rvol: number | null;
  float_shares: null;
  gap_percent: number | null;
  high_52w: null;
  low_52w: null;
  market_cap: null;
  updated_at: string;
};

export type NameLookup = (symbol: string) => string;

function baseRow(
  tabId: ScreenerTabId,
  t: PolygonTicker,
  getName: NameLookup,
  updatedAt: string,
):
  & Omit<
    ScreenerResultRow,
    "price" | "change_percent" | "avg_volume" | "rvol" | "gap_percent"
  >
  & {
    price: number | null;
    change_percent: number | null;
    avg_volume: number | null;
    rvol: number | null;
    gap_percent: number | null;
  } {
  const sym = normalizeSymbol(t.ticker)!;
  const vol = dayVolume(t);
  return {
    tab_id: tabId,
    symbol: sym,
    company_name: getName(sym),
    price: lastPrice(t),
    change_percent: safeNumber(t.todaysChangePerc),
    volume: vol !== null ? Math.round(vol) : null,
    avg_volume: t?.prevDay?.v != null && Number.isFinite(Number(t.prevDay.v))
      ? Math.round(Number(t.prevDay.v))
      : null,
    rvol: rvol(t),
    float_shares: null,
    gap_percent: gapPercent(t),
    high_52w: null,
    low_52w: null,
    market_cap: null,
    updated_at: updatedAt,
  };
}

export function mapDayTradeRadar(
  selected: PolygonTicker[],
  getName: NameLookup,
  updatedAt: string,
): ScreenerResultRow[] {
  return selected.map((t) => {
    const row = baseRow("day_trade_radar", t, getName, updatedAt);
    return { ...row, gap_percent: null };
  });
}

export function mapGappers(
  selected: PolygonTicker[],
  getName: NameLookup,
  updatedAt: string,
): ScreenerResultRow[] {
  return selected.map((t) => {
    const row = baseRow("gappers", t, getName, updatedAt);
    return { ...row, avg_volume: null, rvol: null, gap_percent: gapPercent(t) };
  });
}

export function mapVolumeSpikes(
  selected: PolygonTicker[],
  getName: NameLookup,
  updatedAt: string,
): ScreenerResultRow[] {
  return selected.map((t) => {
    const row = baseRow("volume_spikes", t, getName, updatedAt);
    return { ...row, price: null, gap_percent: null };
  });
}

export function mapGainersLosers(
  selected: PolygonTicker[],
  getName: NameLookup,
  updatedAt: string,
): ScreenerResultRow[] {
  return selected.map((t) => {
    const row = baseRow("gainers_losers", t, getName, updatedAt);
    return { ...row, avg_volume: null, rvol: null, gap_percent: null };
  });
}

export function mapUnusualVolume(
  selected: PolygonTicker[],
  getName: NameLookup,
  updatedAt: string,
): ScreenerResultRow[] {
  return selected.map((t) => {
    const row = baseRow("unusual_volume", t, getName, updatedAt);
    return { ...row, price: null, change_percent: null, gap_percent: null };
  });
}

export function mapTabRows(
  tabId: ScreenerTabId,
  selected: PolygonTicker[],
  getName: NameLookup,
  updatedAt: string,
): ScreenerResultRow[] {
  switch (tabId) {
    case "day_trade_radar":
      return mapDayTradeRadar(selected, getName, updatedAt);
    case "gappers":
      return mapGappers(selected, getName, updatedAt);
    case "volume_spikes":
      return mapVolumeSpikes(selected, getName, updatedAt);
    case "gainers_losers":
      return mapGainersLosers(selected, getName, updatedAt);
    case "unusual_volume":
      return mapUnusualVolume(selected, getName, updatedAt);
  }
}
