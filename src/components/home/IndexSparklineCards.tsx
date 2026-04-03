import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AreaChart, Area, ResponsiveContainer, YAxis, ReferenceLine } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveMarketSession } from "@/lib/price-utils";

function useSessionLabel() {
  const session = resolveMarketSession();
  if (session === "pre-market") return { label: "Pre-market", color: "bg-orange-500" };
  if (session === "market") return { label: "Live", color: "bg-green-500" };
  return { label: "After-hours", color: "bg-muted-foreground" };
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
          const rawSparkline = Array.isArray(idx.sparkline_data)
            ? (idx.sparkline_data as number[])
            : [];
          const sparkData = rawSparkline.map((v, i) => ({ v, i }));
          const lastSparkValue = rawSparkline.length > 0 ? rawSparkline[rawSparkline.length - 1] : 0;
          const prevDayClose = rawSparkline.length >= 2
            ? rawSparkline[rawSparkline.length - 2]
            : rawSparkline[0] ?? 0;
          // Fallback: if change_percent is 0 but we have sparkline data, compute from sparkline
          const rawPct = idx.change_percent ?? 0;
          const computedPct = prevDayClose > 0 && lastSparkValue > 0
            ? ((lastSparkValue - prevDayClose) / prevDayClose) * 100
            : 0;
          const changePct = rawPct !== 0 ? rawPct : computedPct;
          const currentVal = (idx.current_value && idx.current_value > 0) ? idx.current_value : lastSparkValue;
          const positive = currentVal > prevDayClose;
          const color = positive ? "hsl(var(--green))" : "hsl(var(--red))";
          return (
            <Link
              key={idx.symbol}
              to={`/etf/${idx.symbol.toLowerCase()}`}
              className="fintech-card px-3 py-1.5 flex flex-row items-center gap-2 cursor-pointer hover:border-primary/50 transition-colors duration-200 relative"
            >
              <ArrowUpRight className="absolute top-2 right-2 h-3 w-3 text-muted-foreground" />
              <div className="flex flex-col justify-center" style={{ width: '40%' }}>
                <span className="text-xs text-muted-foreground">{idx.name}</span>
                <span
                  className={cn(
                    "text-xs font-medium tabular-nums",
                    positive ? "price-positive" : "price-negative"
                  )}
                >
                  {positive ? "↑" : "↓"} {Math.abs(idx.change_percent ?? 0).toFixed(2)}%
                </span>
              </div>
              <div style={{ width: '60%' }}>
                <div className="h-10 w-full">
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
                        <ReferenceLine y={prevDayClose} stroke="#a1a1aa" strokeDasharray="3 3" strokeWidth={1} />
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
