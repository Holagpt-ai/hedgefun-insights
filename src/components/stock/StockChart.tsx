import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TIME_RANGES = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y", "MAX"];

function formatXTick(t: number, range: string): string {
  const date = new Date(t);
  if (range === "1D") {
    return date.toLocaleTimeString("en-US", { hour: "numeric", hour12: true, timeZone: "America/New_York" }).toLowerCase();
  }
  if (range === "5D") {
    return date.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatYTick(val: number): string {
  if (val >= 10) return `$${Math.round(val)}`;
  return `$${val.toFixed(2)}`;
}

function getTickInterval(dataLen: number, range: string): number {
  if (range === "1D") return Math.max(1, Math.floor(dataLen / 3));
  if (range === "5D") return Math.max(1, Math.floor(dataLen / 5));
  return Math.max(1, Math.floor(dataLen / 6));
}

interface Props {
  chartData: any;
  chartLoading: boolean;
  timeRange: string;
  setTimeRange: (r: string) => void;
  positive: boolean;
  prevClose: number | null;
}

export default function StockChart({ chartData, chartLoading, timeRange, setTimeRange, positive, prevClose }: Props) {
  const chartPoints = (chartData ?? []).map((d: any) => ({ t: d.t, price: d.c }));
  const lineColor = positive ? "#16a34a" : "#dc2626";
  const fillColor = positive ? "rgba(22,163,74,0.15)" : "rgba(220,38,38,0.15)";

  return (
    <div className="fintech-card p-4">
      <div className="flex gap-1 mb-3 flex-wrap">
        {TIME_RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setTimeRange(r)}
            className={cn(
              "text-xs px-2.5 py-1 rounded-full transition-colors",
              timeRange === r
                ? "bg-accent-blue text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="h-[280px]">
        {chartLoading ? (
          <Skeleton className="h-full w-full" />
        ) : chartPoints.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartPoints}>
              <defs>
                <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="t"
                tickFormatter={(t) => formatXTick(t, timeRange)}
                interval={getTickInterval(chartPoints.length, timeRange)}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                orientation="right"
                domain={["auto", "auto"]}
                tickFormatter={formatYTick}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                width={60}
              />
              <Tooltip
                formatter={(v: number) => [`$${v.toFixed(2)}`, "Price"]}
                labelFormatter={(t) => formatXTick(t as number, timeRange)}
                contentStyle={{
                  background: "hsl(var(--surface-card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                  fontSize: "0.75rem",
                }}
              />
              {prevClose != null && (
                <ReferenceLine
                  y={prevClose}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
              )}
              <Area
                type="monotone"
                dataKey="price"
                stroke={lineColor}
                strokeWidth={1.5}
                fill="url(#chartFill)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            No chart data available
          </div>
        )}
      </div>
    </div>
  );
}
