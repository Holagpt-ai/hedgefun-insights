import { useState } from "react";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const PERF_PERIODS = ["1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y"] as const;

const PERFORMANCE_DATA: Record<string, Record<string, { etf: number; benchmark: number }>> = {
  SPY: {
    "1M": { etf: -2.1, benchmark: -2.0 },
    "3M": { etf: -4.8, benchmark: -4.7 },
    "6M": { etf: -1.2, benchmark: -1.1 },
    "YTD": { etf: -3.6, benchmark: -3.5 },
    "1Y": { etf: 8.4, benchmark: 8.5 },
    "3Y": { etf: 28.6, benchmark: 28.9 },
    "5Y": { etf: 89.2, benchmark: 89.8 },
  },
  QQQ: {
    "1M": { etf: -3.4, benchmark: -3.3 },
    "3M": { etf: -7.2, benchmark: -7.1 },
    "6M": { etf: -2.8, benchmark: -2.7 },
    "YTD": { etf: -5.4, benchmark: -5.3 },
    "1Y": { etf: 6.2, benchmark: 6.4 },
    "3Y": { etf: 32.4, benchmark: 32.8 },
    "5Y": { etf: 112.6, benchmark: 113.2 },
  },
  DIA: {
    "1M": { etf: -1.6, benchmark: -1.5 },
    "3M": { etf: -2.4, benchmark: -2.3 },
    "6M": { etf: 0.8, benchmark: 0.9 },
    "YTD": { etf: -1.8, benchmark: -1.7 },
    "1Y": { etf: 7.6, benchmark: 7.8 },
    "3Y": { etf: 24.2, benchmark: 24.6 },
    "5Y": { etf: 68.4, benchmark: 69.0 },
  },
  IWM: {
    "1M": { etf: -4.8, benchmark: -4.7 },
    "3M": { etf: -9.6, benchmark: -9.4 },
    "6M": { etf: -8.2, benchmark: -8.0 },
    "YTD": { etf: -8.4, benchmark: -8.2 },
    "1Y": { etf: -4.6, benchmark: -4.4 },
    "3Y": { etf: 4.8, benchmark: 5.2 },
    "5Y": { etf: 42.6, benchmark: 43.4 },
  },
};

const BENCHMARK_NAMES: Record<string, string> = {
  SPY: "S&P 500",
  QQQ: "Nasdaq-100",
  DIA: "DJIA",
  IWM: "Russell 2000",
};

interface Props {
  symbol: string;
}

export function EtfPerformanceChart({ symbol }: Props) {
  const perfData = PERFORMANCE_DATA[symbol];
  if (!perfData) return null;

  const benchmarkName = BENCHMARK_NAMES[symbol] ?? "Benchmark";

  const chartData = PERF_PERIODS.map((period) => ({
    period,
    etf: perfData[period]?.etf ?? 0,
    benchmark: perfData[period]?.benchmark ?? 0,
  }));

  return (
    <div className="mb-6">
      <h2 className="text-[1rem] font-bold text-foreground mb-1">
        Performance
      </h2>
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
                const v = perfData[p]?.etf ?? 0;
                return (
                  <td key={p} className={cn(
                    "py-2 px-2 text-right text-[0.8125rem] tabular-nums font-medium",
                    v >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                  )}>
                    {v > 0 ? "+" : ""}{v.toFixed(1)}%
                  </td>
                );
              })}
            </tr>
            <tr>
              <td className="py-2 px-3 text-[0.8125rem] font-medium text-foreground">{benchmarkName}</td>
              {PERF_PERIODS.map((p) => {
                const v = perfData[p]?.benchmark ?? 0;
                return (
                  <td key={p} className={cn(
                    "py-2 px-2 text-right text-[0.8125rem] tabular-nums font-medium",
                    v >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                  )}>
                    {v > 0 ? "+" : ""}{v.toFixed(1)}%
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
