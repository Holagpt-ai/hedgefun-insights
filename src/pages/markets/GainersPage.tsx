import { useQuery } from "@tanstack/react-query";
import { getTopGainers, getTopLosers } from "@/lib/polygon";
import {
  classifyTrackedAfterHoursMovers,
  providerDayVolume,
  regularChangePercent,
  regularClose,
  type SnapshotTicker,
} from "@/lib/market-session";
import { resolveMarketSession } from "@/lib/price-utils";
import { MarketMoversPage, type MoverRow } from "@/components/markets/MarketMoversLayout";
import { supabase } from "@/integrations/supabase/client";
import { usePageSeo } from "@/hooks/usePageSeo";

function mapRegularSessionRows(tickers: SnapshotTicker[]): MoverRow[] {
  if (!Array.isArray(tickers) || tickers.length === 0) return [];
  return tickers.flatMap((t) => {
    const price = regularClose(t);
    const changePercent = regularChangePercent(t);
    if (price === null || changePercent === null) return [];
    const prev = Number(t.prevDay?.c);
    const change = Number.isFinite(prev) ? price - prev : (price * changePercent) / 100;
    const volume = providerDayVolume(t);
    return [
      {
        symbol: String(t.ticker || t.symbol || "").toUpperCase(),
        name: t.name || t.details?.name || String(t.ticker || t.symbol || ""),
        price,
        change,
        changePercent,
        volume: volume !== null && volume > 0 ? volume : 0,
      },
    ];
  });
}

function getTitle(): { page: string; section: string } {
  const session = resolveMarketSession();
  if (session === "pre-market") return { page: "Market Movers", section: "Pre-Market Gainers Today" };
  if (session === "after-hours") {
    return { page: "Market Movers", section: "Tracked After-Hours Gainers" };
  }
  return { page: "Market Movers", section: "Top Gainers Today" };
}

export default function GainersPage() {
  const session = resolveMarketSession();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["top-gainers-page", session],
    queryFn: async () => {
      if (session === "after-hours") {
        const [gainRes, lossRes] = await Promise.all([getTopGainers(), getTopLosers()]);
        const gainers = Array.isArray(gainRes) ? gainRes : (gainRes?.tickers ?? []);
        const losers = Array.isArray(lossRes) ? lossRes : (lossRes?.tickers ?? []);
        return classifyTrackedAfterHoursMovers([...gainers, ...losers]).gainers.map((r) => ({
          symbol: r.symbol,
          name: r.name,
          price: r.price,
          change: r.change,
          changePercent: r.changePercent,
          volume: r.volume,
        }));
      }

      const res = await getTopGainers();
      const tickers = Array.isArray(res) ? res : (res?.tickers ?? []);
      if (tickers.length === 0) {
        const { data: cached } = await supabase
          .from("market_movers")
          .select("*")
          .eq("type", "gainer")
          .order("session_date", { ascending: false })
          .order("change_percent", { ascending: false })
          .limit(20);
        if (cached && cached.length > 0) {
          return cached.map((r) => ({
            symbol: r.symbol,
            name: r.name ?? r.symbol,
            price: r.price ?? 0,
            change: 0,
            changePercent: r.change_percent ?? 0,
            volume: r.volume ?? 0,
          }));
        }
        return [];
      }
      return mapRegularSessionRows(tickers);
    },
    staleTime: 60_000,
    retry: 3,
    retryDelay: 2000,
  });

  const titles = getTitle();

  usePageSeo({
    title: "Top Stock Gainers Today | HedgeFun",
    description: "See today's top gaining stocks with real-time price and percentage change data on HedgeFun.",
  });

  return (
    <MarketMoversPage
      pageTitle={titles.page}
      sectionTitle={titles.section}
      rows={data ?? []}
      isLoading={isLoading}
      refetch={refetch}
      defaultSortDesc={true}
      colorMode="green"
    />
  );
}
