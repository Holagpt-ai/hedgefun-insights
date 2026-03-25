import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { getAggregates } from "@/lib/polygon";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const PERF_PERIODS = ["1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y"] as const;
type Period = (typeof PERF_PERIODS)[number];

const BENCHMARK_NAMES: Record<string, string> = {
  SPY: "S&P 500",
  QQQ: "Nasdaq-100",
  DIA: "DJIA",
  IWM: "Russell 2000",
};

// Typical annual tracking difference (bps) used to estimate benchmark return
const EXPENSE_RATIOS: Record<string, number> = {
  SPY: 0.0945,
  QQQ: 0.20,
  DIA: 0.16,
  IWM: 0.19,
};

function getPeriodRange(period: Period): { from: string; to: string; timespan: string; multiplier: number } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  let from: string;
  let timespan = "day";
  let multiplier = 1;

  switch (period) {
    case "1M":
      from = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
      break;
    case "3M":
      from = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
      break;
    case "6M":
      from = new Date(now.getTime() - 180 * 86400000).toISOString().slice(0, 10);
      break;
    case "YTD":
      from = `${now.getFullYear()}-01-01`;
      break;
    case "1Y":
      from = new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10);
      break;
    case "3Y":
      from = new Date(now.getTime() - 3 * 365 * 86400000).toISOString().slice(0, 10);
      timespan = "week";
      break;
    case "5Y":
      from = new Date(now.getTime() - 5 * 365 * 86400000).toISOString().slice(0, 10);
      timespan = "month";
      break;
    default:
      from = new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10);
  }
  return { from, to, timespan, multiplier };
}

function calcReturn(data: any[]): number | null {
  if (!data || data.length < 2) return null;
  const startPrice = data[0].c;
  const endPrice = data[data.length - 1].c;
  if (!startPrice || !endPrice) return null;
  return ((endPrice - startPrice) / startPrice) * 100;
}

function periodYears(period: Period): number {
  switch (period) {
    case "1M": return 1 / 12;
    case "3M": return 0.25;
    case "6M": return 0.5;
    case "YTD": {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      return (now.getTime() - start.getTime()) / (365.25 * 86400000);
    }
    case "1Y": return 1;
    case "3Y": return 3;
    case "5Y": return 5;
    default: return 1;
  }
}

interface Props {
  symbol: string;
}

export function EtfPerformanceChart({ symbol }: Props) {
  const benchmarkName = BENCHMARK_NAMES[symbol] ?? "Benchmark";
  const expenseRatio = EXPENSE_RATIOS[symbol] ?? 0.1;

  const queries = useQueries({
    queries: PERF_PERIODS.map((period) => {
      const range = getPeriodRange(period);
      return {
        queryKey: ["etf-perf", symbol, period],
        queryFn: () => getAggregates(symbol, range.multiplier, range.timespan, range.from, range.to),
        staleTime: 5 * 60_000,
      };
    }),
  });

  const isLoading = queries.some((q) => q.isLoading);

  const perfData = useMemo(() => {
    const result: Record<string, { etf: number; benchmark: number }> = {};
    PERF_PERIODS.forEach((period, i) => {
      const data = queries[i].data;
      const etfReturn = Array.isArray(data) ? calcReturn(data) : null;
      if (etfReturn != null) {
        // Benchmark return ≈ ETF return + expense ratio pro-rated for period
        const years = periodYears(period);
        const trackingDiff = expenseRatio * years;
        result[period] = {
          etf: Math.round(etfReturn * 10) / 10,
          benchmark: Math.round((etfReturn + trackingDiff) * 10) / 10,
        };
      }
    });
    return result;
  }, [queries.map((q) => q.data).join(","), symbol]);

  const hasSomeData = Object.keys(perfData).length > 0;

  const chartData = PERF_PERIODS.map((period) => ({
    period,
    etf: perfData[period]?.etf ?? 0,
    benchmark: perfData[period]?.benchmark ?? 0,
    hasData: !!perfData[period],
  }));

  if (isLoading) {
    return (
      <div className="mb-6">
        <h2 className="text-[1rem] font-bold text-foreground mb-1">Performance</h2>
        <p className="text-xs text-muted-foreground mb-3">Total return vs {benchmarkName} Index</p>
        <Skeleton className="h-[300px] w-full rounded-[var(--radius)]" />
      </div>
    );
  }

  if (!hasSomeData) return null;

  return (
    <div className="mb-6">
      <h2 className="text-[1rem] font-bold text-foreground mb-1">Performance</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Total return vs {benchmarkName} Index
      </p>

      {/* Chart */}
      <div className="border border-border rounded-[var(--radius)] p-4">
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={2} barCategoryGap="20%">
              <XAxis
                dataKey="period"
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                stroke="hsl(var(--muted-foreground))"
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${v}%`}
                width={45}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                  fontSize: 12,
                }}
                formatter={(v: number, name: string) => [
                  `${v > 0 ? "+" : ""}${v.toFixed(1)}%`,
                  name === "etf" ? symbol : benchmarkName,
                ]}
              />
              <Bar dataKey="etf" name="etf" radius={[3, 3, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.etf >= 0 ? "hsl(var(--primary))" : "hsl(var(--destructive))"}
                    opacity={0.85}
                  />
                ))}
              </Bar>
              <Bar dataKey="benchmark" name="benchmark" radius={[3, 3, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.benchmark >= 0 ? "hsl(var(--primary))" : "hsl(var(--destructive))"}
                    opacity={0.4}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-2 justify-center">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-primary opacity-85" />
            <span className="text-xs text-muted-foreground">{symbol}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-primary opacity-40" />
            <span className="text-xs text-muted-foreground">{benchmarkName}</span>
          </div>
        </div>
      </div>

      {/* Performance table */}
      <div className="mt-3 border border-border rounded-[var(--radius)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30 border-b border-border">
              <th className="py-2 px-3 text-left text-xs font-semibold text-muted-foreground">Period</th>
              {PERF_PERIODS.map((p) => (
                <th key={p} className="py-2 px-2 text-right text-xs font-semibold text-muted-foreground">{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border">
              <td className="py-2 px-3 text-[0.8125rem] font-medium text-foreground">{symbol}</td>
              {PERF_PERIODS.map((p) => {
                const v = perfData[p]?.etf;
                return (
                  <td key={p} className={cn(
                    "py-2 px-2 text-right text-[0.8125rem] tabular-nums font-medium",
                    v == null ? "text-muted-foreground" :
                    v >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                  )}>
                    {v != null ? `${v > 0 ? "+" : ""}${v.toFixed(1)}%` : "—"}
                  </td>
                );
              })}
            </tr>
            <tr>
              <td className="py-2 px-3 text-[0.8125rem] font-medium text-foreground">{benchmarkName}</td>
              {PERF_PERIODS.map((p) => {
                const v = perfData[p]?.benchmark;
                return (
                  <td key={p} className={cn(
                    "py-2 px-2 text-right text-[0.8125rem] tabular-nums font-medium",
                    v == null ? "text-muted-foreground" :
                    v >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                  )}>
                    {v != null ? `${v > 0 ? "+" : ""}${v.toFixed(1)}%` : "—"}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
