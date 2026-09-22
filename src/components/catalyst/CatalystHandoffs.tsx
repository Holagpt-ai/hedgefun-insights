import { Link } from "react-router-dom";
import { LayoutGrid, NotebookPen, Radar, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildRepeatMoverWorkflowHandoffs } from "@/lib/radar/radar-repeat-mover-handoffs";
import type { SecurityId } from "@/types/security-identity";

export function CatalystHandoffs({
  symbol,
  securityId,
}: {
  symbol: string;
  securityId?: SecurityId | null;
}) {
  const routes = buildRepeatMoverWorkflowHandoffs(symbol, securityId ?? null);
  const actions = [
    { to: routes.aiAnalyst, label: "Ask AI", icon: Sparkles },
    { to: routes.watchlist, label: "Add to Watchlist", icon: Star },
    { to: routes.journal, label: "Open Journal", icon: NotebookPen },
    { to: "/dashboard/screeners", label: "View in Screeners", icon: LayoutGrid },
    { to: routes.actionCenter, label: "Action Center", icon: Radar },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {actions.map((action) => (
        <Button
          key={action.label}
          asChild
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={(event) => event.stopPropagation()}
        >
          <Link to={action.to}>
            <action.icon className="h-3 w-3" />
            {action.label}
          </Link>
        </Button>
      ))}
    </div>
  );
}
