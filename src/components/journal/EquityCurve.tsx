import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

type Snap = { snapshot_date: string; cumulative_pnl: number };
type Range = "30D" | "90D" | "ALL";

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const fmtUsd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

export default function EquityCurve({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<Snap[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("ALL");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id;
      if (!uid) {
        if (!cancelled) {
          setData([]);
          setLoading(false);
        }
        return;
      }
      const { data: rows } = await supabase
        .from("journal_equity_snapshots")
        .select("snapshot_date, cumulative_pnl")
        .eq("user_id", uid)
        .order("snapshot_date", { ascending: true });
      if (cancelled) return;
      setData(
        (rows ?? []).map((r: any) => ({
          snapshot_date: r.snapshot_date,
          cumulative_pnl: Number(r.cumulative_pnl ?? 0),
        })),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const filtered = useMemo(() => {
    if (range === "ALL" || data.length === 0) return data;
    const days = range === "30D" ? 30 : 90;
    const cutoff = Date.now() - days * 86400_000;
    return data.filter((d) => new Date(d.snapshot_date).getTime() >= cutoff);
  }, [data, range]);

  const isEmpty = filtered.length === 0;
  const chartData = isEmpty
    ? [
        { snapshot_date: new Date(Date.now() - 7 * 86400_000).toISOString(), cumulative_pnl: 0 },
        { snapshot_date: new Date().toISOString(), cumulative_pnl: 0 },
      ]
    : filtered;

  return (
    <div className="bg-surface-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Equity Curve</h3>
        <div className="flex gap-1">
          {(["30D", "90D", "ALL"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                range === r
                  ? "bg-accent-blue text-primary-foreground border-transparent"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="h-48 relative">
        {loading ? (
          <Skeleton className="w-full h-full" />
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="snapshot_date"
                  tickFormatter={fmtDate}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={fmtUsd}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--surface-card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(v) => fmtDate(String(v))}
                  formatter={(v: any) => [fmtUsd(Number(v)), "Cumulative P&L"]}
                />
                <Line
                  type="monotone"
                  dataKey="cumulative_pnl"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
            {isEmpty && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-xs text-muted-foreground bg-surface-card/80 px-2 py-1 rounded">
                  No trades logged yet
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
