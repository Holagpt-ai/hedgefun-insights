// Derived Watchlist display metrics — never fabricate; null means unavailable.

import type { V2Row } from "@/hooks/useWatchlistV2";
import type { EarningsBadge } from "@/lib/watchlist-v2/earnings";
import { isEarningsWithin7Days } from "@/lib/watchlist-v2/earnings";

export type WatchlistFilter =
  | "all"
  | "movers"
  | "advancing"
  | "declining"
  | "high_volume"
  | "earnings"
  | "catalysts"
  | "near_hod"
  | "data_unavailable";

export type WatchlistSort =
  | "added"
  | "volume"
  | "rvol"
  | "change_pct"
  | "earnings"
  | "symbol";

export type WatchlistDensity = "comfortable" | "compact" | "terminal";

export const DENSITY_STORAGE_KEY = "watchlist-density";

export function parseDensity(raw: string | null | undefined): WatchlistDensity {
  if (raw === "comfortable" || raw === "compact" || raw === "terminal") return raw;
  return "compact";
}

/** Material density tokens — padding, gaps, chart height, metadata visibility. */
export function densityTokens(d: WatchlistDensity) {
  switch (d) {
    case "comfortable":
      return {
        rowPad: "p-3.5 sm:p-4",
        rowGap: "gap-3 sm:gap-3.5",
        listGap: "space-y-3",
        chartH: 52,
        drawerPad: "p-4 sm:p-5",
        drawerGap: "gap-4",
        showSecondaryMeta: true,
        showDollarMove: true,
        showUpdatedLine: true,
        showRvolMeter: true,
        controlSize: "h-9 w-9",
        tickerClass: "text-base",
        priceClass: "text-lg",
        changeClass: "text-sm",
      };
    case "terminal":
      return {
        rowPad: "p-2 sm:p-2",
        rowGap: "gap-1.5 sm:gap-2",
        listGap: "space-y-1",
        chartH: 28,
        drawerPad: "p-2.5 sm:p-3",
        drawerGap: "gap-2.5",
        showSecondaryMeta: false,
        showDollarMove: false,
        showUpdatedLine: false,
        showRvolMeter: false,
        controlSize: "h-7 w-7",
        tickerClass: "text-sm",
        priceClass: "text-sm",
        changeClass: "text-xs",
      };
    case "compact":
    default:
      return {
        rowPad: "p-2.5 sm:p-3",
        rowGap: "gap-2 sm:gap-2.5",
        listGap: "space-y-1.5",
        chartH: 40,
        drawerPad: "p-3 sm:p-3.5",
        drawerGap: "gap-3",
        showSecondaryMeta: true,
        showDollarMove: true,
        showUpdatedLine: true,
        showRvolMeter: true,
        controlSize: "h-8 w-8",
        tickerClass: "text-sm",
        priceClass: "text-base",
        changeClass: "text-sm",
      };
  }
}

/** Near HOD: within 2% of session high when both price and HOD are valid. */
export const NEAR_HOD_PCT = 0.02;

/** Mover: |% change| ≥ 2 when changePct is available. */
export const MOVER_PCT = 2;

export function dollarMove(row: V2Row): number | null {
  const prior = row.keyLevels.prior_close;
  if (row.price === null || prior === null || prior <= 0) return null;
  return row.price - prior;
}

export function vwapDistance(row: V2Row): { dollars: number; pct: number } | null {
  const vwap = row.keyLevels.vwap;
  if (row.price === null || vwap === null || vwap <= 0) return null;
  const dollars = row.price - vwap;
  return { dollars, pct: (dollars / vwap) * 100 };
}

export function rangePosition(row: V2Row): number | null {
  const { hod, lod } = row.keyLevels;
  if (row.price === null || hod === null || lod === null) return null;
  const span = hod - lod;
  if (span <= 0) return null;
  return (row.price - lod) / span;
}

export function isNearHod(row: V2Row): boolean | null {
  const { hod } = row.keyLevels;
  if (row.price === null || hod === null || hod <= 0) return null;
  return (hod - row.price) / hod <= NEAR_HOD_PCT;
}

export function dollarVolume(row: V2Row): number | null {
  if (row.price === null || row.volume === null) return null;
  if (row.price <= 0 || row.volume < 0) return null;
  return row.price * row.volume;
}

export function isMover(row: V2Row): boolean | null {
  if (row.changePct === null) return null;
  return Math.abs(row.changePct) >= MOVER_PCT;
}

export function isHighVolume(row: V2Row): boolean | null {
  if (row.rvolClass === "elevated" || row.rvolClass === "unusual") return true;
  if (row.rvol !== null && Number.isFinite(row.rvol)) return row.rvol >= 1.5;
  if (row.rvol === null && row.inputsQuality.rvol) return null;
  return null;
}

export function hasFreshCatalyst(row: V2Row): boolean {
  return row.hasV2 && row.recentEvents.length > 0;
}

export function isDataUnavailable(row: V2Row): boolean {
  return !row.hasV2 || row.direction === "data_unavailable";
}

export interface SummaryMetric {
  key: WatchlistFilter | "advancing" | "declining" | "high_rvol" | "earnings_7d" | "fresh_catalysts";
  label: string;
  /** null → display "—"; number is an honest count of evaluable matches. */
  value: number | null;
  filter?: WatchlistFilter;
}

