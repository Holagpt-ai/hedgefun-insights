import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import { TrendingUp, TrendingDown, Target, DollarSign, BarChart3, Calendar } from "lucide-react";
import type { Trade, TradeTag } from "@/hooks/useJournalTrades";

interface Props {
  trades: Trade[];
  tags: TradeTag[];
  tagAssignments: { trade_id: string; tag_id: string }[];
}

function StatCard({ icon: Icon, label, value, sub, positive }: { icon: typeof TrendingUp; label: string; value: string; sub?: string; positive?: boolean | null }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-xl font-bold tabular-nums ${positive === true ? "text-[hsl(var(--green))]" : positive === false ? "text-[hsl(var(--red))]" : "text-foreground"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export function JournalAnalytics({ trades, tags, tagAssignments }: Props) {
  const closedTrades = useMemo(() => trades.filter((t) => t.status === "closed" && t.pnl != null), [trades]);

  const stats = useMemo(() => {
    if (closedTrades.length === 0) return null;
    const wins = closedTrades.filter((t) => (t.pnl ?? 0) > 0);
    const losses = closedTrades.filter((t) => (t.pnl ?? 0) < 0);
    const totalPnl = closedTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + (t.pnl ?? 0), 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0) / losses.length) : 0;
    const winRate = (wins.length / closedTrades.length) * 100;
    const profitFactor = avgLoss > 0 ? (wins.reduce((s, t) => s + (t.pnl ?? 0), 0)) / Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0)) : Infinity;
    const bestTrade = Math.max(...closedTrades.map((t) => t.pnl ?? 0));
    const worstTrade = Math.min(...closedTrades.map((t) => t.pnl ?? 0));

    return { totalPnl, winRate, wins: wins.length, losses: losses.length, avgWin, avgLoss, profitFactor, bestTrade, worstTrade, totalTrades: closedTrades.length };
  }, [closedTrades]);

  // Cumulative P&L chart data
  const equityCurve = useMemo(() => {
    const sorted = [...closedTrades].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
    let cum = 0;
    return sorted.map((t) => {
      cum += t.pnl ?? 0;
      return { date: t.entry_date, pnl: cum };
    });
  }, [closedTrades]);

  // Tag breakdown
  const tagBreakdown = useMemo(() => {
    const tagMap = new Map<string, { name: string; color: string; pnl: number; count: number }>();
    tags.forEach((t) => tagMap.set(t.id, { name: t.name, color: t.color, pnl: 0, count: 0 }));
    closedTrades.forEach((trade) => {
      const tradeTagIds = tagAssignments.filter((a) => a.trade_id === trade.id).map((a) => a.tag_id);
      tradeTagIds.forEach((tagId) => {
        const entry = tagMap.get(tagId);
        if (entry) {
          entry.pnl += trade.pnl ?? 0;
          entry.count++;
        }
      });
    });
    return Array.from(tagMap.values()).filter((t) => t.count > 0).sort((a, b) => b.pnl - a.pnl);
  }, [closedTrades, tags, tagAssignments]);

  const fmtCurrency = (v: number) => `${v >= 0 ? "+" : ""}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (!stats) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-lg font-semibold mb-1">No closed trades yet</p>
        <p className="text-sm">Close some trades to see your performance analytics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={DollarSign} label="Total P&L" value={fmtCurrency(stats.totalPnl)} positive={stats.totalPnl >= 0} sub={`${stats.totalTrades} closed trades`} />
        <StatCard icon={Target} label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} positive={stats.winRate >= 50} sub={`${stats.wins}W / ${stats.losses}L`} />
        <StatCard icon={TrendingUp} label="Avg Win" value={fmtCurrency(stats.avgWin)} positive={true} sub={`Best: ${fmtCurrency(stats.bestTrade)}`} />
        <StatCard icon={TrendingDown} label="Avg Loss" value={fmtCurrency(-stats.avgLoss)} positive={false} sub={`Worst: ${fmtCurrency(stats.worstTrade)}`} />
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard icon={BarChart3} label="Profit Factor" value={stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)} positive={stats.profitFactor > 1} />
        <StatCard icon={Calendar} label="Open Trades" value={String(trades.filter((t) => t.status === "open").length)} />
        <StatCard icon={Target} label="R-Multiple" value={(stats.avgLoss > 0 ? (stats.avgWin / stats.avgLoss).toFixed(2) : "—")} positive={stats.avgLoss > 0 ? stats.avgWin / stats.avgLoss > 1 : null} sub="Avg Win / Avg Loss" />
      </div>

      {/* Equity Curve */}
      {equityCurve.length > 1 && (
        <div className="border border-border rounded-lg p-4 bg-card">
          <h3 className="text-sm font-semibold text-foreground mb-3">Cumulative P&L</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={equityCurve}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "P&L"]} />
              <Area type="monotone" dataKey="pnl" stroke="hsl(var(--accent-blue))" fill="hsl(var(--accent-blue-light))" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tag Breakdown */}
      {tagBreakdown.length > 0 && (
        <div className="border border-border rounded-lg p-4 bg-card">
          <h3 className="text-sm font-semibold text-foreground mb-3">P&L by Tag</h3>
          <ResponsiveContainer width="100%" height={Math.max(150, tagBreakdown.length * 40)}>
            <BarChart data={tagBreakdown} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v}`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" width={100} />
              <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "P&L"]} />
              <Bar dataKey="pnl" radius={[0, 4, 4, 0]}>
                {tagBreakdown.map((entry, i) => (
                  <Cell key={i} fill={entry.pnl >= 0 ? "hsl(var(--green))" : "hsl(var(--red))"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
