import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AreaChart, Area, YAxis, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight } from "lucide-react";

const INDEX_TO_ETF: Record<string, string> = {
  SPX: "spy", NDX: "qqq", DJI: "dia", RUT: "iwm",
  SPY: "spy", QQQ: "qqq", "^GSPC": "spy", "^IXIC": "qqq", "^DJI": "dia", "^RUT": "iwm",
};

export function IndexSparklines() {
  const { data: indexes, isLoading } = useQuery({
    queryKey: ["market-indexes-sparkline"],
    queryFn: async () => {
      const { data } = await supabase
        .from("market_indexes")
        .select("*")
        .in("symbol", ["SPY", "QQQ", "DIA", "IWM"])
        .limit(4);
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const items = (indexes && indexes.length >= 4) ? indexes : [];

  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="mb-4">
      <p className="text-[0.8125rem] mb-2 text-muted-foreground">
        Stock Indexes · {today}
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded" />)
          : items.map((idx: any) => {
              const pct = idx.change_percent ?? 0;
              const positive = pct >= 0;
              const color = positive ? "hsl(var(--green))" : "hsl(var(--red))";
              const sparkData = Array.isArray(idx.sparkline_data)
                ? idx.sparkline_data.map((v: number, i: number) => ({ v, i }))
                : [];

              return (
                <Link key={idx.symbol} to={`/etf/${INDEX_TO_ETF[idx.symbol as string] ?? (idx.symbol as string).toLowerCase()}`} className="flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-colors duration-200 relative hover:border-primary/50 border border-border">
                  <ArrowUpRight className="absolute top-2 right-2 h-3 w-3 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[0.8125rem] font-bold truncate text-foreground">{idx.name}</p>
                    <p className="text-xs font-medium tabular-nums text-foreground">
                      {idx.current_value?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-[0.8125rem] font-medium" style={{ color }}>{positive ? "↑" : "↓"} {Math.abs(pct).toFixed(2)}%</p>
                  </div>
                  <div className="w-[120px] h-[40px] flex-shrink-0">
                    {sparkData.length > 1 && (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={sparkData}>
                          <YAxis domain={["auto", "auto"]} hide />
                          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={color} fillOpacity={0.1} dot={false} isAnimationActive={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </Link>
              );
            })}
      </div>
    </div>
  );
}
