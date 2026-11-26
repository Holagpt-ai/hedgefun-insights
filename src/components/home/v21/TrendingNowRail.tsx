import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TRENDING_EMPTY_MESSAGE,
  TRENDING_ERROR_MESSAGE,
  mapTrendingStockRows,
} from "@/lib/trending/trending-page-present";
import { publicStockDetailPath } from "@/lib/public/public-workflow-links";
import { cn } from "@/lib/utils";
import { PUBLIC_MARKET_DATA_DELAY_DISCLOSURE } from "@/lib/price-utils";

export function TrendingNowRail() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["homepage-trending-rail"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("stocks")
        .select("symbol, name, market_cap, change_percent, volume, updated_at")
        .not("volume", "is", null)
        .gt("volume", 0)
        .order("volume", { ascending: false })
        .limit(8);
      if (error) throw error;
      return mapTrendingStockRows(rows);
    },
    staleTime: 300_000,
  });

  return (
    <section aria-labelledby="trending-now-heading" className="hp-card px-3 py-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 id="trending-now-heading" className="text-sm font-extrabold">
          Trending Now
        </h2>
        <Link to="/trending" className="text-xs font-bold text-[var(--hp-blue)]">
          All →
        </Link>
      </div>
      <p className="mb-2 px-1 text-[10px] text-[var(--hp-ink-3)]">
        Volume-ranked · {PUBLIC_MARKET_DATA_DELAY_DISCLOSURE}
      </p>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-xs text-[var(--hp-ink-2)]">{TRENDING_ERROR_MESSAGE}</p>
      ) : !data?.length ? (
        <p className="text-xs text-[var(--hp-ink-2)]">{TRENDING_EMPTY_MESSAGE}</p>
      ) : (
        <ul>
          {data.map((row, index) => {
            const positive = (row.change_percent ?? 0) >= 0;
            return (
              <li key={row.symbol}>
                <button
                  type="button"
                  className="trend-row flex w-full items-center gap-2 border-b border-[var(--hp-line)] py-2 text-left text-sm last:border-0"
                  onClick={() => navigate(publicStockDetailPath(row.symbol))}
                >
                  <span className="t-rank w-4 text-[11px] text-[var(--hp-ink-3)]">{index + 1}</span>
                  <span className="t-sym font-extrabold">{row.symbol}</span>
                  <span className="t-name min-w-0 flex-1 truncate text-xs text-[var(--hp-ink-3)]">
                    {row.name}
                  </span>
                  <span className="t-right text-right">
                    {row.change_percent !== null ? (
                      <span
                        className={cn(
                          "t-pct hp-num font-bold",
                          positive ? "text-[var(--hp-up)]" : "text-[var(--hp-down)]",
                        )}
                      >
                        {positive ? "+" : ""}
                        {row.change_percent.toFixed(2)}%
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}