import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import {
  formatPriceReturn,
  type EtfPerformanceModel,
} from "@/lib/etf/price-performance";

interface Props {
  symbol: string;
  status: "loading" | "error" | "ready";
  model: EtfPerformanceModel | null;
}

export function EtfPerformanceChart({ symbol, status, model }: Props) {
  if (status === "loading") {
    return (
      <div className="mb-6" data-testid="etf-performance">
        <h2 className="text-[1rem] font-bold text-foreground mb-1">Performance</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Close-to-close price return. Not a dividend-adjusted total return.
        </p>
        <Skeleton className="h-[300px] w-full rounded-[var(--radius)]" />
      </div>
    );
  }

  const periods = model?.periods ?? [];
  const chartData = periods
    .filter((period) => period.displayPercent !== null)
    .map((period) => ({
      period: period.period,
      etf: period.displayPercent as number,
      benchmark: period.benchmarkDisplayPercent,
    }));
  const showBenchmark = Boolean(model?.hasAnyBenchmarkReturn);
  const showChart = status === "ready" && chartData.length > 0;

  return (
    <div className="mb-6" data-testid="etf-performance">
      <h2 className="text-[1rem] font-bold text-foreground mb-1">Performance</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Close-to-close price return. Not a dividend-adjusted total return.
      </p>
      {!showChart && (
        <p className="text-sm text-muted-foreground mb-3">Historical performance unavailable</p>
      )}

      {showChart && (
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
                  tickFormatter={(value: number) => `${value}%`}
                  width={45}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                    fontSize: 12,
                  }}
                  formatter={(value, name) => [
                    formatPriceReturn(typeof value === "number" ? value : null),
                    name === "benchmark" ? "Benchmark price return" : symbol,
                  ]}
                />
                <Bar dataKey="etf" name="etf" radius={[3, 3, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell
                      key={entry.period}
                      fill={entry.etf >= 0 ? "hsl(var(--primary))" : "hsl(var(--destructive))"}
                      opacity={0.85}
                    />
                  ))}
                </Bar>
                {showBenchmark && (
                  <Bar dataKey="benchmark" name="benchmark" radius={[3, 3, 0, 0]}>
                    {chartData.map((entry) => (
                      <Cell
                        key={`${entry.period}-b`}
                        fill={entry.benchmark != null && entry.benchmark < 0 ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
                        opacity={0.4}
                      />
                    ))}
                  </Bar>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-2 justify-center">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-primary opacity-85" />
              <span className="text-xs text-muted-foreground">{symbol} price return</span>
            </div>
            {showBenchmark && (
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-primary opacity-40" />
                <span className="text-xs text-muted-foreground">Benchmark price return</span>
              </div>
            )}
          </div>
        </div>
      )}

      {status === "ready" && periods.length > 0 && (
        <div className="mt-3 border border-border rounded-[var(--radius)] overflow-x-auto">
          <table className="w-full text-sm min-w-[36rem]">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="py-2 px-3 text-left text-xs font-semibold text-muted-foreground">Period</th>
                {periods.map((period) => (
                  <th key={period.period} className="py-2 px-2 text-right text-xs font-semibold text-muted-foreground">
                    {period.period}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className={showBenchmark ? "border-b border-border" : undefined}>
                <td className="py-2 px-3 text-[0.8125rem] font-medium text-foreground">{symbol}</td>
                {periods.map((period) => (
                  <td
                    key={period.period}
                    className={cn(
                      "py-2 px-2 text-right text-[0.8125rem] tabular-nums font-medium",
                      period.displayPercent == null
                        ? "text-muted-foreground"
                        : period.displayPercent >= 0
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400",
                    )}
                  >
                    {formatPriceReturn(period.displayPercent)}
                  </td>
                ))}
              </tr>
              {showBenchmark && (
                <tr>
                  <td className="py-2 px-3 text-[0.8125rem] font-medium text-foreground">Benchmark</td>
                  {periods.map((period) => (
                    <td
                      key={period.period}
                      className={cn(
                        "py-2 px-2 text-right text-[0.8125rem] tabular-nums font-medium",
                        period.benchmarkDisplayPercent == null
                          ? "text-muted-foreground"
                          : period.benchmarkDisplayPercent >= 0
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400",
                      )}
                    >
                      {formatPriceReturn(period.benchmarkDisplayPercent)}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
