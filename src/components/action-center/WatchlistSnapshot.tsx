import { Link } from "react-router-dom";
import type { WatchlistSnapshot as Snap } from "@/types/action-center";

export function WatchlistSnapshot({ snapshot }: { snapshot: Snap }) {
  const items = [
    { label: "Bullish", value: snapshot.bullish, tone: "text-emerald-600" },
    { label: "Bearish", value: snapshot.bearish, tone: "text-red-600" },
    { label: "Neutral", value: snapshot.neutral, tone: "text-muted-foreground" },
    { label: "Data Unavailable", value: snapshot.dataUnavailable, tone: "text-amber-600" },
    { label: "Awaiting Refresh", value: snapshot.awaitingRefresh, tone: "text-slate-500" },
  ];
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Watchlist Snapshot
        </div>
        <Link to="/dashboard/watchlist" className="text-xs font-medium text-accent-blue hover:underline">
          Open Watchlist →
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {items.map((i) => (
          <div key={i.label} className="rounded-lg bg-muted/40 p-3">
            <div className={`text-xl font-bold ${i.tone}`}>{i.value}</div>
            <div className="text-[11px] text-muted-foreground">{i.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
