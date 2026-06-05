import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getFilterById, type ActiveFilter } from "./filters.config";

// ─────────────────────────────────────────────────────────────────────────────
// useScreenerQuery
// ─────────────────────────────────────────────────────────────────────────────
// Builds a dynamic Supabase query from the activeFilters array.
// Adding a new filter to filters.config.ts with a valid dbColumn automatically
// makes it queryable here — no changes needed in this file.
//
// Query strategy:
//   - Any active filter with dbColumn set → query "stocks" table
//   - No active filters → query "ticker_search" for full 12k list
//   - industryParam → always query "stocks" with ilike on industry
//   - marketCapFilter (legacy popular screens) → still supported
// ─────────────────────────────────────────────────────────────────────────────

export type ScreenerRow = {
  symbol: string;
  name: string;
  exchange: string | null;
  type: string | null;
  market_cap: number | null;
  price: number | null;
  change_percent: number | null;
  volume: number | null;
  pe_ratio: number | null;
  industry: string | null;
  sector: string | null;
  dividend_yield: number | null;
};

type UseScreenerQueryParams = {
  activeFilters: ActiveFilter[];
  industryParam: string | null;
  marketCapFilter: string;
  userTier: "free" | "pro" | "unlimited";
};

const MARKET_CAP_RANGES: Record<string, { gte?: number; lt?: number }> = {
  "mega-cap":   { gte: 200_000_000_000 },
  "large-cap":  { gte: 10_000_000_000,  lt: 200_000_000_000 },
  "mid-cap":    { gte: 2_000_000_000,   lt: 10_000_000_000 },
  "small-cap":  { gte: 300_000_000,     lt: 2_000_000_000 },
  "micro-cap":  { gte: 50_000_000,      lt: 300_000_000 },
};

// Market cap group select filter → numeric range
const MARKET_CAP_GROUP_RANGES: Record<string, { gte?: number; lt?: number }> = {
  mega:   { gte: 200_000_000_000 },
  large:  { gte: 10_000_000_000,  lt: 200_000_000_000 },
  mid:    { gte: 2_000_000_000,   lt: 10_000_000_000 },
  small:  { gte: 300_000_000,     lt: 2_000_000_000 },
  micro:  { gte: 50_000_000,      lt: 300_000_000 },
  nano:   { lt: 50_000_000 },
};

