import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight } from "lucide-react";

export function IndexSparklines() {
  const { data: indexes, isLoading } = useQuery({
    queryKey: ["market-indexes-sparkline"],
    queryFn: async () => {
      const { data } = await supabase
        .from("market_indexes")
        .select("*")
        .in("symbol", ["SPX", "NDX", "DJI", "RUT", "SPY", "QQQ", "^GSPC", "^IXIC", "^DJI", "^RUT"])
        .limit(4);
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const fallback = [
    { name: "S&P500", symbol: "SPX", change_percent: -0.13, sparkline_data: [100, 99.5, 99.8, 99.2, 99.87] },
    { name: "Nasdaq 100", symbol: "NDX", change_percent: -0.01, sparkline_data: [100, 100.2, 99.8, 100.1, 99.99] },
    { name: "Dow Jones", symbol: "DJI", change_percent: -0.60, sparkline_data: [100, 99.8, 99.5, 99.2, 99.4] },
    { name: "Russell 2000", symbol: "RUT", change_percent: -0.20, sparkline_data: [100, 99.9, 99.7, 99.6, 99.8] },
  ];

  const items = (indexes && indexes.length >= 4) ? indexes : fallback;

  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="mb-4">
      <p className="text-[0.8125rem] mb-2" style={{ color: "hsl(var(--text-muted))" }}>
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
                : [{ v: 0, i: 0 }];

              return (
                <div key={idx.symbol} className="flex items-center gap-2 px-3 py-2 rounded" style={{ border: "1px solid hsl(var(--border))" }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-[0.8125rem] font-bold truncate" style={{ color: "hsl(var(--text-primary))" }}>{idx.name}</p>
                    <p className="text-[0.8125rem] font-medium" style={{ color }}>{positive ? "↑" : "↓"} {Math.abs(pct).toFixed(2)}%</p>
                  </div>
                  <div className="w-[120px] h-[40px] flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={sparkData}>
                        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })}
      </div>
    </div>
  );
}
