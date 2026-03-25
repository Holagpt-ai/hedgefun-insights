import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function IndexSparklineCards() {
  const { data: indexes, isLoading } = useQuery({
    queryKey: ["market-indexes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_indexes")
        .select("*")
        .in("symbol", ["SPY", "QQQ", "DIA", "IWM"]);
      if (error) throw error;
      return data;
    },
  });

  const today = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  if (isLoading) {
    return (
      <div className="bg-surface px-4 py-3">
        <p className="text-xs text-muted-foreground mb-2">Stock Indexes — {today}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[88px] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const order = ["SPY", "QQQ", "DIA", "IWM"];
  const sorted = order
    .map((s) => indexes?.find((idx) => idx.symbol === s))
    .filter(Boolean);

  return (
    <div className="bg-surface px-4 py-3">
      <p className="text-xs text-muted-foreground mb-2">Stock Indexes — {today}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {sorted.map((idx) => {
          if (!idx) return null;
          const positive = (idx.change_percent ?? 0) >= 0;
          const sparkData = Array.isArray(idx.sparkline_data)
            ? (idx.sparkline_data as number[]).map((v, i) => ({ v, i }))
            : [];
          const color = positive ? "hsl(var(--green))" : "hsl(var(--red))";

          return (
            <Link
              key={idx.symbol}
              to={`/etf/${idx.symbol.toLowerCase()}`}
              className="fintech-card px-3 py-2.5 flex flex-col gap-1 cursor-pointer hover:border-primary/50 transition-colors duration-200 relative"
            >
              <ArrowUpRight className="absolute top-2 right-2 h-3 w-3 text-muted-foreground" />
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold text-foreground">{idx.name}</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-semibold text-foreground tabular-nums">
                  {idx.current_value?.toLocaleString()}
                </span>
                <span
                  className={cn(
                    "text-xs font-medium tabular-nums",
                    positive ? "price-positive" : "price-negative"
                  )}
                >
                  {positive ? "↑" : "↓"} {Math.abs(idx.change_percent ?? 0).toFixed(2)}%
                </span>
              </div>
              <div className="h-10 w-full">
                {sparkData.length > 1 && (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparkData}>
                      <defs>
                        <linearGradient id={`fill-${idx.symbol}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={color} stopOpacity={0.15} />
                          <stop offset="100%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="v"
                        stroke={color}
                        strokeWidth={1.5}
                        fill={`url(#fill-${idx.symbol})`}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
