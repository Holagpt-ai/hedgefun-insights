import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AreaChart, Area, ResponsiveContainer, YAxis, ReferenceLine } from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Add more symbols here as they are seeded into market_indexes
const CARD_ORDER = [
  "SPY",   // S&P 500
  "QQQ",   // Nasdaq 100
  "DIA",   // Dow Jones
  "IWM",   // Russell 2000
  "VIXY",  // VIX
  "GLD",   // Gold
  "SLV",   // Silver
  "IBIT",  // Bitcoin
  "BNO",   // Brent Crude
  "UNG",   // Nat Gas
  "TLT",   // 20Y Treasury
  "UUP",   // US Dollar
];

export default function DashboardIndexCards() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-index-cards"],
    queryFn: async () => {
      const { data, error } = await supabase.from("market_indexes").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const today = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const sorted = CARD_ORDER
    .map((s) => data?.find((idx: any) => idx.symbol === s))
    .filter(Boolean) as any[];

  const scrollBy = (dir: number) => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft += dir * 480;
    }
  };

  return (
    <div className="relative">
      <p className="text-xs text-muted-foreground mb-2">
        Market Indexes — {today}
      </p>

      <button
        type="button"
        aria-label="Scroll left"
        onClick={() => scrollBy(-1)}
        className="absolute left-1 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-background border border-border shadow-sm flex items-center justify-center hover:bg-muted"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Scroll right"
        onClick={() => scrollBy(1)}
        className="absolute right-1 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-background border border-border shadow-sm flex items-center justify-center hover:bg-muted"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scroll-smooth px-10 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-[88px] rounded-lg flex-shrink-0"
                style={{ minWidth: 190 }}
              />
            ))
          : sorted.map((idx) => {
              const rawSparkline = Array.isArray(idx.sparkline_data)
                ? (idx.sparkline_data as number[])
                : [];
              const sparkData = rawSparkline.map((v, i) => ({ v, i }));
              const lastSparkValue =
                rawSparkline.length > 0 ? rawSparkline[rawSparkline.length - 1] : 0;
              const prevDayClose =
                rawSparkline.length >= 2
                  ? rawSparkline[rawSparkline.length - 2]
                  : rawSparkline[0] ?? 0;
              const rawPct = idx.change_percent ?? 0;
              const computedPct =
                prevDayClose > 0 && lastSparkValue > 0
                  ? ((lastSparkValue - prevDayClose) / prevDayClose) * 100
                  : 0;
              const changePct = rawPct !== 0 ? rawPct : computedPct;
              const currentVal =
                idx.current_value && idx.current_value > 0
                  ? idx.current_value
                  : lastSparkValue;
              const positive = currentVal > prevDayClose;
              const color = positive ? "hsl(var(--green))" : "hsl(var(--red))";

              return (
                <Link
                  key={idx.symbol}
                  to={`/etf/${idx.symbol.toLowerCase()}`}
                  className="fintech-card flex-shrink-0 px-3 py-2 flex flex-col gap-1 hover:border-primary/50 transition-colors duration-200"
                  style={{ minWidth: 190, borderRadius: "var(--radius)" }}
                >
                  <span className="text-xs text-muted-foreground truncate">
                    {idx.name}
                  </span>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold tabular-nums text-foreground">
                      {currentVal?.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-medium tabular-nums",
                        positive ? "price-positive" : "price-negative"
                      )}
                    >
                      {positive ? "↑" : "↓"} {Math.abs(changePct).toFixed(2)}%
                    </span>
                  </div>
                  <div className="h-8 w-full">
                    {sparkData.length > 1 && (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={sparkData}>
                          <YAxis domain={["auto", "auto"]} hide />
                          <defs>
                            <linearGradient
                              id={`dash-fill-${idx.symbol}`}
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop offset="0%" stopColor={color} stopOpacity={0.15} />
                              <stop offset="100%" stopColor={color} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <ReferenceLine
                            y={prevDayClose}
                            stroke="#a1a1aa"
                            strokeDasharray="3 3"
                            strokeWidth={1}
                          />
                          <Area
                            type="monotone"
                            dataKey="v"
                            stroke={color}
                            strokeWidth={1.5}
                            fill={`url(#dash-fill-${idx.symbol})`}
                            dot={false}
                            isAnimationActive={false}
                          />
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
