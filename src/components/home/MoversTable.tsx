import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getTopGainers, getTopLosers } from "@/lib/polygon";
import { Skeleton } from "@/components/ui/skeleton";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

interface Mover {
  ticker: string;
  todaysChangePerc?: number;
  todaysChange?: number;
  day?: { c?: number; v?: number };
  min?: { c?: number };
  prevDay?: { c?: number };
  // Fallback fields from some Polygon responses
  symbol?: string;
  name?: string;
  price?: number;
  change_percent?: number;
}

function MoversTable({
  title,
  linkTo,
  data,
  isLoading,
  type,
  refetch,
}: {
  title: string;
  linkTo: string;
  data: Mover[] | undefined;
  isLoading: boolean;
  type: "gainers" | "losers";
  refetch?: () => void;
}) {
  const navigate = useNavigate();
  const positive = type === "gainers";

  const select = (ticker: string) => {
    trackEvent("stock_search", { ticker });
    navigate(`/stocks/${ticker}`);
  };

  const rows = data ?? [];

  return (
    <div>
      <div className="flex items-center gap-1 mb-3">
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        <button
          onClick={() => navigate(linkTo)}
          className="text-base text-muted-foreground hover:text-accent-blue"
        >
          ›
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-center">
          <div>
            <RefreshCw className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-[0.875rem] text-muted-foreground">
              Market data is refreshing...
            </p>
            {refetch && (
              <button
                onClick={() => refetch()}
                className="mt-2 text-[0.8125rem] text-accent-blue hover:underline"
              >
                Try again
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="fintech-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="table-header text-left px-3 py-2">Symbol</th>
                <th className="table-header text-left px-3 py-2 hidden sm:table-cell">Name</th>
                <th className="table-header text-right px-3 py-2">Price</th>
                <th className="table-header text-right px-3 py-2">Change %</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 10).map((m, i) => {
                const ticker = m.ticker || m.symbol || "";
                const price = m.price ?? (m.day?.c > 0 ? m.day.c : (m.min?.c ?? m.prevDay?.c ?? 0));
                const changePct = m.todaysChangePerc ?? m.change_percent ?? 0;
                return (
                  <tr
                    key={i}
                    className="border-b border-border last:border-b-0 hover:bg-accent/50 transition-colors"
                  >
                    <td className="px-3 py-2">
                      <button
                        onClick={() => select(ticker)}
                        className="ticker-symbol text-accent-blue hover:underline text-sm"
                      >
                        {ticker}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-foreground hidden sm:table-cell truncate max-w-[180px]">
                      {m.name ?? ticker}
                    </td>
                    <td className="px-3 py-2 text-right text-foreground tabular-nums">
                      ${price.toFixed(2)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right tabular-nums font-medium",
                        positive ? "price-positive" : "price-negative"
                      )}
                    >
                      {positive ? "↑" : "↓"} {Math.abs(changePct).toFixed(2)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function TopGainersTable() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["top-gainers"],
    queryFn: getTopGainers,
    staleTime: 60_000,
    retry: 3,
    retryDelay: 2000,
  });

  return (
    <MoversTable
      title="Top Gainers"
      linkTo="/markets/gainers"
      data={data}
      isLoading={isLoading}
      type="gainers"
      refetch={refetch}
    />
  );
}

export function TopLosersTable() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["top-losers"],
    queryFn: getTopLosers,
    staleTime: 60_000,
    retry: 3,
    retryDelay: 2000,
  });

  return (
    <MoversTable
      title="Top Losers"
      linkTo="/markets/losers"
      data={data}
      isLoading={isLoading}
      type="losers"
      refetch={refetch}
    />
  );
}
