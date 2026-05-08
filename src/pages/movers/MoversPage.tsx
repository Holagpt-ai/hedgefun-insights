import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getTopGainers, getTopLosers } from "@/lib/polygon";
import { Skeleton } from "@/components/ui/skeleton";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { usePageSeo } from "@/hooks/usePageSeo";

const TYPE_MAP: Record<string, { title: string; fetcher?: () => Promise<any> }> = {
  gainers: { title: "Top Gainers", fetcher: getTopGainers },
  losers: { title: "Top Losers", fetcher: getTopLosers },
  active: { title: "Most Active" },
  premarket: { title: "Pre-Market Movers" },
  afterhours: { title: "After-Hours Movers" },
};

const TYPES = ["gainers", "losers", "active", "premarket", "afterhours"];

const MoversPage = () => {
  const { type = "gainers" } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const config = TYPE_MAP[type] ?? TYPE_MAP.gainers;

  const { data, isLoading } = useQuery({
    queryKey: ["movers", type],
    queryFn: config.fetcher ?? (async () => []),
    staleTime: 60_000,
  });

  const positive = type === "gainers";

  return (
    <div className="p-4">
      <h1 className="text-lg font-bold text-foreground mb-3">{config.title}</h1>

      <div className="flex gap-1 mb-4 flex-wrap">
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => navigate(`/movers/${t}`)}
            className={cn(
              "text-xs px-3 py-1.5 rounded-full transition-colors capitalize",
              t === type ? "bg-accent-blue text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            {TYPE_MAP[t].title}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : !config.fetcher ? (
        <p className="text-sm text-muted-foreground">Data for {config.title} coming soon.</p>
      ) : (
        <div className="fintech-card overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-border">
                <th className="table-header text-left px-3 py-2">Symbol</th>
                <th className="table-header text-right px-3 py-2">Price</th>
                <th className="table-header text-right px-3 py-2">Change %</th>
                <th className="table-header text-right px-3 py-2 hidden sm:table-cell">Volume</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).slice(0, 50).map((m: any, i: number) => {
                const ticker = m.ticker || m.symbol || "";
                const price = m.price ?? (m.day?.c > 0 ? m.day.c : (m.min?.c ?? m.prevDay?.c ?? 0));
                const changePct = m.todaysChangePerc ?? m.change_percent ?? 0;
                return (
                  <tr key={i} className="border-b border-border last:border-b-0 hover:bg-accent/50">
                    <td className="px-3 py-2">
                      <button onClick={() => { trackEvent("stock_search", { ticker }); navigate(`/stocks/${ticker.toLowerCase()}`); }} className="ticker-symbol text-accent-blue hover:underline text-sm">{ticker}</button>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">${price.toFixed(2)}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums font-medium", positive ? "price-positive" : "price-negative")}>
                      {positive ? "↑" : "↓"} {Math.abs(changePct).toFixed(2)}%
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell">{(m.day?.v ?? m.volume ?? 0).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MoversPage;
