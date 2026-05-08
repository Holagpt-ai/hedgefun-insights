import { useQuery } from "@tanstack/react-query";
import { getTopLosers } from "@/lib/polygon";
import { resolveCurrentPrice, resolveMarketSession } from "@/lib/price-utils";
import { MarketMoversPage, type MoverRow } from "@/components/markets/MarketMoversLayout";
import { supabase } from "@/integrations/supabase/client";
import { usePageSeo } from "@/hooks/usePageSeo";

function mapRows(tickers: any[]): MoverRow[] {
  if (!Array.isArray(tickers) || tickers.length === 0) return [];
  return tickers.map((t: any) => ({
    symbol: t.ticker || t.symbol || "",
    name: t.name || t.details?.name || t.ticker || t.symbol || "",
    price: resolveCurrentPrice(t),
    change: t.todaysChange ?? 0,
    changePercent: t.todaysChangePerc ?? 0,
    volume: t.day?.v > 0 ? t.day.v : (t.min?.av ?? t.min?.v ?? 0),
  }));
}

function getTitle(): { page: string; section: string } {
  const session = resolveMarketSession();
  if (session === "pre-market") return { page: "Market Movers", section: "Pre-Market Losers Today" };
  if (session === "after-hours") return { page: "Market Movers", section: "After-Hours Losers Today" };
  return { page: "Market Movers", section: "Top Losers Today" };
}

export default function LosersPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["top-losers-page"],
    queryFn: async () => {
      const res = await getTopLosers();
      const tickers = Array.isArray(res) ? res : (res?.tickers ?? []);
      if (tickers.length === 0) {
        const { data: cached } = await supabase
          .from("market_movers")
          .select("*")
          .eq("type", "loser")
          .order("session_date", { ascending: false })
          .order("change_percent", { ascending: true })
          .limit(20);
        if (cached && cached.length > 0) {
          return cached.map((r: any) => ({
            symbol: r.symbol,
            name: r.name,
            price: r.price,
            change: 0,
            changePercent: r.change_percent,
            volume: r.volume,
          }));
        }
        return [];
      }
      return mapRows(tickers);
    },
    staleTime: 60_000,
    retry: 3,
    retryDelay: 2000,
  });

  const titles = getTitle();

  usePageSeo({
    title: "Top Stock Losers Today | HedgeFun",
    description: "See today's biggest losing stocks with real-time price and percentage change data on HedgeFun.",
  });

  return (
    <MarketMoversPage
      pageTitle={titles.page}
      sectionTitle={titles.section}
      rows={data ?? []}
      isLoading={isLoading}
      refetch={refetch}
      defaultSortDesc={false}
      colorMode="red"
    />
  );
}
