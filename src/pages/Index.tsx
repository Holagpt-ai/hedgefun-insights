import { IndexSparklineCards } from "@/components/home/IndexSparklineCards";
import { HeroSearch } from "@/components/home/HeroSearch";
import { ToolGrid } from "@/components/home/ToolGrid";
import { TopGainersTable, TopLosersTable } from "@/components/home/MoversTable";
import { MarketNews } from "@/components/home/MarketNews";
import { RecentIpos, UpcomingIpos } from "@/components/home/IpoTables";
import Disclaimer from "@/components/layout/Disclaimer";

const Index = () => {
  return (
    <div className="flex flex-col">
      {/* 14A — Index Sparkline Cards */}
      <IndexSparklineCards />

      {/* 14B — Hero Search */}
      <HeroSearch />

      {/* 14C — Tool Grid */}
      <ToolGrid />

      {/* 14D & 14E — Gainers / Losers */}
      <div className="px-4 py-4 grid md:grid-cols-2 gap-6">
        <TopGainersTable />
        <TopLosersTable />
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
