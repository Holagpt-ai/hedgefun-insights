import { Bell, Activity, Calendar, BookOpen } from "lucide-react";
import type { SummaryCounts } from "@/types/action-center";

export function SummaryCards({ counts }: { counts: SummaryCounts }) {
  const items = [
    { label: "Watchlist Alerts", value: counts.watchlistAlerts, icon: Bell, tone: "text-accent-blue" },
    { label: "Unusual Activity", value: counts.unusualActivity, icon: Activity, tone: "text-amber-600" },
    { label: "Catalyst Events", value: counts.catalystEvents, icon: Calendar, tone: "text-emerald-600" },
    { label: "Open Trades", value: counts.openTrades, icon: BookOpen, tone: "text-orange-600" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((s) => {
        const Icon = s.icon;
        return (
          <div key={s.label} className="rounded-xl border bg-card p-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-muted ${s.tone}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
