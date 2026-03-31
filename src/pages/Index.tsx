import { IndexSparklineCards } from "@/components/home/IndexSparklineCards";
import { HeroSearch } from "@/components/home/HeroSearch";
import { ToolGrid } from "@/components/home/ToolGrid";
import { TopGainersTable, TopLosersTable } from "@/components/home/MoversTable";
import { MarketNews } from "@/components/home/MarketNews";
import { RecentIpos, UpcomingIpos } from "@/components/home/IpoTables";
import Disclaimer from "@/components/layout/Disclaimer";

function useSessionMoversLabels() {
  const now = new Date();
  const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit", minute: "2-digit" });
  const [h, m] = etStr.split(":").map(Number);
  const mins = h * 60 + m;

  if (mins >= 240 && mins < 570) return { gainers: "Pre-Market Gainers", losers: "Pre-Market Losers" };
  if (mins >= 570 && mins <= 960) return { gainers: "Top Gainers", losers: "Top Losers" };
  if (mins > 960 && mins <= 1200) return { gainers: "After-Hours Gainers", losers: "After-Hours Losers" };
  return { gainers: "Top Gainers", losers: "Top Losers" };
}

const Index = () => {
  const labels = useSessionMoversLabels();
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
