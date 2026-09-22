import { Link } from "react-router-dom";
import { Bot, CalendarClock, LayoutDashboard, LineChart, MoreHorizontal, NotebookPen, Star } from "lucide-react";
import { touchWorkflowHandoff, workflowSymbolRoutes } from "@/lib/historical-workflow/workflow-symbol-routes";
import type { SecurityId } from "@/types/security-identity";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Pre-Market-only symbol action row. Intentionally isolated from the locked
 * Action Center SymbolActions component.
 * Mobile: AI Analyst + Chart stay primary; Catalyst / Watchlist / Journal sit in More.
 */
export function PreMarketSymbolActions({
  symbol,
  securityId = null,
}: {
  symbol: string;
  securityId?: SecurityId | null;
}) {
  const routes = workflowSymbolRoutes(symbol, { securityId });
  if (!routes) return null;

  const touch = () => touchWorkflowHandoff(routes.symbol, "inbox");

  const primary = [
    { to: routes.ai, label: "AI Analyst", Icon: Bot },
    { to: routes.chart, label: "Chart", Icon: LineChart },
  ];
  const overflow = [
    { to: routes.catalyst, label: "Catalyst", Icon: CalendarClock },
    { to: routes.watchlist, label: "Watchlist", Icon: Star },
    { to: routes.journal, label: "Journal", Icon: NotebookPen },
    { to: routes.actionCenter, label: "Action Center", Icon: LayoutDashboard },
  ];

  const chip = (to: string, label: string, Icon: typeof Bot, className = "") => (
    <Link
      key={label}
      to={to}
      onClick={touch}
      aria-label={`${label} for ${routes.symbol}`}
      className={`inline-flex min-h-8 min-w-8 items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/30 ${className}`}
    >
      <Icon className="h-3 w-3" />
      <span>{label}</span>
    </Link>
  );

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {primary.map(({ to, label, Icon }) => chip(to, label, Icon))}
      {overflow.map(({ to, label, Icon }) => chip(to, label, Icon, "hidden md:inline-flex"))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`More actions for ${routes.symbol}`}
            className="inline-flex min-h-8 min-w-8 items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/30 md:hidden"
          >
            <MoreHorizontal className="h-3 w-3" />
            <span>More</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[10rem]">
          {overflow.map(({ to, label, Icon }) => (
            <DropdownMenuItem key={label} asChild>
              <Link to={to} onClick={touch} aria-label={`${label} for ${routes.symbol}`} className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
