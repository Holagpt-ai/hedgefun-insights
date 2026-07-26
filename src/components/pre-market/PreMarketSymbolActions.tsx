import { Link } from "react-router-dom";
import { Bot, CalendarClock, LineChart, NotebookPen, Star } from "lucide-react";
import { symbolRoutes } from "@/lib/pre-market/builders";

/**
 * Pre-Market-only symbol action row. Intentionally isolated from the locked
 * Action Center SymbolActions component.
 */
export function PreMarketSymbolActions({ symbol }: { symbol: string }) {
  const routes = symbolRoutes(symbol);
  if (!routes) return null;

  const items = [
    { to: routes.ai, label: "AI Analyst", Icon: Bot },
    { to: routes.catalyst, label: "Catalyst", Icon: CalendarClock },
    { to: routes.watchlist, label: "Watchlist", Icon: Star },
    { to: routes.journal, label: "Journal", Icon: NotebookPen },
    { to: routes.stock, label: "Chart", Icon: LineChart },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map(({ to, label, Icon }) => (
        <Link
          key={label}
          to={to}
          aria-label={`${label} for ${routes.symbol}`}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/30"
        >
          <Icon className="h-3 w-3" />
          <span>{label}</span>
        </Link>
      ))}
    </div>
  );
}
