import { PUBLIC_MARKET_DATA_DELAY_DISCLOSURE } from "@/lib/price-utils";

export type TrendingTableRow = {
  symbol: string;
  name: string;
  market_cap: number | null;
  change_percent: number | null;
  volume: number | null;
  data_updated_at: string | null;
};

export type TrendingStockDbRow = {
  symbol: string;
  name: string;
  market_cap: number | null;
  change_percent: number | null;
  volume: number | null;
  updated_at: string | null;
};

/** Table heading when rows are ordered by reported volume (not visitor analytics). */
export const TRENDING_VOLUME_RANK_SECTION_TITLE = "Highest reported volume";

export const TRENDING_EMPTY_MESSAGE =
  "Volume-ranked trending data is unavailable right now. Try again later or use the stock screener.";

export const TRENDING_ERROR_MESSAGE =
  "We could not load volume-ranked stocks from the database. Try again later.";

export function mapTrendingStockRows(
  data: TrendingStockDbRow[] | null | undefined,
): TrendingTableRow[] | null {
  if (!data?.length) return null;
  return data.map((s) => ({
    symbol: s.symbol,
    name: s.name,
    market_cap: s.market_cap,
    change_percent: s.change_percent,
    volume: s.volume,
    data_updated_at: s.updated_at,
  }));
}

export function latestTrendingDataTimestamp(rows: TrendingTableRow[] | null | undefined): string | null {
  if (!rows?.length) return null;
  let max: string | null = null;
  for (const row of rows) {
    const ts = row.data_updated_at;
    if (ts && (!max || ts > max)) max = ts;
  }
  return max;
}

function formatEasternRowUpdate(iso: string): { stamp: string; tzLabel: string } | null {
  const when = new Date(iso);
  if (!Number.isFinite(when.getTime())) return null;
  const stamp = when.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  });
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).formatToParts(when);
  const rawTz = parts.find((p) => p.type === "timeZoneName")?.value ?? "ET";
  const tzLabel = rawTz === "EST" || rawTz === "EDT" ? rawTz : "ET";
  return { stamp, tzLabel };
}

export function formatTrendingDataFootnote(latestUpdatedAt: string | null): string {
  const delay = PUBLIC_MARKET_DATA_DELAY_DISCLOSURE.toLowerCase();
  const ranking = "Sorted by reported share volume from the Stocksist stocks database (not site visitor analytics).";
  const fields = `% change, volume, and market cap use ${delay} when present; missing values show as —.`;
  if (!latestUpdatedAt) {
    return `${ranking} ${fields}`;
  }
  const eastern = formatEasternRowUpdate(latestUpdatedAt);
  if (!eastern) {
    return `${ranking} ${fields}`;
  }
  return `${ranking} Newest row update: ${eastern.stamp} ${eastern.tzLabel}. ${fields}`;
}

export function trendingPageSeoTitle(brandName: string): string {
  return `Trending Stocks — Session Volume Leaders | ${brandName}`;
}

export function trendingPageSeoDescription(brandName: string): string {
  return `Stocks with the highest reported share volume in the ${brandName} database. Not ranked by site traffic. Quotes use ${PUBLIC_MARKET_DATA_DELAY_DISCLOSURE.toLowerCase()} when shown.`;
}
