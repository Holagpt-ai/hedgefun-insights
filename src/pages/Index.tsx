import MarketTicker from "@/components/layout/MarketTicker";
import { IndexSparklineCards } from "@/components/home/IndexSparklineCards";
import { GlobalMarketClocks } from "@/components/home/GlobalMarketClocks";
import { MarketPulse } from "@/components/home/MarketPulse";
import { HeroSearch } from "@/components/home/HeroSearch";
import { ToolGrid } from "@/components/home/ToolGrid";
import { TopGainersTable, TopLosersTable } from "@/components/home/MoversTable";
import { MarketNews } from "@/components/home/MarketNews";
import { RecentIpos, UpcomingIpos } from "@/components/home/IpoTables";
import Disclaimer from "@/components/layout/Disclaimer";
import { resolveMarketSession } from "@/lib/price-utils";
import { usePageSeo } from "@/hooks/usePageSeo";
import { BRAND } from "@/config/brand";
import { marketPulseDelayDisclosure } from "@/lib/markets/market-pulse-select";

function useSessionMoversLabels() {
  const session = resolveMarketSession();
  if (session === "pre-market") return { gainers: "Pre-Market Gainers", losers: "Pre-Market Losers" };
  if (session === "market") return { gainers: "Top Gainers", losers: "Top Losers" };
  if (session === "after-hours") return { gainers: "After-Hours Gainers", losers: "After-Hours Losers" };
  return { gainers: "Top Gainers", losers: "Top Losers" };
}

const Index = () => {
  const labels = useSessionMoversLabels();
  usePageSeo({
    title: `${BRAND.name} — Market pulse, stock research & trading dashboard`,
    description: `Discover session movers, research individual stocks, and continue into the Stocksist dashboard. ${marketPulseDelayDisclosure()}`,
    canonical: "/",
  });
  return (
    <div className="flex flex-col">
      <MarketTicker />
      {/* 14A — Index Sparkline Cards */}
      <IndexSparklineCards />

      {/* 14A2 — Global Market Clocks */}
      <GlobalMarketClocks />

      <MarketPulse />

      <section
        aria-labelledby="stocksist-overview-heading"
        className="bg-surface px-4 pt-6 pb-1 text-center"
      >
        <h1
          id="stocksist-overview-heading"
          className="text-[1.375rem] md:text-[1.75rem] font-bold text-foreground leading-tight max-w-[40rem] mx-auto"
        >
          Stock Market Intelligence for Active Investors and Traders
        </h1>
        <p className="mt-3 text-sm md:text-base text-foreground leading-relaxed max-w-[40rem] mx-auto">
          Stocksist helps you research stocks, monitor session movers, and continue into screeners, watchlists, and catalyst tools after sign-in. Public quotes use {marketPulseDelayDisclosure().toLowerCase()}.
        </p>
        <p className="mt-2 text-sm text-text-secondary leading-relaxed max-w-[40rem] mx-auto">
          Workspace features such as AI Analyst and live Radar require a free account; some capabilities remain in preview or are not deployed yet.
        </p>
      </section>

      {/* 14B — Hero Search */}
      <HeroSearch />

      {/* 14C — Tool Grid */}
      <ToolGrid />

      {/* 14D & 14E — Gainers / Losers */}
      <div className="px-4 py-4 grid md:grid-cols-2 gap-6">
        <TopGainersTable title={labels.gainers} />
        <TopLosersTable title={labels.losers} />
      </div>

      {/* 14F — Market News */}
      <div className="px-4 py-4">
        <MarketNews />
      </div>

      {/* 14G & 14H — IPOs */}
      <div className="px-4 py-4 grid md:grid-cols-2 gap-6">
        <RecentIpos />
        <UpcomingIpos />
      </div>

      {/* Disclaimer */}
      <div className="px-4 py-6">
        <Disclaimer />
      </div>
    </div>
  );
};

export default Index;
