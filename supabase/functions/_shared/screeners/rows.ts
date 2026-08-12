// Map volume-first Polygon tickers to screener_results row shapes.
// Legacy rvol / avg_volume are always null — use volume_ratio_prior_session /
// prior_session_volume instead. Float / market_cap / 52w remain unavailable.

import {
  dayHighLow,
  dayVolume,
  gapPercent,
  normalizeSymbol,
  parseProviderAsOf,
  type PolygonTicker,
  priorSessionVolume,
  regularChangePercent,
  regularClose,
  type ScreenerTabId,
} from "./selection.ts";

export type ScreenerResultRow = {
  tab_id: string;
  symbol: string;
  company_name: string;
  price: number | null;
  change_percent: number | null;
  volume: number | null;
  /** Legacy — always null in new generations. */
  avg_volume: null;
  /** Legacy — always null in new generations. */
  rvol: null;
  float_shares: null;
  gap_percent: number | null;
  high_52w: null;
  low_52w: null;
  market_cap: null;
  prior_session_volume: number | null;
  volume_ratio_prior_session: number | null;
  day_high: number | null;
  day_low: number | null;
  provider_as_of: string;
  sync_run_id: string;
  updated_at: string;
};

export type NameLookup = (symbol: string) => string;

export type GenerationMeta = {
  syncedAt: string;
  syncRunId: string;
  nowMs: number;
};

/** Volume columns persist as integers. */
function persistedVolume(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

/**
 * Prior-session volume keeps the positive-value requirement after rounding so
 * the prior/ratio pair is never half-populated.
 */
function persistedPriorVolume(value: number | null): number | null {
  const rounded = persistedVolume(value);
  return rounded !== null && rounded > 0 ? rounded : null;
}

/**
 * Derived from the persisted integer volumes rather than the raw provider
 * values, so a reader recomputing the ratio from the stored volume columns
 * gets the same number back. Same rounding as the raw metric: one decimal.
 */
function persistedVolumeRatio(
  volume: number | null,
  prior: number | null,
): number | null {
  if (volume === null || !(volume > 0) || prior === null) return null;
  const ratio = volume / prior;
  if (!Number.isFinite(ratio) || !(ratio > 0)) return null;
  return Math.round(ratio * 10) / 10;
}

function baseRow(
  tabId: ScreenerTabId,
  t: PolygonTicker,
  getName: NameLookup,
  meta: GenerationMeta,
): ScreenerResultRow {
  const sym = normalizeSymbol(t.ticker)!;
  const vol = persistedVolume(dayVolume(t));
  const priorVol = persistedPriorVolume(priorSessionVolume(t));
  const ratio = persistedVolumeRatio(vol, priorVol);
  const range = dayHighLow(t);
  const providerAsOf = parseProviderAsOf(t.updated, meta.nowMs);
  if (providerAsOf === null) {
    throw new Error("provider_freshness_unavailable");
  }
  // Day-session contract: price and change_percent both from regular session.
  // Never pair day.c with todaysChangePerc.
  return {
    tab_id: tabId,
    symbol: sym,
    company_name: getName(sym),
    price: regularClose(t),
    change_percent: regularChangePercent(t),
    volume: vol,
    avg_volume: null,
    rvol: null,
    float_shares: null,
    gap_percent: gapPercent(t),
    high_52w: null,
    low_52w: null,
    market_cap: null,
    prior_session_volume: priorVol,
    volume_ratio_prior_session: ratio,
    day_high: range.high,
    day_low: range.low,
    provider_as_of: providerAsOf,
    sync_run_id: meta.syncRunId,
    updated_at: meta.syncedAt,
  };
}

export function mapDayTradeRadar(
  selected: PolygonTicker[],
  getName: NameLookup,
  meta: GenerationMeta,
): ScreenerResultRow[] {
  return selected.map((t) => {
    const row = baseRow("day_trade_radar", t, getName, meta);
    return { ...row, gap_percent: null };
  });
}

export function mapGappers(
  selected: PolygonTicker[],
  getName: NameLookup,
  meta: GenerationMeta,
): ScreenerResultRow[] {
  return selected.map((t) => {
    const row = baseRow("gappers", t, getName, meta);
    return { ...row, gap_percent: gapPercent(t) };
  });
}

export function mapVolumeSpikes(
  selected: PolygonTicker[],
  getName: NameLookup,
  meta: GenerationMeta,
): ScreenerResultRow[] {
  return selected.map((t) => {
    const row = baseRow("volume_spikes", t, getName, meta);
    return { ...row, gap_percent: null };
  });
}

export function mapGainersLosers(
  selected: PolygonTicker[],
  getName: NameLookup,
  meta: GenerationMeta,
): ScreenerResultRow[] {
  return selected.map((t) => {
    const row = baseRow("gainers_losers", t, getName, meta);
    return { ...row, gap_percent: null };
  });
}

export function mapUnusualVolume(
  selected: PolygonTicker[],
  getName: NameLookup,
  meta: GenerationMeta,
): ScreenerResultRow[] {
  return selected.map((t) => {
    const row = baseRow("unusual_volume", t, getName, meta);
    return { ...row, gap_percent: null };
  });
}

export function mapTabRows(
  tabId: ScreenerTabId,
  selected: PolygonTicker[],
  getName: NameLookup,
  meta: GenerationMeta,
): ScreenerResultRow[] {
  switch (tabId) {
    case "day_trade_radar":
      return mapDayTradeRadar(selected, getName, meta);
    case "gappers":
      return mapGappers(selected, getName, meta);
    case "volume_spikes":
      return mapVolumeSpikes(selected, getName, meta);
    case "gainers_losers":
      return mapGainersLosers(selected, getName, meta);
    case "unusual_volume":
      return mapUnusualVolume(selected, getName, meta);
  }
}
