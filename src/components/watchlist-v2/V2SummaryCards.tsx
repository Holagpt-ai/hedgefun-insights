import type { V2Row } from "@/hooks/useWatchlistV2";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Activity, Newspaper } from "lucide-react";

interface Props {
  rows: V2Row[];
}

export function V2SummaryCards({ rows }: Props) {
  const bullish = rows.filter((r) => r.hasV2 && r.direction === "bullish").length;
  const bearish = rows.filter((r) => r.hasV2 && r.direction === "bearish").length;
  const unusual = rows.filter((r) => r.hasV2 && r.rvolClass === "unusual").length;
  const withEvents = rows.filter(
    (r) => r.hasV2 && r.recentEvents.length > 0,
  ).length;

  const cards = [
    { label: "Bullish", value: bullish, icon: TrendingUp, tone: "text-emerald-600" },
    { label: "Bearish", value: bearish, icon: TrendingDown, tone: "text-red-600" },
    { label: "Unusual Activity", value: unusual, icon: Activity, tone: "text-amber-600" },
    { label: "Recent News & Events", value: withEvents, icon: Newspaper, tone: "text-blue-600" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card key={c.label} className="p-4 flex items-center gap-3">
            <Icon className={`h-5 w-5 ${c.tone}`} aria-hidden />
            <div>
              <div className="text-2xl font-semibold tabular-nums">{c.value}</div>
              <div className="text-xs text-muted-foreground">{c.label}</div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