export function useScreenerQuery({
  activeFilters,
  industryParam,
  marketCapFilter,
  userTier,
}: UseScreenerQueryParams) {
  // Only apply filters where dbColumn is set and tier allows it
  const applicableFilters = activeFilters.filter((af) => {
    const def = getFilterById(af.id);
    if (!def) return false;
    if (!def.dbColumn) return false;
    if (def.tier === "coming_soon") return false;
    if (def.tier === "pro" && userTier === "free") return false;
    return true;
  });

  const hasActiveFilters = applicableFilters.length > 0;
  const hasMarketCapFilter = marketCapFilter in MARKET_CAP_RANGES;

  const queryKey = [
    "screener",
    industryParam,
    marketCapFilter,
    JSON.stringify(applicableFilters),
  ];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async (): Promise<ScreenerRow[]> => {

      // ── INDUSTRY PARAM (URL-driven) ──────────────────────────────────────
      if (industryParam) {
        const { data, error } = await supabase
          .from("stocks")
          .select("symbol, name, price, change_percent, market_cap, pe_ratio, volume, sector, industry, exchange, dividend_yield")
          .ilike("industry", industryParam)
          .order("market_cap", { ascending: false, nullsFirst: false })
          .limit(500);
        if (error) throw error;
        return (data ?? []).map(toScreenerRow);
      }

      // ── ACTIVE CONFIG-DRIVEN FILTERS ─────────────────────────────────────
      if (hasActiveFilters) {
        let query: any = supabase
          .from("stocks")
          .select("symbol, name, price, change_percent, market_cap, pe_ratio, volume, sector, industry, exchange, dividend_yield")
          .order("market_cap", { ascending: false, nullsFirst: false })
          .limit(1000);

        for (const af of applicableFilters) {
          const def = getFilterById(af.id);
          if (!def?.dbColumn) continue;
          const col = def.dbColumn;

          // Special case: market_cap_group uses select value → numeric range
          if (af.id === "market_cap_group" && af.value) {
            const range = MARKET_CAP_GROUP_RANGES[String(af.value)];
            if (range?.gte != null) query = query.gte(col, range.gte);
            if (range?.lt != null)  query = query.lt(col, range.lt);
            continue;
          }

          if (def.type === "range") {
            if (af.min != null && af.min !== "") {
              // market_cap filter stored in billions — convert to raw
              const rawMin = col === "market_cap"
                ? Number(af.min) * 1_000_000_000
                : Number(af.min);
              query = query.gte(col, rawMin);
            }
            if (af.max != null && af.max !== "") {
              const rawMax = col === "market_cap"
                ? Number(af.max) * 1_000_000_000
                : Number(af.max);
              query = query.lte(col, rawMax);
            }
          }

          if (def.type === "select" && af.value != null && af.value !== "") {
            query = query.eq(col, af.value);
          }

          if (def.type === "boolean" && af.value != null) {
            query = query.eq(col, af.value);
          }
        }

        // Also apply legacy marketCapFilter if set alongside config filters
        if (hasMarketCapFilter) {
          const range = MARKET_CAP_RANGES[marketCapFilter];
          if (range.gte != null) query = query.gte("market_cap", range.gte);
          if (range.lt != null)  query = query.lt("market_cap", range.lt);
        }

        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []).map(toScreenerRow);
      }

      // ── LEGACY MARKET CAP FILTER (popular screens dropdown) ──────────────
      if (hasMarketCapFilter) {
        const range = MARKET_CAP_RANGES[marketCapFilter];
        let query = supabase
          .from("ticker_search")
          .select("symbol, name, exchange, type, market_cap")
          .gt("market_cap", 0)
          .eq("active", true);
        if (range.gte != null) query = query.gte("market_cap", range.gte);
        if (range.lt != null)  query = query.lt("market_cap", range.lt);
        const { data, error } = await query
          .order("market_cap", { ascending: false })
          .limit(1000);
        if (error) throw error;
        return (data ?? []).map((r) => ({
          symbol: r.symbol,
          name: r.name,
          exchange: r.exchange,
          type: r.type as string | null,
          market_cap: r.market_cap as number | null,
          price: null,
          change_percent: null,
          volume: null,
          pe_ratio: null,
          industry: null,
          sector: null,
          dividend_yield: null,
        }));
      }

      // ── NO FILTERS — full ticker list ────────────────────────────────────
      const { data, error } = await supabase
        .from("ticker_search")
        .select("symbol, name, exchange, type")
        .eq("active", true)
        .order("symbol", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        symbol: r.symbol,
        name: r.name,
        exchange: r.exchange,
        type: r.type,
        market_cap: null,
        price: null,
        change_percent: null,
        volume: null,
        pe_ratio: null,
        industry: null,
        sector: null,
        dividend_yield: null,
      }));
    },
    staleTime: 5 * 60_000,
  });

  return {
    stocks: data ?? [],
    isLoading,
    error,
    hasActiveFilters: hasActiveFilters || hasMarketCapFilter || !!industryParam,
  };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function toScreenerRow(r: any): ScreenerRow {
  return {
    symbol: r.symbol,
    name: r.name,
    exchange: r.exchange ?? null,
    type: r.type ?? null,
    market_cap: r.market_cap ?? null,
    price: r.price ?? null,
    change_percent: r.change_percent ?? null,
    volume: r.volume ?? null,
    pe_ratio: r.pe_ratio ?? null,
    industry: r.industry ?? null,
    sector: r.sector ?? null,
    dividend_yield: r.dividend_yield ?? null,
  };
}
