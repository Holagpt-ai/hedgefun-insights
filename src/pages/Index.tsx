import { IndexSparklineCards } from "@/components/home/IndexSparklineCards";
import { GlobalMarketClocks } from "@/components/home/GlobalMarketClocks";
import { HeroSearch } from "@/components/home/HeroSearch";
import { ToolGrid } from "@/components/home/ToolGrid";
import { TopGainersTable, TopLosersTable } from "@/components/home/MoversTable";
import { MarketNews } from "@/components/home/MarketNews";
import { RecentIpos, UpcomingIpos } from "@/components/home/IpoTables";
import Disclaimer from "@/components/layout/Disclaimer";
import { resolveMarketSession } from "@/lib/price-utils";

function useSessionMoversLabels() {
  const session = resolveMarketSession();
  if (session === "pre-market") return { gainers: "Pre-Market Gainers", losers: "Pre-Market Losers" };
  if (session === "market") return { gainers: "Top Gainers", losers: "Top Losers" };
  if (session === "after-hours") return { gainers: "After-Hours Gainers", losers: "After-Hours Losers" };
  return { gainers: "Top Gainers", losers: "Top Losers" };
}

const Index = () => {
  const labels = useSessionMoversLabels();
  return (
    <div className="flex flex-col">
      {/* 14A — Index Sparkline Cards */}
      <IndexSparklineCards />

      {/* 14A2 — Global Market Clocks */}
      <GlobalMarketClocks />

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
