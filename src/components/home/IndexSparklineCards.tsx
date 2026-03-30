import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AreaChart, Area, ResponsiveContainer, YAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

function useSessionLabel() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const isWeekend = day === 0 || day === 6;
  const isPreMarket = !isWeekend && hour >= 4 && hour < 9;
  const isAfterHours = !isWeekend && (hour >= 16 || hour < 4);

  if (isWeekend || isAfterHours) return { label: "After-hours", color: "bg-muted-foreground" };
  if (isPreMarket) return { label: "Pre-market", color: "bg-orange-500" };
  return { label: "Live", color: "bg-green-500" };
}

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

  const session = useSessionLabel();

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
      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
        Stock Indexes — {today}
        <span className="inline-flex items-center gap-1 text-[0.6875rem]">
          <span className={cn("w-1.5 h-1.5 rounded-full inline-block", session.color)} />
          {session.label}
        </span>
      </p>
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
              className="fintech-card px-3 py-2.5 flex flex-row items-center gap-2 cursor-pointer hover:border-primary/50 transition-colors duration-200 relative"
            >
              <ArrowUpRight className="absolute top-2 right-2 h-3 w-3 text-muted-foreground" />
              <div className="flex flex-col justify-center" style={{ width: '40%' }}>
                <span className="text-xs text-muted-foreground">{idx.name}</span>
                <span className="text-sm font-semibold text-foreground tabular-nums">
                  {idx.current_value?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
              <div style={{ width: '60%', borderTop: '1.5px dotted #a1a1aa' }}>
                <div className="h-10 w-full pt-1">
                  {sparkData.length > 1 && (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={sparkData}>
                        <YAxis domain={["auto", "auto"]} hide />
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
            </Link>
          );
        })}
      </div>
    </div>
  );
}
