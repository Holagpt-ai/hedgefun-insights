import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getTopGainers, getTopLosers } from "@/lib/polygon";
import { Skeleton } from "@/components/ui/skeleton";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import { resolveMarketSession } from "@/lib/price-utils";
import {
  currentMoversEmptyMessage,
  mapPolygonMovers,
  type MoverListRow,
  type MoverSession,
} from "@/lib/markets/movers-integrity";

function toMoverSession(session: ReturnType<typeof resolveMarketSession>): MoverSession {
  if (session === "pre-market") return "premarket";
  if (session === "after-hours") return "afterhours";
  return "regular";
}

function MoversTable({
  title,
  linkTo,
  data,
  isLoading,
  refetch,
}: {
  title: string;
  linkTo: string;
  data: MoverListRow[] | undefined;
  isLoading: boolean;
  type: "gainers" | "losers";
  refetch?: () => void;
}) {
  const navigate = useNavigate();
  const marketClosed = resolveMarketSession() === "closed";

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
              {currentMoversEmptyMessage({ hasSearchQuery: false, marketClosed })}
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
              {rows.slice(0, 10).map((m) => (
                <tr
                  key={m.symbol}
                  className="border-b border-border last:border-b-0 hover:bg-accent/50 transition-colors"
                >
                  <td className="px-3 py-2">
                    <button
                      onClick={() => select(m.symbol)}
                      className="ticker-symbol text-accent-blue hover:underline text-sm"
                    >
                      {m.symbol}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-foreground hidden sm:table-cell truncate max-w-[180px]">
                    {m.name}
                  </td>
                  <td className="px-3 py-2 text-right text-foreground tabular-nums">
                    ${m.price.toFixed(2)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums font-medium",
                      m.changePercent >= 0 ? "price-positive" : "price-negative",
                    )}
                  >
                    {m.changePercent >= 0 ? "↑" : "↓"} {Math.abs(m.changePercent).toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function TopGainersTable({ title = "Top Gainers" }: { title?: string }) {
  const session = resolveMarketSession();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["top-gainers", session],
    queryFn: async () => {
      const raw = await getTopGainers();
      return mapPolygonMovers(raw, toMoverSession(session), { sort: "percent_desc" }).rows;
    },
    staleTime: 60_000,
    retry: 3,
    retryDelay: 2000,
  });

  return (
    <MoversTable
      title={title}
      linkTo="/markets/gainers"
      data={data}
      isLoading={isLoading}
      type="gainers"
      refetch={refetch}
    />
  );
}

export function TopLosersTable({ title = "Top Losers" }: { title?: string }) {
  const session = resolveMarketSession();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["top-losers", session],
    queryFn: async () => {
      const raw = await getTopLosers();
      return mapPolygonMovers(raw, toMoverSession(session), { sort: "percent_asc" }).rows;
    },
    staleTime: 60_000,
    retry: 3,
    retryDelay: 2000,
  });

  return (
    <MoversTable
      title={title}
      linkTo="/markets/losers"
      data={data}
      isLoading={isLoading}
      type="losers"
      refetch={refetch}
    />
  );
}
