import { Link } from "react-router-dom";
import { Brain, Calendar, LayoutDashboard, SlidersHorizontal, Star } from "lucide-react";
import {
  touchWorkflowHandoff,
  workflowSymbolRoutes,
} from "@/lib/historical-workflow/workflow-symbol-routes";

const chipClass =
  "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-muted text-muted-foreground hover:text-foreground hover:bg-accent-blue-light transition-colors min-h-8";

/** Outbound connected-workflow links from a journal trade symbol (English labels — trading surface). */
export function JournalTradeWorkflowLinks({ symbol }: { symbol: string }) {
  const routes = workflowSymbolRoutes(symbol);
  if (!routes) return null;

  const touch = () => touchWorkflowHandoff(routes.symbol, "journal");

  return (
    <div className="flex flex-wrap gap-1.5" data-testid="journal-trade-workflow-links">
      <Link to={routes.ai} onClick={touch} className={chipClass} aria-label={`AI Analyst for ${routes.symbol}`}>
        <Brain className="h-3 w-3" /> AI Analyst
      </Link>
      <Link to={routes.catalyst} onClick={touch} className={chipClass} aria-label={`Catalyst for ${routes.symbol}`}>
        <Calendar className="h-3 w-3" /> Catalyst
      </Link>
      <Link to={routes.watchlist} onClick={touch} className={chipClass} aria-label={`Watchlist for ${routes.symbol}`}>
        <Star className="h-3 w-3" /> Watchlist
      </Link>
      <Link
        to="/dashboard/screeners"
        onClick={touch}
        className={chipClass}
        aria-label="Screeners"
      >
        <SlidersHorizontal className="h-3 w-3" /> Screeners
      </Link>
      <Link to={routes.actionCenter} onClick={touch} className={chipClass} aria-label="Action Center">
        <LayoutDashboard className="h-3 w-3" /> Action Center
      </Link>
    </div>
  );
}