export function computeSummaryMetrics(
  rows: V2Row[],
  earningsBySymbol: Map<string, EarningsBadge>,
): SummaryMetric[] {
  const advancingEval = rows.filter((r) => r.changePct !== null);
  const decliningEval = advancingEval;
  const rvolEval = rows.filter(
    (r) => r.rvol !== null || r.rvolClass !== null || !!r.inputsQuality.rvol,
  );
  const nearHodEval = rows.filter((r) => isNearHod(r) !== null);
  const earningsEval = rows.length > 0 ? rows : [];
  const catalystEval = rows.filter((r) => r.hasV2);

  const advancing =
    advancingEval.length === 0
      ? null
      : advancingEval.filter((r) => (r.changePct as number) > 0).length;
  const declining =
    decliningEval.length === 0
      ? null
      : decliningEval.filter((r) => (r.changePct as number) < 0).length;
  const highRvol =
    rvolEval.length === 0
      ? null
      : rows.filter((r) => r.rvolClass === "elevated" || r.rvolClass === "unusual").length;
  const nearHod =
    nearHodEval.length === 0
      ? null
      : nearHodEval.filter((r) => isNearHod(r) === true).length;
  const earnings7d =
    earningsEval.length === 0
      ? null
      : rows.filter((r) =>
          isEarningsWithin7Days(earningsBySymbol.get(r.ticker.toUpperCase())),
        ).length;
  const freshCatalysts =
    catalystEval.length === 0
      ? null
      : catalystEval.filter(hasFreshCatalyst).length;

  return [
    { key: "advancing", label: "Advancing", value: advancing, filter: "advancing" },
    { key: "declining", label: "Declining", value: declining, filter: "declining" },
    { key: "high_rvol", label: "High RVOL", value: highRvol, filter: "high_volume" },
    { key: "near_hod", label: "Near HOD", value: nearHod, filter: "near_hod" },
    { key: "earnings_7d", label: "Earnings Within 7 Days", value: earnings7d, filter: "earnings" },
    { key: "fresh_catalysts", label: "Fresh Verified Catalysts", value: freshCatalysts, filter: "catalysts" },
  ];
}

export function rowMatchesFilter(
  row: V2Row,
  filter: WatchlistFilter,
  earningsBySymbol: Map<string, EarningsBadge>,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "movers":
      return isMover(row) === true;
    case "advancing":
      return row.changePct !== null && row.changePct > 0;
    case "declining":
      return row.changePct !== null && row.changePct < 0;
    case "high_volume":
      return isHighVolume(row) === true;
    case "earnings": {
      const b = earningsBySymbol.get(row.ticker.toUpperCase());
      return !!b;
    }
    case "catalysts":
      return hasFreshCatalyst(row);
    case "near_hod":
      return isNearHod(row) === true;
    case "data_unavailable":
      return isDataUnavailable(row);
    default:
      return true;
  }
}

export function sortRows(
  rows: V2Row[],
  sort: WatchlistSort,
  earningsBySymbol: Map<string, EarningsBadge>,
): V2Row[] {
  if (sort === "added") return rows; // preserve hook order (added_at desc)

  const copy = [...rows];
  /** Unavailable values sort after evaluable; equal values use stable ticker tiebreak. */
  const nullsLast = (a: number | null, b: number | null) => {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return b - a; // desc by default for numeric
  };

  copy.sort((a, b) => {
    let cmp = 0;
    switch (sort) {
      case "volume":
        cmp = nullsLast(a.volume, b.volume);
        break;
      case "rvol":
        cmp = nullsLast(a.rvol, b.rvol);
        break;
      case "change_pct":
        cmp = nullsLast(a.changePct, b.changePct);
        break;
      case "earnings": {
        const ea = earningsBySymbol.get(a.ticker.toUpperCase());
        const eb = earningsBySymbol.get(b.ticker.toUpperCase());
        if (!ea && !eb) cmp = 0;
        else if (!ea) cmp = 1;
        else if (!eb) cmp = -1;
        else if (ea.kind !== eb.kind) cmp = ea.kind === "upcoming" ? -1 : 1;
        else if (ea.kind === "upcoming") cmp = ea.sortMs - eb.sortMs;
        else cmp = eb.sortMs - ea.sortMs;
        break;
      }
      case "symbol":
        cmp = a.ticker.localeCompare(b.ticker);
        break;
      default:
        cmp = 0;
    }
    return cmp || a.ticker.localeCompare(b.ticker);
  });
  return copy;
}

/** Current US equity session label from ET clock (header disclosure). */
export function currentMarketSessionLabel(nowMs: number = Date.now()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date(nowMs));
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const mins = hour * 60 + minute;

  if (weekday === "Sat" || weekday === "Sun") return "Weekend · Market closed";
  // Pre-market 4:00–9:30 ET
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return "Pre-market";
  // RTH 9:30–16:00 ET
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return "Regular hours";
  // After-hours 16:00–20:00 ET
  if (mins >= 16 * 60 && mins < 20 * 60) return "After-hours";
  return "Market closed";
}

export function rvolIntensityTier(rvol: number | null): "pending" | "normal" | "elevated" | "unusual" | "na" {
  if (rvol === null) return "na";
  if (rvol >= 3) return "unusual";
  if (rvol >= 1.5) return "elevated";
  return "normal";
}
