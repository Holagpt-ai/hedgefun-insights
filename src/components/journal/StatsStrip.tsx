import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

type Stats = {
  wins: number;
  losses: number;
  wash_trades: number;
  total_pnl: number;
  win_rate: number;
  total_trades: number;
};

const ZERO: Stats = {
  wins: 0,
  losses: 0,
  wash_trades: 0,
  total_pnl: 0,
  win_rate: 0,
  total_trades: 0,
};

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

export default function StatsStrip({ refreshKey = 0 }: { refreshKey?: number }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id;
      if (!uid) {
        if (!cancelled) {
          setStats(ZERO);
          setLoading(false);
        }
        return;
      }
      const { data } = await supabase
        .from("journal_stats_cache")
        .select("wins, losses, wash_trades, total_pnl, win_rate, total_trades")
        .eq("user_id", uid)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setStats(
        data
          ? {
              wins: Number(data.wins ?? 0),
              losses: Number(data.losses ?? 0),
              wash_trades: Number(data.wash_trades ?? 0),
              total_pnl: Number(data.total_pnl ?? 0),
              win_rate: Number(data.win_rate ?? 0),
              total_trades: Number(data.total_trades ?? 0),
            }
          : ZERO,
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-surface-card p-4 flex gap-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex-1 space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-24" />
          </div>
        ))}
      </div>
    );
  }

  const s = stats ?? ZERO;
  const winRatePct = (s.win_rate * 100).toFixed(1);
  const lossRatePct =
    s.total_trades > 0 ? ((s.losses / s.total_trades) * 100).toFixed(1) : "0.0";
  const pnlPositive = s.total_pnl >= 0;

  return (
    <div className="rounded-xl border border-border bg-surface-card p-4 flex flex-wrap gap-6">
      <Tile label="WINS" value={`${s.wins} · ${winRatePct}%`} className="text-emerald-500" />
      <Tile label="LOSSES" value={`${s.losses} · ${lossRatePct}%`} className="text-red-500" />
      <Tile label="WASH" value={`${s.wash_trades}`} className="text-yellow-500" />
      <Tile
        label="TOTAL P&L"
        value={fmtCurrency(s.total_pnl)}
        className={pnlPositive ? "text-emerald-500" : "text-red-500"}
      />
    </div>
  );
}

function Tile({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex-1 min-w-[120px]">
      <div className="text-xs text-muted-foreground tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${className ?? "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}
