// Map volume-first Polygon tickers to screener_results row shapes.
// Legacy rvol / avg_volume are always null — use volume_ratio_prior_session /
// prior_session_volume instead. Float / market_cap remain unavailable.
// 52-week fields and range_event are populated only for New Highs/Lows.

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
import type { NhlClassification, RangeEvent } from "./new-highs-lows.ts";

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
  high_52w: number | null;
  low_52w: number | null;
  range_event: RangeEvent | null;
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
 * Persist prior volume and one-decimal ratio as one optional pair.
 * Derived from persisted integer volumes so a reader recomputing the ratio
 * from the stored volume columns gets the same number back.
 *
 * A tiny positive quotient that rounds to 0.0 is omitted entirely (null/null)
 * rather than writing a zero ratio the database rejects. Never clamp to 0.1.
 */
function persistedPriorRatioPair(
  volume: number | null,
  rawPrior: number | null,
): {
  prior_session_volume: number | null;
  volume_ratio_prior_session: number | null;
} {
  const prior = persistedPriorVolume(rawPrior);
  if (volume === null || !(volume > 0) || prior === null) {
    return { prior_session_volume: null, volume_ratio_prior_session: null };
  }
  const ratio = volume / prior;
  if (!Number.isFinite(ratio) || !(ratio > 0)) {
    return { prior_session_volume: null, volume_ratio_prior_session: null };
  }
  const rounded = Math.round(ratio * 10) / 10;
  if (!(rounded > 0)) {
    return { prior_session_volume: null, volume_ratio_prior_session: null };
  }
  return {
    prior_session_volume: prior,
    volume_ratio_prior_session: rounded,
  };
}

function baseRow(
  tabId: ScreenerTabId | "new_highs_lows",
  t: PolygonTicker,
  getName: NameLookup,
  meta: GenerationMeta,
): ScreenerResultRow {
  const sym = normalizeSymbol(t.ticker)!;
  const vol = persistedVolume(dayVolume(t));
  const { prior_session_volume, volume_ratio_prior_session } =
    persistedPriorRatioPair(vol, priorSessionVolume(t));
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
    range_event: null,
    market_cap: null,
    prior_session_volume,
    volume_ratio_prior_session,
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

export function mapNewHighsLows(
  selected: NhlClassification[],
  getName: NameLookup,
  meta: GenerationMeta,
): ScreenerResultRow[] {
  return selected.map((item) => {
    const row = baseRow("new_highs_lows", item.ticker, getName, meta);
    return {
      ...row,
      gap_percent: null,
      high_52w: item.high_52w,
      low_52w: item.low_52w,
      range_event: item.range_event,
    };
  });
}

export function mapTabRows(
  tabId: Exclude<ScreenerTabId, "new_highs_lows">,
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
